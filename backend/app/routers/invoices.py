from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, date

from app.database import get_db
from app.models.invoice import Invoice, InvoiceItem, SalesReturn, SalesReturnItem, InvoiceStatusEnum
from app.models.business import RoleEnum
from app.schemas.invoice import InvoiceCreate, InvoiceOut, InvoiceCancelRequest, SalesReturnCreate, SalesReturnOut
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.billing_service import create_sale_invoice, cancel_sale_invoice

router = APIRouter(prefix="/invoices", tags=["Point of Sale & Invoices"])

@router.post("/", response_model=InvoiceOut)
def create_invoice(
    data: InvoiceCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    invoice = create_sale_invoice(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        data=data,
        tax_mode=ctx.business.tax_mode,
    )

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CREATE_INVOICE",
        entity_type="invoice",
        entity_id=str(invoice.id),
        details={"invoice_number": invoice.invoice_number, "total_amount": invoice.total_amount}
    )

    out = InvoiceOut.from_orm(invoice)
    out.created_by_name = ctx.user.full_name
    return out

@router.get("/", response_model=List[InvoiceOut])
def list_invoices(
    search: Optional[str] = None,
    status_filter: Optional[InvoiceStatusEnum] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Invoice).filter(Invoice.business_id == ctx.business.id)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            (Invoice.invoice_number.ilike(search_fmt)) |
            (Invoice.customer_name.ilike(search_fmt)) |
            (Invoice.customer_phone.ilike(search_fmt))
        )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)

    invoices = query.order_by(desc(Invoice.created_at)).offset(skip).limit(limit).all()

    results = []
    for inv in invoices:
        out = InvoiceOut.from_orm(inv)
        out.created_by_name = inv.created_by.full_name if inv.created_by else None
        results.append(out)
    return results

@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice_details(
    invoice_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.business_id == ctx.business.id
    ).first()

    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    out = InvoiceOut.from_orm(invoice)
    out.created_by_name = invoice.created_by.full_name if invoice.created_by else None
    return out

@router.post("/{invoice_id}/cancel", response_model=InvoiceOut)
def cancel_invoice(
    invoice_id: int,
    req: InvoiceCancelRequest,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    cancelled = cancel_sale_invoice(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        invoice_id=invoice_id,
        reason=req.reason
    )

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CANCEL_INVOICE",
        entity_type="invoice",
        entity_id=str(cancelled.id),
        details={"invoice_number": cancelled.invoice_number, "reason": req.reason}
    )

    out = InvoiceOut.from_orm(cancelled)
    out.created_by_name = cancelled.created_by.full_name if cancelled.created_by else None
    return out
