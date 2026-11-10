from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    section_name: str = "General"
    description: Optional[str] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    section_name: Optional[str] = None
    description: Optional[str] = None
    is_archived: Optional[bool] = None

class CategoryOut(BaseModel):
    id: int
    business_id: int
    name: str
    section_name: str
    description: Optional[str] = None
    is_archived: bool
    created_at: datetime
    product_count: Optional[int] = 0

    class Config:
        from_attributes = True

class ProductBatchCreate(BaseModel):
    batch_number: str
    quantity: float
    purchase_cost: float
    expiry_date: Optional[date] = None
    received_date: date = Field(default_factory=date.today)

class ProductBatchOut(BaseModel):
    id: int
    batch_number: str
    quantity: float
    purchase_cost: float
    expiry_date: Optional[date] = None
    received_date: date
    is_active: bool
    product_id: Optional[int] = None
    product_name: Optional[str] = None
    days_until_expiry: Optional[int] = None

    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    supplier_id: Optional[int] = None
    unit: str = "piece"
    purchase_cost: float = Field(0.0, ge=0)
    selling_price: float = Field(..., ge=0)
    tax_rate_percent: float = Field(0.0, ge=0, le=100)
    initial_stock: float = Field(0.0, ge=0)
    reorder_threshold: float = Field(10.0, ge=0)
    min_order_qty: float = Field(5.0, ge=1)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    supplier_id: Optional[int] = None
    unit: Optional[str] = None
    purchase_cost: Optional[float] = None
    selling_price: Optional[float] = None
    tax_rate_percent: Optional[float] = None
    reorder_threshold: Optional[float] = None
    min_order_qty: Optional[float] = None
    is_archived: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    business_id: int
    name: str
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    section_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    unit: str
    purchase_cost: float
    selling_price: float
    tax_rate_percent: float
    current_stock: float
    reorder_threshold: float
    min_order_qty: float
    is_archived: bool
    is_low_stock: Optional[bool] = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProductImportRow(BaseModel):
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = "General"
    section: Optional[str] = "General"
    unit: str = "piece"
    purchase_cost: float = 0.0
    selling_price: float = 0.0
    tax_rate_percent: float = 0.0
    initial_stock: float = 0.0
    reorder_threshold: float = 10.0
    min_order_qty: float = 5.0

class ProductImportResult(BaseModel):
    total_rows: int
    imported_count: int
    rejected_count: int
    rejected_rows: List[dict] = []
