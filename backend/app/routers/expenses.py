from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.expense import Expense, ExpenseCategoryEnum
from app.models.business import RoleEnum
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseOut
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log

router = APIRouter(prefix="/expenses", tags=["Operating Expenses"])

@router.get("/", response_model=List[ExpenseOut])
def list_expenses(
    category: Optional[ExpenseCategoryEnum] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Expense).filter(Expense.business_id == ctx.business.id)
    if category:
        query = query.filter(Expense.category == category)
    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)

    expenses = query.order_by(desc(Expense.expense_date)).offset(skip).limit(limit).all()

    results = []
    for exp in expenses:
        out = ExpenseOut.from_orm(exp)
        out.created_by_name = exp.created_by.full_name if exp.created_by else None
        results.append(out)
    return results

@router.post("/", response_model=ExpenseOut)
def record_expense(
    data: ExpenseCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    exp = Expense(
        business_id=ctx.business.id,
        category=data.category,
        title=data.title.strip(),
        amount=round(data.amount, 2),
        payment_method=data.payment_method,
        expense_date=data.expense_date,
        notes=data.notes,
        created_by_user_id=ctx.user.id
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="RECORD_EXPENSE",
        entity_type="expense",
        entity_id=str(exp.id),
        details={"category": exp.category.value, "amount": exp.amount, "title": exp.title}
    )

    out = ExpenseOut.from_orm(exp)
    out.created_by_name = ctx.user.full_name
    return out

@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    exp = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.business_id == ctx.business.id
    ).first()
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    db.delete(exp)
    db.commit()
    return {"message": "Expense record deleted"}
