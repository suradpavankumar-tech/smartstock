import enum
from datetime import datetime, date
from sqlalchemy import Column, Integer, String, DateTime, Date, Enum, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from app.database import Base

class ExpenseCategoryEnum(str, enum.Enum):
    RENT = "RENT"
    ELECTRICITY = "ELECTRICITY"
    SALARIES = "SALARIES"
    TRANSPORT = "TRANSPORT"
    PACKAGING = "PACKAGING"
    MAINTENANCE = "MAINTENANCE"
    TAX_FEES = "TAX_FEES"
    OTHER = "OTHER"

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(Enum(ExpenseCategoryEnum), default=ExpenseCategoryEnum.OTHER, nullable=False)
    title = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), default="CASH")
    expense_date = Column(Date, default=date.today, index=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="expenses")
    created_by = relationship("User")
