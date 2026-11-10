from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from app.models.business import RoleEnum

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    business_id: Optional[int] = None
    role: Optional[RoleEnum] = None
    business_name: Optional[str] = None

class TokenPayload(BaseModel):
    sub: Optional[str] = None  # user_id as string
    business_id: Optional[int] = None
    role: Optional[str] = None
    exp: Optional[int] = None

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)
    phone: Optional[str] = None
    business_name: str = Field(..., min_length=2)
    gstin: Optional[str] = None
    city: str = "Haveri"
    district: str = "Haveri"
    state: str = "Karnataka"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class SwitchBusinessRequest(BaseModel):
    business_id: int

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    is_active: bool
    is_superuser: bool

    class Config:
        from_attributes = True

class BusinessSummary(BaseModel):
    id: int
    name: str
    role: RoleEnum
    city: str
    district: str
    gstin: Optional[str] = None

    class Config:
        from_attributes = True

class AuthStatus(BaseModel):
    user: UserOut
    current_business: Optional[BusinessSummary] = None
    businesses: List[BusinessSummary] = []
