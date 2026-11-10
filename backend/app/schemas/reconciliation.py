from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.reconciliation import ReconciliationStatusEnum

class ReconciliationSessionCreate(BaseModel):
    notes: Optional[str] = None

class ReconciliationItemInput(BaseModel):
    product_id: int
    counted_quantity: float = Field(..., ge=0)
    reason_code: Optional[str] = "COUNT_UPDATE"  # THEFT, DAMAGE, EXPIRED, MISPLACED, COUNT_UPDATE
    notes: Optional[str] = None

class ReconciliationItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    unit: str
    expected_quantity: float
    counted_quantity: float
    variance_quantity: float
    unit_cost: float
    variance_value: float
    reason_code: Optional[str] = None
    adjustment_applied: bool
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class ReconciliationSessionOut(BaseModel):
    id: int
    business_id: int
    session_code: str
    status: ReconciliationStatusEnum
    notes: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_by_name: Optional[str] = None
    total_items_counted: Optional[int] = 0
    total_variance_value: Optional[float] = 0.0

    class Config:
        from_attributes = True

class ReconciliationDetailOut(BaseModel):
    session: ReconciliationSessionOut
    items: List[ReconciliationItemOut] = []
