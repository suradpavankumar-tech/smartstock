from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional

from app.database import get_db
from app.models.purchase import PurchaseOrder, PurchaseOrderItem, POStatusEnum, Supplier
from app.models.business import RoleEnum
from app.schemas.purchase import POCreate, POOut, POItemOut, POReceiptCreate
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.purchase_service import create_purchase_order, receive_purchase_order_items

router = APIRouter(prefix="/purchases", tags=["Purchasing & Orders"])

def format_po_out(po: PurchaseOrder) -> POOut:
    items_out = []
    for item in po.items:
        items_out.append(POItemOut(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name if item.product else "Item",
            unit=item.product.unit if item.product else "piece",
            quantity_ordered=item.quantity_ordered,
            quantity_received=item.quantity_received,
            unit_cost=item.unit_cost,
            tax_rate_percent=item.tax_rate_percent,
            total_cost=item.total_cost
        ))

    return POOut(
        id=po.id,
        business_id=po.business_id,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier.name if po.supplier else "Supplier",
        supplier_phone=po.supplier.phone if po.supplier else None,
        supplier_email=po.supplier.email if po.supplier else None,
        po_number=po.po_number,
        status=po.status,
        order_date=po.order_date,
        expected_delivery_date=po.expected_delivery_date,
        received_date=po.received_date,
        subtotal=po.subtotal,
        tax_amount=po.tax_amount,
        total_amount=po.total_amount,
        notes=po.notes,
        created_at=po.created_at,
        items=items_out
    )

@router.post("/orders", response_model=POOut)
def create_order(
    data: POCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    po = create_purchase_order(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        data=data
    )

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CREATE_PURCHASE_ORDER",
        entity_type="purchase_order",
        entity_id=str(po.id),
        details={"po_number": po.po_number, "total_amount": po.total_amount}
    )

    return format_po_out(po)

@router.get("/orders", response_model=List[POOut])
def list_orders(
    status_filter: Optional[POStatusEnum] = None,
    supplier_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(PurchaseOrder).filter(PurchaseOrder.business_id == ctx.business.id)
    if status_filter:
        query = query.filter(PurchaseOrder.status == status_filter)
    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)

    pos = query.order_by(desc(PurchaseOrder.created_at)).offset(skip).limit(limit).all()
    return [format_po_out(po) for po in pos]

@router.get("/orders/{po_id}", response_model=POOut)
def get_order_detail(
    po_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.business_id == ctx.business.id
    ).first()
    if not po:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase Order not found")

    return format_po_out(po)

@router.post("/orders/{po_id}/receive", response_model=POOut)
def receive_order(
    po_id: int,
    receipt_data: POReceiptCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    updated_po = receive_purchase_order_items(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        po_id=po_id,
        data=receipt_data
    )

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="RECEIVE_PURCHASE_ORDER",
        entity_type="purchase_order",
        entity_id=str(updated_po.id),
        details={"po_number": updated_po.po_number, "status": updated_po.status.value}
    )

    return format_po_out(updated_po)
