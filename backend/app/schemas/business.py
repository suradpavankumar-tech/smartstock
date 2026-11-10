from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models.business import RoleEnum, TaxModeEnum

class BusinessCreate(BaseModel):
    name: str
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address_line: Optional[str] = None
    city: str = "Haveri"
    district: str = "Haveri"
    state: str = "Karnataka"
    pincode: str = "581110"
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    locale: str = "kn-IN"
    tax_mode: TaxModeEnum = TaxModeEnum.REGULAR_GST
    upi_vpa: Optional[str] = None

class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    tax_mode: Optional[TaxModeEnum] = None
    upi_vpa: Optional[str] = None

class BusinessOut(BaseModel):
    id: int
    name: str
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line: Optional[str] = None
    city: str
    district: str
    state: str
    pincode: str
    currency: str
    timezone: str
    locale: str
    tax_mode: TaxModeEnum = TaxModeEnum.REGULAR_GST
    upi_vpa: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class StaffInvite(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    role: RoleEnum = RoleEnum.CASHIER
    temp_password: str = "smartstock123"

class StaffUpdate(BaseModel):
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None

class StaffPasswordReset(BaseModel):
    new_password: str

class MembershipOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    role: RoleEnum
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
