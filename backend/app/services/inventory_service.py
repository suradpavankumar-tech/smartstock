from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from fastapi import HTTPException, status
from datetime import datetime

from app.models.product import Product
from app.models.inventory import StockMovement, MovementTypeEnum
from app.models.anomaly import AnomalyAlert, AnomalySeverityEnum, AnomalyStatusEnum

def record_stock_movement(
    db: Session,
    business_id: int,
    product_id: int,
    movement_type: MovementTypeEnum,
    quantity: float,
    unit_cost: float,
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    user_id: Optional[int] = None,
    allow_negative: bool = False
) -> StockMovement:
    # 1. Fetch product with tenant isolation
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.business_id == business_id
    ).with_for_update().first()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {product_id} not found in this shop"
        )

    # 2. Compute new stock balance
    new_stock = product.current_stock + quantity
    if new_stock < 0 and not allow_negative:
        # Flag anomaly for negative stock attempt
        alert = AnomalyAlert(
            business_id=business_id,
            alert_type="NEGATIVE_STOCK_ATTEMPT",
            severity=AnomalySeverityEnum.HIGH,
            description=f"Attempted to deduct {abs(quantity)} units from {product.name} with current stock {product.current_stock}",
            entity_type="product",
            entity_id=str(product.id),
            status=AnomalyStatusEnum.PENDING_REVIEW
        )
        db.add(alert)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock for '{product.name}'. Current: {product.current_stock}, Requested: {abs(quantity)}"
        )

    # 3. Update Weighted Average Cost (WAC) if stock is being received from a purchase
    if movement_type == MovementTypeEnum.PURCHASE_RECEIVE and quantity > 0:
        prev_units = max(0.0, product.current_stock)
        prev_val = prev_units * product.purchase_cost
        new_val = quantity * unit_cost
        total_units = prev_units + quantity
        if total_units > 0:
            product.purchase_cost = round((prev_val + new_val) / total_units, 2)

    product.current_stock = round(new_stock, 4)

    # 4. Check for large manual stock adjustment anomaly
    if movement_type in (MovementTypeEnum.RECONCILIATION_ADJUSTMENT, MovementTypeEnum.AUDIT_CORRECTION, MovementTypeEnum.DAMAGE_WASTAGE):
        abs_qty = abs(quantity)
        total_val = abs_qty * unit_cost
        if abs_qty >= 20.0 or total_val >= 2000.0:
            alert = AnomalyAlert(
                business_id=business_id,
                alert_type="LARGE_STOCK_ADJUSTMENT",
                severity=AnomalySeverityEnum.MEDIUM if total_val < 5000 else AnomalySeverityEnum.HIGH,
                description=f"Large manual stock change for '{product.name}': {quantity} units (Valued at ₹{total_val:.2f}). Reason: {reason or 'Not specified'}",
                entity_type="stock_movement",
                entity_id=str(product.id),
                status=AnomalyStatusEnum.PENDING_REVIEW
            )
            db.add(alert)

    # 5. Create immutable movement ledger record
    movement = StockMovement(
        business_id=business_id,
        product_id=product_id,
        movement_type=movement_type,
        quantity=round(quantity, 4),
        balance_after=product.current_stock,
        unit_cost=unit_cost,
        total_cost=round(abs(quantity) * unit_cost, 2),
        reference_type=reference_type,
        reference_id=reference_id,
        reason=reason,
        notes=notes,
        created_by_user_id=user_id,
        created_at=datetime.utcnow()
    )
    db.add(movement)
    return movement
