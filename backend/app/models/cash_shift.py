from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from app.database import Base


class CashShift(Base):
    __tablename__ = "cash_shifts"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    opening_float = Column(Float, nullable=False)
    cash_sales = Column(Float, default=0.0, nullable=False)
    cash_expenses = Column(Float, default=0.0, nullable=False)
    cash_refunds = Column(Float, default=0.0, nullable=False)
    expected_cash = Column(Float, default=0.0, nullable=False)
    counted_cash = Column(Float, nullable=True)
    variance = Column(Float, nullable=True)
    status = Column(String(10), default="OPEN", nullable=False, index=True)
    opened_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at = Column(DateTime, nullable=True)
