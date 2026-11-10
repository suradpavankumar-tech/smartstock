from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from pydantic import BaseModel

from app.database import get_db
from app.models.business import RoleEnum
from app.models.product import Product
from app.models.purchase import Supplier
from app.schemas.forecast import ReorderRecommendationOut
from app.schemas.purchase import POCreate, POItemCreate, POOut
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.recommendation_service import calculate_reorder_recommendations
from app.services.purchase_service import create_purchase_order

router = APIRouter(prefix="/recommendations", tags=["Replenishment Intelligence"])

class ItemOrderSpec(BaseModel):
    product_id: int
    quantity: Optional[float] = None

class ConvertRecommendationsToPORequest(BaseModel):
    supplier_id: int
    product_ids: Optional[List[int]] = None
    items: Optional[List[ItemOrderSpec]] = None
    notes: Optional[str] = None

@router.get("/", response_model=List[ReorderRecommendationOut])
def get_reorder_recommendations(
    all_items: bool = Query(True, description="Return all active items with replenishment indicators"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return calculate_reorder_recommendations(
        db=db,
        business_id=ctx.business.id,
        all_items=all_items
    )

@router.post("/convert-to-po", response_model=POOut)
def convert_to_draft_purchase_order(
    req: ConvertRecommendationsToPORequest,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    supplier = db.query(Supplier).filter(
        Supplier.id == req.supplier_id,
        Supplier.business_id == ctx.business.id
    ).first()

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supplier ID {req.supplier_id} not found for this shop"
        )

    # Collect product IDs and custom quantities if specified
    qty_overrides: Dict[int, float] = {}
    target_pids: List[int] = []

    if req.items:
        for itm in req.items:
            target_pids.append(itm.product_id)
            if itm.quantity is not None and itm.quantity > 0:
                qty_overrides[itm.product_id] = itm.quantity
    elif req.product_ids:
        target_pids = req.product_ids

    if not target_pids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please select at least one product to generate a purchase order"
        )

    # Fetch recommendations for baseline calculations
    all_recs = calculate_reorder_recommendations(db, ctx.business.id, all_items=True)
    rec_by_pid = {r.product_id: r for r in all_recs}

    po_items: List[POItemCreate] = []

    for pid in target_pids:
        prod = db.query(Product).filter(
            Product.id == pid,
            Product.business_id == ctx.business.id
        ).first()

        if not prod:
            continue

        # Link supplier to product if not set
        if prod.supplier_id is None:
            prod.supplier_id = req.supplier_id

        # Determine order quantity
        if pid in qty_overrides:
            order_qty = qty_overrides[pid]
        elif pid in rec_by_pid:
            order_qty = rec_by_pid[pid].recommended_order_qty
        else:
            order_qty = max(1.0, prod.min_order_qty)

        po_items.append(POItemCreate(
            product_id=prod.id,
            quantity_ordered=order_qty,
            unit_cost=prod.purchase_cost,
            tax_rate_percent=0.0
        ))

    if not po_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid items could be compiled for the purchase order"
        )

    po_data = POCreate(
        supplier_id=req.supplier_id,
        notes=req.notes or f"Generated via SmartStock Replenishment Intelligence ({len(po_items)} lines)",
        items=po_items
    )

    po = create_purchase_order(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        data=po_data
    )

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="CONVERT_RECOMMENDATIONS_TO_PO",
        entity_type="purchase_order",
        entity_id=str(po.id),
        details={"po_number": po.po_number, "items_count": len(po_items), "supplier_id": req.supplier_id}
    )

    out = POOut.from_orm(po)
    out.supplier_name = po.supplier.name if po.supplier else supplier.name
    return out

