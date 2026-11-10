from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
from datetime import datetime, date
from app.models.expense import ExpenseCategoryEnum

CATEGORY_ALIASES = {
    "rent": ExpenseCategoryEnum.RENT,
    "shop rent": ExpenseCategoryEnum.RENT,
    "electricity": ExpenseCategoryEnum.ELECTRICITY,
    "electricity & utilities": ExpenseCategoryEnum.ELECTRICITY,
    "power": ExpenseCategoryEnum.ELECTRICITY,
    "utilities": ExpenseCategoryEnum.ELECTRICITY,
    "salaries": ExpenseCategoryEnum.SALARIES,
    "salary": ExpenseCategoryEnum.SALARIES,
    "staff wages": ExpenseCategoryEnum.SALARIES,
    "staff wages & advance": ExpenseCategoryEnum.SALARIES,
    "wages": ExpenseCategoryEnum.SALARIES,
    "transport": ExpenseCategoryEnum.TRANSPORT,
    "freight": ExpenseCategoryEnum.TRANSPORT,
    "freight & transportation": ExpenseCategoryEnum.TRANSPORT,
    "packaging": ExpenseCategoryEnum.PACKAGING,
    "packaging materials": ExpenseCategoryEnum.PACKAGING,
    "maintenance": ExpenseCategoryEnum.MAINTENANCE,
    "repairs": ExpenseCategoryEnum.MAINTENANCE,
    "repairs & maintenance": ExpenseCategoryEnum.MAINTENANCE,
    "tax_fees": ExpenseCategoryEnum.TAX_FEES,
    "taxes": ExpenseCategoryEnum.TAX_FEES,
    "taxes & municipal fees": ExpenseCategoryEnum.TAX_FEES,
    "tea": ExpenseCategoryEnum.OTHER,
    "tea & refreshments": ExpenseCategoryEnum.OTHER,
    "miscellaneous": ExpenseCategoryEnum.OTHER,
    "other": ExpenseCategoryEnum.OTHER,
}

def normalize_category(v: Any) -> ExpenseCategoryEnum:
    if isinstance(v, ExpenseCategoryEnum):
        return v
    if isinstance(v, str):
        v_upper = v.upper().strip()
        try:
            return ExpenseCategoryEnum(v_upper)
        except ValueError:
            pass
        v_lower = v.lower().strip()
        if v_lower in CATEGORY_ALIASES:
            return CATEGORY_ALIASES[v_lower]
        for key, cat in CATEGORY_ALIASES.items():
            if key in v_lower or v_lower in key:
                return cat
    return ExpenseCategoryEnum.OTHER

class ExpenseCreate(BaseModel):
    category: ExpenseCategoryEnum = ExpenseCategoryEnum.OTHER
    title: str = Field(..., min_length=2)
    amount: float = Field(..., gt=0)
    payment_method: str = "CASH"
    expense_date: date = Field(default_factory=date.today)
    notes: Optional[str] = None

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, v: Any) -> ExpenseCategoryEnum:
        return normalize_category(v)

class ExpenseUpdate(BaseModel):
    category: Optional[ExpenseCategoryEnum] = None
    title: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    expense_date: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, v: Any) -> Optional[ExpenseCategoryEnum]:
        if v is None:
            return None
        return normalize_category(v)

class ExpenseOut(BaseModel):
    id: int
    business_id: int
    category: ExpenseCategoryEnum
    title: str
    amount: float
    payment_method: str
    expense_date: date
    notes: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
