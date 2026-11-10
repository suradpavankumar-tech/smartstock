from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from fastapi import HTTPException, status
from datetime import datetime, date

from app.models.customer import Customer
from app.models.invoice import Invoice, InvoiceItem, SalesReturn, SalesReturnItem, InvoiceStatusEnum, PaymentMethodEnum
from app.models.product import Product
from app.models.business import TaxModeEnum
from app.models.inventory import MovementTypeEnum
from app.models.anomaly import AnomalyAlert, AnomalySeverityEnum, AnomalyStatusEnum
from app.schemas.invoice import InvoiceCreate, SalesReturnCreate
from app.services.inventory_service import record_stock_movement

def generate_invoice_number(db: Session, business_id: int) -> str:
    current_year = datetime.utcnow().year
    prefix = f"INV-{current_year}-"
    # Find max existing invoice number for this year
    last_invoice = db.query(Invoice).filter(
        Invoice.business_id == business_id,
        Invoice.invoice_number.like(f"{prefix}%")
    ).order_by(Invoice.id.desc()).first()

    if not last_invoice:
        return f"{prefix}00001"
    try:
        last_seq = int(last_invoice.invoice_number.split("-")[-1])
        next_seq = last_seq + 1
        return f"{prefix}{next_seq:05d}"
    except (ValueError, IndexError):
        count = db.query(Invoice).filter(Invoice.business_id == business_id).count() + 1
        return f"{prefix}{count:05d}"

def create_sale_invoice(
    db: Session,
    business_id: int,
    user_id: int,
    data: InvoiceCreate,
    tax_mode: TaxModeEnum = TaxModeEnum.REGULAR_GST,
) -> Invoice:
    # 1. Idempotency check: if key supplied and invoice exists, return existing
    if data.idempotency_key:
        existing = db.query(Invoice).filter(
            Invoice.business_id == business_id,
            Invoice.idempotency_key == data.idempotency_key
        ).first()
        if existing:
            return existing

    # 2. Validate and prepare items
    subtotal = 0.0
    total_tax = 0.0
    total_cost = 0.0
    line_discount_total = 0.0
    invoice_items_to_create = []

    for item_in in data.items:
        product = db.query(Product).filter(
            Product.id == item_in.product_id,
            Product.business_id == business_id
        ).with_for_update().first()

        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product ID {item_in.product_id} not found"
            )
        if product.is_archived:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{product.name}' is archived and cannot be billed"
            )
        if product.current_stock < item_in.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for '{product.name}'. Current: {product.current_stock}, Requested: {item_in.quantity}"
            )

        line_subtotal = round(item_in.quantity * item_in.unit_price, 2)
        line_discount = round(min(line_subtotal, item_in.discount_amount), 2)
        taxable_amount = line_subtotal - line_discount
        tax_rate = product.tax_rate_percent if tax_mode == TaxModeEnum.REGULAR_GST else 0.0
        line_tax = round((taxable_amount * tax_rate) / 100.0, 2)
        line_total = taxable_amount + line_tax
        line_cost = round(item_in.quantity * product.purchase_cost, 2)

        subtotal += line_subtotal
        total_tax += line_tax
        total_cost += line_cost
        line_discount_total += line_discount

        invoice_items_to_create.append({
            "product": product,
            "quantity": item_in.quantity,
            "unit_price": item_in.unit_price,
            "unit_cost": product.purchase_cost,
            "discount_amount": line_discount,
            "tax_rate_percent": tax_rate,
            "tax_amount": line_tax,
            "total_amount": line_total,
            "total_cost": line_cost
        })

    # 3. Overall discount & tax split (50% CGST, 50% SGST intra-state for Karnataka)
    overall_discount = min(subtotal, data.discount_amount)
    total_discount = min(subtotal, overall_discount + line_discount_total)
    final_total = max(0.0, round(subtotal - total_discount + total_tax, 2))
    cgst = round(total_tax / 2.0, 2)
    sgst = round(total_tax - cgst, 2)

    # Anomaly check: discount > 25% of subtotal
    if subtotal > 0 and (total_discount / subtotal) > 0.25:
        discount_percent = (total_discount / subtotal) * 100
        alert = AnomalyAlert(
            business_id=business_id,
            alert_type="EXCESSIVE_DISCOUNT",
            severity=AnomalySeverityEnum.MEDIUM,
            description=f"High discount rate of {discount_percent:.1f}% applied on invoice subtotal ₹{subtotal:.2f}",
            entity_type="invoice",
            status=AnomalyStatusEnum.PENDING_REVIEW
        )
        db.add(alert)

    # 4. Resolve or auto-register Customer & Khata balance
    customer_id = data.customer_id
    customer = None
    if customer_id:
        customer = db.query(Customer).filter(
            Customer.id == customer_id,
            Customer.business_id == business_id
        ).first()
    elif (data.customer_phone and data.customer_phone.strip()) or (data.customer_name and data.customer_name.strip()):
        clean_phone = data.customer_phone.strip() if data.customer_phone else None
        clean_name = data.customer_name.strip() if data.customer_name else None

        if clean_phone:
            customer = db.query(Customer).filter(
                Customer.business_id == business_id,
                Customer.phone == clean_phone
            ).first()
        if not customer and clean_name:
            customer = db.query(Customer).filter(
                Customer.business_id == business_id,
                Customer.name == clean_name
            ).first()

        if not customer:
            display_name = clean_name or f"Customer {clean_phone}"
            customer = Customer(
                business_id=business_id,
                name=display_name,
                phone=clean_phone,
                outstanding_balance=0.0,
                created_at=datetime.utcnow()
            )
            db.add(customer)
            db.flush()

        customer_id = customer.id

    # Determine upfront paid amount and remaining Khata credit due
    if data.payment_method == PaymentMethodEnum.CREDIT:
        raw_paid = float(data.paid_amount) if data.paid_amount is not None else 0.0
        actual_paid = round(max(0.0, min(final_total, raw_paid)), 2)
        credit_due = round(max(0.0, final_total - actual_paid), 2)
        if customer:
            customer.outstanding_balance = round((customer.outstanding_balance or 0.0) + credit_due, 2)
        payment_status = "PAID" if credit_due == 0 else ("PARTIAL" if actual_paid > 0 else "DUE")
    else:
        actual_paid = final_total
        credit_due = 0.0
        payment_status = "PAID"

    # 5. Generate invoice number
    invoice_number = generate_invoice_number(db, business_id)

    invoice = Invoice(
        business_id=business_id,
        invoice_number=invoice_number,
        customer_id=customer_id,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        created_by_user_id=user_id,
        subtotal=round(subtotal, 2),
        discount_amount=round(total_discount, 2),
        tax_amount=round(total_tax, 2),
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=0.0,
        total_amount=final_total,
        total_cost=round(total_cost, 2),
        paid_amount=actual_paid,
        credit_amount=credit_due,
        payment_method=data.payment_method,
        payment_status=payment_status,
        status=InvoiceStatusEnum.COMPLETED,
        idempotency_key=data.idempotency_key,
        notes=data.notes,
        created_at=datetime.utcnow()
    )
    db.add(invoice)
    db.flush()  # assign invoice.id

    # 5. Create invoice items and record atomic stock movements
    for item_data in invoice_items_to_create:
        prod = item_data["product"]
        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            product_id=prod.id,
            product_name=prod.name,
            unit=prod.unit,
            quantity=item_data["quantity"],
            unit_price=item_data["unit_price"],
            unit_cost=item_data["unit_cost"],
            discount_amount=item_data["discount_amount"],
            tax_rate_percent=item_data["tax_rate_percent"],
            tax_amount=item_data["tax_amount"],
            total_amount=item_data["total_amount"],
            total_cost=item_data["total_cost"]
        )
        db.add(inv_item)

        # Deduct stock through immutable ledger
        record_stock_movement(
            db=db,
            business_id=business_id,
            product_id=prod.id,
            movement_type=MovementTypeEnum.SALE,
            quantity=-item_data["quantity"],
            unit_cost=item_data["unit_cost"],
            reference_type="invoice",
            reference_id=invoice_number,
            reason="POS Retail Sale",
            user_id=user_id
        )

    db.commit()
    db.refresh(invoice)
    return invoice

def cancel_sale_invoice(
    db: Session,
    business_id: int,
    user_id: int,
    invoice_id: int,
    reason: str
) -> Invoice:
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.business_id == business_id
    ).first()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    if invoice.status == InvoiceStatusEnum.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice is already cancelled"
        )

    # Restock all items
    for item in invoice.items:
        record_stock_movement(
            db=db,
            business_id=business_id,
            product_id=item.product_id,
            movement_type=MovementTypeEnum.SALE_RETURN,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            reference_type="invoice_cancel",
            reference_id=invoice.invoice_number,
            reason=f"Invoice cancellation: {reason}",
            user_id=user_id
        )

    invoice.status = InvoiceStatusEnum.CANCELLED
    invoice.cancelled_reason = reason

    # Reversal of Khata credit balance if cancelled invoice was on credit
    if invoice.payment_method == PaymentMethodEnum.CREDIT and invoice.customer_id:
        cust = db.query(Customer).filter(
            Customer.id == invoice.customer_id,
            Customer.business_id == business_id
        ).first()
        if cust:
            reversal = invoice.credit_amount if (invoice.credit_amount is not None and invoice.credit_amount > 0) else invoice.total_amount
            cust.outstanding_balance = max(0.0, round((cust.outstanding_balance or 0.0) - reversal, 2))

    # Check for repeated cancellation anomaly (> 2 cancellations in last 24h)
    recent_cancels = db.query(Invoice).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.CANCELLED,
        Invoice.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0)
    ).count()

    if recent_cancels >= 3:
        alert = AnomalyAlert(
            business_id=business_id,
            alert_type="REPEATED_CANCELLATION",
            severity=AnomalySeverityEnum.HIGH,
            description=f"Multiple invoices ({recent_cancels}) have been cancelled today. Review cashier activity.",
            entity_type="invoice",
            entity_id=invoice.invoice_number,
            status=AnomalyStatusEnum.PENDING_REVIEW
        )
        db.add(alert)

    db.commit()
    db.refresh(invoice)
    return invoice
