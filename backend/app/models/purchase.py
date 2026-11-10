import enum
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, DateTime, Date, Enum, ForeignKey, Float, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class POStatusEnum(str, enum.Enum):
    DRAFT = "DRAFT"
    ORDERED = "ORDERED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    contact_person = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    gstin = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    lead_time_days = Column(Integer, default=3, nullable=False)
    payment_terms_days = Column(Integer, default=15, nullable=False)
    is_active = Column(String(10), default="YES")
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="suppliers")
    products = relationship("Product", back_populates="supplier")
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True)
    po_number = Column(String(100), nullable=False, index=True)
    status = Column(Enum(POStatusEnum), default=POStatusEnum.DRAFT, nullable=False, index=True)
    order_date = Column(Date, default=date.today)
    expected_delivery_date = Column(Date, nullable=True)
    received_date = Column(Date, nullable=True)
    
    subtotal = Column(Float, default=0.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("business_id", "po_number", name="uq_business_po_number"),
    )

    business = relationship("Business", back_populates="purchase_orders")
    supplier = relationship("Supplier", back_populates="purchase_orders")
    created_by = relationship("User")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    receipts = relationship("PurchaseReceipt", back_populates="purchase_order", cascade="all, delete-orphan")

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity_ordered = Column(Float, nullable=False)
    quantity_received = Column(Float, default=0.0, nullable=False)
    unit_cost = Column(Float, nullable=False)
    tax_rate_percent = Column(Float, default=0.0, nullable=False)
    total_cost = Column(Float, nullable=False)

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", back_populates="po_items")

class PurchaseReceipt(Base):
    __tablename__ = "purchase_receipts"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    receipt_number = Column(String(100), nullable=False)
    received_date = Column(Date, default=date.today)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    purchase_order = relationship("PurchaseOrder", back_populates="receipts")
    created_by = relationship("User")
