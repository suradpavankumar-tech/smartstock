from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.database import get_db
from app.models.inventory import StockMovement, MovementTypeEnum
from app.models.product import Product, ProductBatch
from app.models.user import User
from app.models.business import RoleEnum
from app.schemas.inventory import StockMovementOut, StockAdjustmentRequest, LowStockAlertOut
from app.schemas.product import ProductBatchOut
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log
from app.services.inventory_service import record_stock_movement

router = APIRouter(prefix="/inventory", tags=["Inventory Ledger & Alerts"])

@router.get("/ledger", response_model=List[StockMovementOut])
def list_stock_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[MovementTypeEnum] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(StockMovement).filter(StockMovement.business_id == ctx.business.id)

    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)

    movements = query.order_by(desc(StockMovement.created_at)).offset(skip).limit(limit).all()

    results = []
    for m in movements:
        out = StockMovementOut.from_orm(m)
        out.product_name = m.product.name if m.product else "Unknown Product"
        out.created_by_name = m.created_by.full_name if m.created_by else "System"
        results.append(out)
    return results

@router.post("/adjust", response_model=StockMovementOut)
def adjust_stock(
    req: StockAdjustmentRequest,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    product = db.query(Product).filter(
        Product.id == req.product_id,
        Product.business_id == ctx.business.id
    ).first()

    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    m = record_stock_movement(
        db=db,
        business_id=ctx.business.id,
        product_id=product.id,
        movement_type=MovementTypeEnum.AUDIT_CORRECTION,
        quantity=req.quantity_change,
        unit_cost=product.purchase_cost,
        reason=req.reason,
        notes=req.notes,
        user_id=ctx.user.id
    )
    db.commit()
    db.refresh(m)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="MANUAL_STOCK_ADJUSTMENT",
        entity_type="stock_movement",
        entity_id=str(m.id),
        details={"product_name": product.name, "quantity_change": req.quantity_change, "reason": req.reason}
    )

    out = StockMovementOut.from_orm(m)
    out.product_name = product.name
    out.created_by_name = ctx.user.full_name
    return out

@router.get("/low-stock", response_model=List[LowStockAlertOut])
def get_low_stock_alerts(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    products = db.query(Product).filter(
        Product.business_id == ctx.business.id,
        Product.is_archived == False,
        Product.current_stock <= Product.reorder_threshold
    ).order_by(Product.current_stock).all()

    alerts = []
    for p in products:
        if p.current_stock <= 0:
            severity = "CRITICAL"
            explanation = f"Product is currently out of stock ({p.current_stock} {p.unit} remaining). Immediate replenishment needed."
        elif p.current_stock <= (p.reorder_threshold * 0.5):
            severity = "HIGH"
            explanation = f"Stock level ({p.current_stock} {p.unit}) has dropped below 50% of minimum threshold ({p.reorder_threshold} {p.unit})."
        else:
            severity = "MEDIUM"
            explanation = f"Stock ({p.current_stock} {p.unit}) is at or below the reorder point ({p.reorder_threshold} {p.unit})."

        alerts.append(LowStockAlertOut(
            product_id=p.id,
            product_name=p.name,
            sku=p.sku,
            barcode=p.barcode,
            current_stock=p.current_stock,
            reorder_threshold=p.reorder_threshold,
            min_order_qty=p.min_order_qty,
            unit=p.unit,
            unit_cost=p.purchase_cost,
            supplier_name=p.supplier.name if p.supplier else None,
            supplier_lead_time_days=p.supplier.lead_time_days if p.supplier else 3,
            severity=severity,
            explanation=explanation
        ))
    return alerts

@router.get("/batches", response_model=List[ProductBatchOut])
def list_product_batches(
    product_id: Optional[int] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(ProductBatch).filter(
        ProductBatch.business_id == ctx.business.id,
        ProductBatch.is_active == True
    )
    if product_id:
        query = query.filter(ProductBatch.product_id == product_id)

    batches = query.order_by(ProductBatch.expiry_date.asc().nullslast()).all()
    today = date.today()
    results = []
    for b in batches:
        out = ProductBatchOut.from_orm(b)
        out.product_id = b.product_id
        out.product_name = b.product.name if b.product else "Unknown Product"
        if b.expiry_date:
            out.days_until_expiry = (b.expiry_date - today).days
        results.append(out)
    return results

@router.get("/expiring-batches", response_model=List[ProductBatchOut])
def list_expiring_batches(
    days: int = Query(30, ge=1, le=365),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    today = date.today()
    cutoff_date = today + timedelta(days=days)

    batches = db.query(ProductBatch).filter(
        ProductBatch.business_id == ctx.business.id,
        ProductBatch.is_active == True,
        ProductBatch.quantity > 0,
        ProductBatch.expiry_date != None,
        ProductBatch.expiry_date <= cutoff_date
    ).order_by(ProductBatch.expiry_date.asc()).all()

    results = []
    for b in batches:
        out = ProductBatchOut.from_orm(b)
        out.product_id = b.product_id
        out.product_name = b.product.name if b.product else "Unknown Product"
        if b.expiry_date:
            out.days_until_expiry = (b.expiry_date - today).days
        results.append(out)
    return results
