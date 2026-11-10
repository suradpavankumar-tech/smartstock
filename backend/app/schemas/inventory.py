from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.inventory import MovementTypeEnum

class StockMovementOut(BaseModel):
    id: int
    business_id: int
    product_id: int
    product_name: Optional[str] = None
    movement_type: MovementTypeEnum
    quantity: float
    balance_after: float
    unit_cost: float
    total_cost: float
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class StockAdjustmentRequest(BaseModel):
    product_id: int
    quantity_change: float = Field(..., description="Positive to add, negative to deduct")
    reason: str = Field(..., min_length=3, description="Audit reason for manual stock correction")
    notes: Optional[str] = None

class LowStockAlertOut(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    current_stock: float
    reorder_threshold: float
    min_order_qty: float
    unit: str
    unit_cost: float
    supplier_name: Optional[str] = None
    supplier_lead_time_days: Optional[int] = None
    severity: str  # CRITICAL (stock <= 0), HIGH (stock < threshold/2), MEDIUM (stock <= threshold)
    estimated_depletion_days: Optional[float] = None
    explanation: str
