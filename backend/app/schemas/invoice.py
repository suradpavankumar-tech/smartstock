from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.invoice import PaymentMethodEnum, InvoiceStatusEnum

class InvoiceItemCreate(BaseModel):
    product_id: int
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_amount: float = Field(0.0, ge=0)

class InvoiceCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    payment_method: PaymentMethodEnum = PaymentMethodEnum.CASH
    discount_amount: float = Field(0.0, ge=0)
    paid_amount: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None
    items: List[InvoiceItemCreate] = Field(..., min_length=1)

class InvoiceItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    unit: str
    quantity: float
    unit_price: float
    unit_cost: float
    discount_amount: float
    tax_rate_percent: float
    tax_amount: float
    total_amount: float

    class Config:
        from_attributes = True

class InvoiceOut(BaseModel):
    id: int
    business_id: int
    invoice_number: str
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    
    subtotal: float
    discount_amount: float
    tax_amount: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_amount: float
    total_cost: float
    paid_amount: Optional[float] = 0.0
    credit_amount: Optional[float] = 0.0
    
    payment_method: PaymentMethodEnum
    payment_status: str
    status: InvoiceStatusEnum
    notes: Optional[str] = None
    created_at: datetime
    items: List[InvoiceItemOut] = []

    class Config:
        from_attributes = True

class InvoiceCancelRequest(BaseModel):
    reason: str = Field(..., min_length=3)

class SalesReturnItemCreate(BaseModel):
    product_id: int
    quantity: float = Field(..., gt=0)
    restock_inventory: str = "YES"

class SalesReturnCreate(BaseModel):
    invoice_id: int
    reason: str = Field(..., min_length=3)
    notes: Optional[str] = None
    items: List[SalesReturnItemCreate] = Field(..., min_length=1)

class SalesReturnOut(BaseModel):
    id: int
    business_id: int
    invoice_id: int
    return_number: str
    refund_amount: float
    reason: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
