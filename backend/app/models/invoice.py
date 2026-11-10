import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Float, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class PaymentMethodEnum(str, enum.Enum):
    CASH = "CASH"
    UPI = "UPI"
    CARD = "CARD"
    CREDIT = "CREDIT"
    SPLIT = "SPLIT"

class InvoiceStatusEnum(str, enum.Enum):
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_number = Column(String(100), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    subtotal = Column(Float, default=0.0, nullable=False)
    discount_amount = Column(Float, default=0.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)  # Total CGST + SGST or IGST
    cgst_amount = Column(Float, default=0.0, nullable=False)
    sgst_amount = Column(Float, default=0.0, nullable=False)
    igst_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    total_cost = Column(Float, default=0.0, nullable=False)  # COGS for this invoice
    paid_amount = Column(Float, default=0.0, nullable=True)  # Upfront paid amount
    credit_amount = Column(Float, default=0.0, nullable=True)  # Remaining amount put on Khata
    
    payment_method = Column(Enum(PaymentMethodEnum), default=PaymentMethodEnum.CASH, nullable=False)
    payment_status = Column(String(50), default="PAID", nullable=False)  # PAID, PENDING, REFUNDED
    status = Column(Enum(InvoiceStatusEnum), default=InvoiceStatusEnum.COMPLETED, nullable=False)
    
    idempotency_key = Column(String(100), nullable=True, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_phone = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    cancelled_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("business_id", "invoice_number", name="uq_business_invoice_number"),
    )

    business = relationship("Business", back_populates="invoices")
    customer = relationship("Customer", back_populates="invoices")
    created_by = relationship("User")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    returns = relationship("SalesReturn", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    product_name = Column(String(255), nullable=False)
    unit = Column(String(20), default="piece")
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    unit_cost = Column(Float, default=0.0, nullable=False)
    discount_amount = Column(Float, default=0.0, nullable=False)
    tax_rate_percent = Column(Float, default=0.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, nullable=False)
    total_cost = Column(Float, default=0.0, nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product", back_populates="invoice_items")

class SalesReturn(Base):
    __tablename__ = "sales_returns"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    return_number = Column(String(100), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    refund_amount = Column(Float, default=0.0, nullable=False)
    reason = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="returns")
    created_by = relationship("User")
    items = relationship("SalesReturnItem", back_populates="sales_return", cascade="all, delete-orphan")

class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id = Column(Integer, primary_key=True, index=True)
    sales_return_id = Column(Integer, ForeignKey("sales_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    refund_unit_price = Column(Float, nullable=False)
    refund_subtotal = Column(Float, nullable=False)
    restock_inventory = Column(String(10), default="YES")  # YES or NO (e.g. if damaged)

    sales_return = relationship("SalesReturn", back_populates="items")
    product = relationship("Product")
