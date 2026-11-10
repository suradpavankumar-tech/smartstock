from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import datetime

from app.database import get_db
from app.models.reconciliation import (
    StockReconciliationSession,
    StockReconciliationItem,
    ReconciliationStatusEnum
)
from app.models.product import Product
from app.models.business import RoleEnum
from app.models.inventory import MovementTypeEnum
from app.schemas.reconciliation import (
    ReconciliationSessionCreate,
    ReconciliationItemInput,
    ReconciliationSessionOut,
    ReconciliationDetailOut,
    ReconciliationItemOut
)
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.inventory_service import record_stock_movement

router = APIRouter(prefix="/reconciliation", tags=["Stock Reconciliation"])

@router.post("/sessions", response_model=ReconciliationSessionOut)
def start_reconciliation_session(
    data: ReconciliationSessionCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    count = db.query(StockReconciliationSession).filter(
        StockReconciliationSession.business_id == ctx.business.id
    ).count() + 1
    session_code = f"REC-{datetime.utcnow().year}-{count:04d}"

    session = StockReconciliationSession(
        business_id=ctx.business.id,
        session_code=session_code,
        status=ReconciliationStatusEnum.IN_PROGRESS,
        notes=data.notes,
        created_by_user_id=ctx.user.id
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="START_RECONCILIATION_SESSION",
        entity_type="reconciliation_session",
        entity_id=str(session.id),
        details={"session_code": session_code}
    )

    out = ReconciliationSessionOut.from_orm(session)
    out.created_by_name = ctx.user.full_name
    return out

@router.get("/sessions", response_model=List[ReconciliationSessionOut])
def list_reconciliation_sessions(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    sessions = db.query(StockReconciliationSession).filter(
        StockReconciliationSession.business_id == ctx.business.id
    ).order_by(desc(StockReconciliationSession.started_at)).all()

    results = []
    for s in sessions:
        out = ReconciliationSessionOut.from_orm(s)
        out.created_by_name = s.created_by.full_name if s.created_by else None
        out.total_items_counted = len(s.items)
        out.total_variance_value = sum(item.variance_value for item in s.items)
        results.append(out)
    return results

@router.get("/sessions/{session_id}", response_model=ReconciliationDetailOut)
def get_session_detail(
    session_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    s = db.query(StockReconciliationSession).filter(
        StockReconciliationSession.id == session_id,
        StockReconciliationSession.business_id == ctx.business.id
    ).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    items_out = []
    for item in s.items:
        prod = item.product
        items_out.append(ReconciliationItemOut(
            id=item.id,
            product_id=item.product_id,
            product_name=prod.name if prod else "Unknown",
            sku=prod.sku if prod else None,
            barcode=prod.barcode if prod else None,
            unit=prod.unit if prod else "piece",
            expected_quantity=item.expected_quantity,
            counted_quantity=item.counted_quantity,
            variance_quantity=item.variance_quantity,
            unit_cost=item.unit_cost,
            variance_value=item.variance_value,
            reason_code=item.reason_code,
            adjustment_applied=item.adjustment_applied,
            notes=item.notes
        ))

    s_out = ReconciliationSessionOut.from_orm(s)
    s_out.created_by_name = s.created_by.full_name if s.created_by else None
    s_out.total_items_counted = len(items_out)
    s_out.total_variance_value = sum(i.variance_value for i in items_out)

    return ReconciliationDetailOut(session=s_out, items=items_out)

@router.post("/sessions/{session_id}/count", response_model=ReconciliationItemOut)
def record_item_count(
    session_id: int,
    data: ReconciliationItemInput,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    s = db.query(StockReconciliationSession).filter(
        StockReconciliationSession.id == session_id,
        StockReconciliationSession.business_id == ctx.business.id
    ).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if s.status != ReconciliationStatusEnum.IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not in progress")

    product = db.query(Product).filter(
        Product.id == data.product_id,
        Product.business_id == ctx.business.id
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    expected_qty = product.current_stock
    variance_qty = round(data.counted_quantity - expected_qty, 4)
    variance_val = round(variance_qty * product.purchase_cost, 2)

    # Check if item already counted in this session
    item = db.query(StockReconciliationItem).filter(
        StockReconciliationItem.session_id == s.id,
        StockReconciliationItem.product_id == product.id
    ).first()

    if item:
        item.counted_quantity = data.counted_quantity
        item.variance_quantity = variance_qty
        item.variance_value = variance_val
        item.reason_code = data.reason_code
        item.notes = data.notes
    else:
        item = StockReconciliationItem(
            session_id=s.id,
            product_id=product.id,
            expected_quantity=expected_qty,
            counted_quantity=data.counted_quantity,
            variance_quantity=variance_qty,
            unit_cost=product.purchase_cost,
            variance_value=variance_val,
            reason_code=data.reason_code,
            adjustment_applied=False,
            notes=data.notes
        )
        db.add(item)

    db.commit()
    db.refresh(item)

    return ReconciliationItemOut(
        id=item.id,
        product_id=product.id,
        product_name=product.name,
        sku=product.sku,
        barcode=product.barcode,
        unit=product.unit,
        expected_quantity=item.expected_quantity,
        counted_quantity=item.counted_quantity,
        variance_quantity=item.variance_quantity,
        unit_cost=item.unit_cost,
        variance_value=item.variance_value,
        reason_code=item.reason_code,
        adjustment_applied=item.adjustment_applied,
        notes=item.notes
    )

@router.post("/sessions/{session_id}/approve", response_model=ReconciliationSessionOut)
def approve_and_finalize_session(
    session_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER])),
    db: Session = Depends(get_db)
):
    s = db.query(StockReconciliationSession).filter(
        StockReconciliationSession.id == session_id,
        StockReconciliationSession.business_id == ctx.business.id
    ).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if s.status != ReconciliationStatusEnum.IN_PROGRESS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session already finalized")

    # Apply adjustments for each item with non-zero variance
    for item in s.items:
        if not item.adjustment_applied and item.variance_quantity != 0.0:
            record_stock_movement(
                db=db,
                business_id=ctx.business.id,
                product_id=item.product_id,
                movement_type=MovementTypeEnum.RECONCILIATION_ADJUSTMENT,
                quantity=item.variance_quantity,
                unit_cost=item.unit_cost,
                reference_type="reconciliation",
                reference_id=s.session_code,
                reason=f"Stocktake variance: {item.reason_code or 'Audit adjustment'}",
                notes=item.notes,
                user_id=ctx.user.id
            )
            item.adjustment_applied = True

    s.status = ReconciliationStatusEnum.COMPLETED
    s.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(s)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="APPROVE_RECONCILIATION_SESSION",
        entity_type="reconciliation_session",
        entity_id=str(s.id),
        details={"session_code": s.session_code, "items_adjusted": len(s.items)}
    )

    out = ReconciliationSessionOut.from_orm(s)
    out.created_by_name = s.created_by.full_name if s.created_by else None
    return out
