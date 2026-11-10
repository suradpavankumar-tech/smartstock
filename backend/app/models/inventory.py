import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from app.database import Base

class MovementTypeEnum(str, enum.Enum):
    OPENING_STOCK = "OPENING_STOCK"
    SALE = "SALE"
    SALE_RETURN = "SALE_RETURN"
    PURCHASE_RECEIVE = "PURCHASE_RECEIVE"
    SUPPLIER_RETURN = "SUPPLIER_RETURN"
    DAMAGE_WASTAGE = "DAMAGE_WASTAGE"
    RECONCILIATION_ADJUSTMENT = "RECONCILIATION_ADJUSTMENT"
    AUDIT_CORRECTION = "AUDIT_CORRECTION"
    TRANSFER = "TRANSFER"

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_type = Column(Enum(MovementTypeEnum), nullable=False, index=True)
    quantity = Column(Float, nullable=False)  # positive for stock in, negative for stock out
    balance_after = Column(Float, nullable=False)  # stock after movement
    unit_cost = Column(Float, default=0.0, nullable=False)
    total_cost = Column(Float, default=0.0, nullable=False)
    reference_type = Column(String(50), nullable=True)  # invoice, purchase_order, reconciliation, manual
    reference_id = Column(String(100), nullable=True)
    reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    business = relationship("Business", back_populates="stock_movements")
    product = relationship("Product", back_populates="stock_movements")
    created_by = relationship("User")
