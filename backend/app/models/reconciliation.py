import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Float, Text, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class ReconciliationStatusEnum(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class StockReconciliationSession(Base):
    __tablename__ = "stock_reconciliation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    session_code = Column(String(100), nullable=False)
    status = Column(Enum(ReconciliationStatusEnum), default=ReconciliationStatusEnum.IN_PROGRESS, nullable=False)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    business = relationship("Business", back_populates="reconciliation_sessions")
    created_by = relationship("User")
    items = relationship("StockReconciliationItem", back_populates="session", cascade="all, delete-orphan")

class StockReconciliationItem(Base):
    __tablename__ = "stock_reconciliation_items"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("stock_reconciliation_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    
    expected_quantity = Column(Float, nullable=False)
    counted_quantity = Column(Float, nullable=False)
    variance_quantity = Column(Float, nullable=False)  # counted - expected
    unit_cost = Column(Float, default=0.0, nullable=False)
    variance_value = Column(Float, default=0.0, nullable=False)  # variance_quantity * unit_cost
    reason_code = Column(String(100), nullable=True)  # DAMAGED, THEFT, MISPLACED, COUNTING_ERROR
    adjustment_applied = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)

    session = relationship("StockReconciliationSession", back_populates="items")
    product = relationship("Product")
