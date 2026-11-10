from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    phone = Column(String(20), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    gstin = Column(String(20), nullable=True)
    outstanding_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="customers")
    invoices = relationship("Invoice", back_populates="customer")
