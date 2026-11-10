from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerOut, KhataPayment
from app.schemas.invoice import InvoiceOut
from app.dependencies import get_tenant_context, TenantContext, record_audit_log

router = APIRouter(prefix="/customers", tags=["Customers"])

@router.get("/", response_model=List[CustomerOut])
def list_customers(
    search: Optional[str] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(Customer).filter(Customer.business_id == ctx.business.id)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter((Customer.name.ilike(s)) | (Customer.phone.ilike(s)))
    return query.order_by(Customer.name).all()

@router.post("/", response_model=CustomerOut)
def create_customer(
    data: CustomerCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    cust = Customer(
        business_id=ctx.business.id,
        name=data.name.strip(),
        phone=data.phone.strip() if data.phone else None,
        email=data.email,
        address=data.address,
        gstin=data.gstin
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    return cust

@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.business_id == ctx.business.id
    ).first()
    if not cust:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    for k, v in data.dict(exclude_unset=True).items():
        setattr(cust, k, v)
    db.commit()
    db.refresh(cust)
    return cust

@router.post("/{customer_id}/payment", response_model=CustomerOut)
def record_customer_payment(
    customer_id: int,
    data: KhataPayment,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    cust = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.business_id == ctx.business.id
    ).first()
    if not cust:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    if data.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment amount must be greater than zero")

    cust.outstanding_balance = max(0.0, cust.outstanding_balance - data.amount)

    # If balance cleared, mark pending DUE invoices as PAID
    if cust.outstanding_balance == 0.0:
        due_invoices = db.query(Invoice).filter(
            Invoice.customer_id == cust.id,
            Invoice.business_id == ctx.business.id,
            Invoice.payment_status == "DUE"
        ).all()
        for inv in due_invoices:
            inv.payment_status = "PAID"

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="RECORD_CUSTOMER_PAYMENT",
        entity_type="customer",
        entity_id=str(cust.id),
        details={
            "customer_name": cust.name,
            "amount_paid": data.amount,
            "remaining_balance": cust.outstanding_balance,
            "payment_method": data.payment_method
        }
    )

    db.commit()
    db.refresh(cust)
    return cust

@router.get("/{customer_id}/invoices", response_model=List[InvoiceOut])
def get_customer_invoices(
    customer_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    invoices = db.query(Invoice).filter(
        Invoice.customer_id == customer_id,
        Invoice.business_id == ctx.business.id
    ).order_by(Invoice.created_at.desc()).all()
    return invoices
