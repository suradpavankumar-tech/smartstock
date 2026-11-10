from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context, record_audit_log
from app.models.cash_shift import CashShift
from app.models.anomaly import AnomalyAlert, AnomalySeverityEnum, AnomalyStatusEnum
from app.models.expense import Expense
from app.models.invoice import Invoice, InvoiceStatusEnum, PaymentMethodEnum, SalesReturn
from app.schemas.cash_shift import CashShiftClose, CashShiftOpen, CashShiftOut

router = APIRouter(prefix="/cash-drawer", tags=["Cash Drawer"])


def _open_shift(db: Session, ctx: TenantContext) -> Optional[CashShift]:
    return (
        db.query(CashShift)
        .filter(
            CashShift.business_id == ctx.business.id,
            CashShift.user_id == ctx.user.id,
            CashShift.status == "OPEN",
        )
        .order_by(CashShift.opened_at.desc())
        .first()
    )


def _live_totals(db: Session, shift: CashShift) -> tuple[float, float, float, float]:
    cash_sales = db.query(func.coalesce(func.sum(Invoice.total_amount), 0.0)).filter(
        Invoice.business_id == shift.business_id,
        Invoice.payment_method == PaymentMethodEnum.CASH,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
        Invoice.created_by_user_id == shift.user_id,
        Invoice.created_at >= shift.opened_at,
    ).scalar() or 0.0

    cash_expenses = db.query(func.coalesce(func.sum(Expense.amount), 0.0)).filter(
        Expense.business_id == shift.business_id,
        func.upper(Expense.payment_method) == "CASH",
        Expense.created_by_user_id == shift.user_id,
        Expense.created_at >= shift.opened_at,
    ).scalar() or 0.0

    cash_refunds = db.query(func.coalesce(func.sum(SalesReturn.refund_amount), 0.0)).join(
        Invoice, Invoice.id == SalesReturn.invoice_id
    ).filter(
        SalesReturn.business_id == shift.business_id,
        SalesReturn.created_by_user_id == shift.user_id,
        Invoice.business_id == shift.business_id,
        Invoice.payment_method == PaymentMethodEnum.CASH,
        SalesReturn.created_at >= shift.opened_at,
    ).scalar() or 0.0

    expected = round(shift.opening_float + cash_sales - cash_expenses - cash_refunds, 2)
    return round(float(cash_sales), 2), round(float(cash_expenses), 2), round(float(cash_refunds), 2), expected


def _shift_snapshot(db: Session, shift: CashShift) -> CashShiftOut:
    sales, expenses, refunds, expected = _live_totals(db, shift)
    return CashShiftOut(
        id=shift.id,
        business_id=shift.business_id,
        user_id=shift.user_id,
        opening_float=shift.opening_float,
        cash_sales=sales,
        cash_expenses=expenses,
        cash_refunds=refunds,
        expected_cash=expected,
        counted_cash=shift.counted_cash,
        variance=shift.variance,
        status=shift.status,
        opened_at=shift.opened_at,
        closed_at=shift.closed_at,
    )


@router.post("/open", response_model=CashShiftOut, status_code=status.HTTP_201_CREATED)
def open_cash_shift(
    data: CashShiftOpen,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    if _open_shift(db, ctx):
        raise HTTPException(status_code=409, detail="A cash shift is already open for this user")

    shift = CashShift(
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        opening_float=round(data.opening_float, 2),
        expected_cash=round(data.opening_float, 2),
        status="OPEN",
        opened_at=datetime.utcnow(),
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    record_audit_log(db, ctx.business.id, ctx.user.id, "OPEN_CASH_SHIFT", "cash_shift", str(shift.id), {"opening_float": shift.opening_float})
    return _shift_snapshot(db, shift)


@router.get("/current", response_model=Optional[CashShiftOut])
def current_cash_shift(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    shift = _open_shift(db, ctx)
    return _shift_snapshot(db, shift) if shift else None


@router.post("/close", response_model=CashShiftOut)
def close_cash_shift(
    data: CashShiftClose,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    shift = _open_shift(db, ctx)
    if not shift:
        raise HTTPException(status_code=404, detail="There is no open cash shift for this user")

    sales, expenses, refunds, expected = _live_totals(db, shift)
    shift.cash_sales = sales
    shift.cash_expenses = expenses
    shift.cash_refunds = refunds
    shift.expected_cash = expected
    shift.counted_cash = round(data.counted_cash, 2)
    shift.variance = round(shift.counted_cash - expected, 2)
    shift.status = "CLOSED"
    shift.closed_at = datetime.utcnow()
    if abs(shift.variance) >= 0.01:
        db.add(AnomalyAlert(
            business_id=ctx.business.id,
            alert_type="CASH_DRAWER_VARIANCE",
            severity=AnomalySeverityEnum.HIGH if abs(shift.variance) >= 500 else AnomalySeverityEnum.MEDIUM,
            description=f"Cash shift {shift.id} closed with a variance of ₹{shift.variance:.2f} (expected ₹{expected:.2f}, counted ₹{shift.counted_cash:.2f}).",
            entity_type="cash_shift",
            entity_id=str(shift.id),
            status=AnomalyStatusEnum.PENDING_REVIEW,
        ))
    db.commit()
    db.refresh(shift)
    record_audit_log(
        db,
        ctx.business.id,
        ctx.user.id,
        "CLOSE_CASH_SHIFT",
        "cash_shift",
        str(shift.id),
        {"expected_cash": expected, "counted_cash": shift.counted_cash, "variance": shift.variance},
    )
    return _shift_snapshot(db, shift)
