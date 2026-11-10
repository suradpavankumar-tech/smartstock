from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import Optional
from datetime import datetime

class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=2)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    gstin: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    outstanding_balance: Optional[float] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v

class KhataPayment(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: str = "CASH"
    note: Optional[str] = None

class CustomerOut(BaseModel):
    id: int
    business_id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    outstanding_balance: float
    created_at: datetime

    class Config:
        from_attributes = True
