import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class RoleEnum(str, enum.Enum):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"

class TaxModeEnum(str, enum.Enum):
    REGULAR_GST = "REGULAR_GST"
    COMPOSITION_SCHEME = "COMPOSITION_SCHEME"
    NON_GST_RETAIL = "NON_GST_RETAIL"

class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    legal_name = Column(String(255), nullable=True)
    gstin = Column(String(20), nullable=True)  # Goods and Services Tax Identification Number
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address_line = Column(Text, nullable=True)
    city = Column(String(100), default="Haveri")
    district = Column(String(100), default="Haveri")
    state = Column(String(100), default="Karnataka")
    pincode = Column(String(10), default="581110")
    currency = Column(String(10), default="INR")
    timezone = Column(String(50), default="Asia/Kolkata")
    locale = Column(String(20), default="kn-IN")
    tax_mode = Column(Enum(TaxModeEnum), default=TaxModeEnum.REGULAR_GST, nullable=False)
    upi_vpa = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    memberships = relationship("BusinessMembership", back_populates="business", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="business", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="business", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="business", cascade="all, delete-orphan")
    suppliers = relationship("Supplier", back_populates="business", cascade="all, delete-orphan")
    purchase_orders = relationship("PurchaseOrder", back_populates="business", cascade="all, delete-orphan")
    stock_movements = relationship("StockMovement", back_populates="business", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="business", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="business", cascade="all, delete-orphan")
    reconciliation_sessions = relationship("StockReconciliationSession", back_populates="business", cascade="all, delete-orphan")
    anomaly_alerts = relationship("AnomalyAlert", back_populates="business", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="business", cascade="all, delete-orphan")

class BusinessMembership(Base):
    __tablename__ = "business_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(RoleEnum), default=RoleEnum.CASHIER, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="memberships")
    business = relationship("Business", back_populates="memberships")
