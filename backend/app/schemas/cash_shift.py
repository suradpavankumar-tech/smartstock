from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CashShiftOpen(BaseModel):
    opening_float: float = Field(..., ge=0)


class CashShiftClose(BaseModel):
    counted_cash: float = Field(..., ge=0)


class CashShiftOut(BaseModel):
    id: int
    business_id: int
    user_id: int
    opening_float: float
    cash_sales: float
    cash_expenses: float
    cash_refunds: float
    expected_cash: float
    counted_cash: Optional[float] = None
    variance: Optional[float] = None
    status: str
    opened_at: datetime
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
