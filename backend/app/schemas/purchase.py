from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime, date
from app.models.purchase import POStatusEnum

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=2)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: int = Field(3, ge=1)
    payment_terms_days: int = Field(15, ge=0)

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: Optional[int] = None
    payment_terms_days: Optional[int] = None
    is_active: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

class SupplierOut(BaseModel):
    id: int
    business_id: int
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: int
    payment_terms_days: int
    is_active: str
    created_at: datetime
    order_count: Optional[int] = 0
    average_actual_lead_time_days: Optional[float] = None
    fulfillment_rate_percent: Optional[float] = None

    class Config:
        from_attributes = True

class POItemCreate(BaseModel):
    product_id: int
    quantity_ordered: float = Field(..., gt=0)
    unit_cost: float = Field(..., ge=0)
    tax_rate_percent: float = Field(0.0, ge=0)

class POCreate(BaseModel):
    supplier_id: int
    order_date: date = Field(default_factory=date.today)
    expected_delivery_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[POItemCreate] = Field(..., min_length=1)

class POItemOut(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    unit: Optional[str] = "piece"
    quantity_ordered: float
    quantity_received: float
    unit_cost: float
    tax_rate_percent: float
    total_cost: float

    class Config:
        from_attributes = True

class POOut(BaseModel):
    id: int
    business_id: int
    supplier_id: int
    supplier_name: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_email: Optional[str] = None
    po_number: str
    status: POStatusEnum
    order_date: date
    expected_delivery_date: Optional[date] = None
    received_date: Optional[date] = None
    subtotal: float
    tax_amount: float
    total_amount: float
    notes: Optional[str] = None
    created_at: datetime
    items: List[POItemOut] = []

    class Config:
        from_attributes = True

class ReceiptItemInput(BaseModel):
    po_item_id: int
    quantity_received_now: float = Field(..., gt=0)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

class POReceiptCreate(BaseModel):
    notes: Optional[str] = None
    items: List[ReceiptItemInput] = Field(..., min_length=1)
