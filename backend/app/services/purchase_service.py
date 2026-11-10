from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from fastapi import HTTPException, status
from datetime import datetime, date

from app.models.purchase import Supplier, PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, POStatusEnum
from app.models.product import Product, ProductBatch
from app.models.inventory import MovementTypeEnum
from app.schemas.purchase import POCreate, POReceiptCreate
from app.services.inventory_service import record_stock_movement

def generate_po_number(db: Session, business_id: int) -> str:
    current_year = datetime.utcnow().year
    prefix = f"PO-{current_year}-"
    last_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.business_id == business_id,
        PurchaseOrder.po_number.like(f"{prefix}%")
    ).order_by(PurchaseOrder.id.desc()).first()

    if not last_po:
        return f"{prefix}00001"
    try:
        last_seq = int(last_po.po_number.split("-")[-1])
        return f"{prefix}{last_seq + 1:05d}"
    except (ValueError, IndexError):
        count = db.query(PurchaseOrder).filter(PurchaseOrder.business_id == business_id).count() + 1
        return f"{prefix}{count:05d}"

def create_purchase_order(
    db: Session,
    business_id: int,
    user_id: int,
    data: POCreate
) -> PurchaseOrder:
    supplier = db.query(Supplier).filter(
        Supplier.id == data.supplier_id,
        Supplier.business_id == business_id
    ).first()
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")

    subtotal = 0.0
    tax_total = 0.0
    po_items_to_create = []

    for item_in in data.items:
        product = db.query(Product).filter(
            Product.id == item_in.product_id,
            Product.business_id == business_id
        ).first()
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product ID {item_in.product_id} not found")

        line_subtotal = round(item_in.quantity_ordered * item_in.unit_cost, 2)
        line_tax = round((line_subtotal * item_in.tax_rate_percent) / 100.0, 2)
        line_total = line_subtotal + line_tax

        subtotal += line_subtotal
        tax_total += line_tax

        po_items_to_create.append({
            "product_id": product.id,
            "quantity_ordered": item_in.quantity_ordered,
            "unit_cost": item_in.unit_cost,
            "tax_rate_percent": item_in.tax_rate_percent,
            "total_cost": line_total
        })

    po_number = generate_po_number(db, business_id)
    po = PurchaseOrder(
        business_id=business_id,
        supplier_id=supplier.id,
        po_number=po_number,
        status=POStatusEnum.ORDERED,
        order_date=data.order_date,
        expected_delivery_date=data.expected_delivery_date,
        subtotal=round(subtotal, 2),
        tax_amount=round(tax_total, 2),
        total_amount=round(subtotal + tax_total, 2),
        notes=data.notes,
        created_by_user_id=user_id,
        created_at=datetime.utcnow()
    )
    db.add(po)
    db.flush()

    for item in po_items_to_create:
        po_item = PurchaseOrderItem(
            purchase_order_id=po.id,
            product_id=item["product_id"],
            quantity_ordered=item["quantity_ordered"],
            quantity_received=0.0,
            unit_cost=item["unit_cost"],
            tax_rate_percent=item["tax_rate_percent"],
            total_cost=item["total_cost"]
        )
        db.add(po_item)

    db.commit()
    db.refresh(po)
    return po

def receive_purchase_order_items(
    db: Session,
    business_id: int,
    user_id: int,
    po_id: int,
    data: POReceiptCreate
) -> PurchaseOrder:
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id,
        PurchaseOrder.business_id == business_id
    ).first()

    if not po:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase Order not found")
    if po.status in (POStatusEnum.COMPLETED, POStatusEnum.CANCELLED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot receive items on a {po.status.value} PO")

    receipt_count = db.query(PurchaseReceipt).filter(PurchaseReceipt.purchase_order_id == po.id).count() + 1
    receipt_num = f"RCP-{po.po_number}-{receipt_count:02d}"

    receipt = PurchaseReceipt(
        purchase_order_id=po.id,
        receipt_number=receipt_num,
        received_date=date.today(),
        notes=data.notes,
        created_by_user_id=user_id,
        created_at=datetime.utcnow()
    )
    db.add(receipt)

    # Process received items
    for item_input in data.items:
        po_item = db.query(PurchaseOrderItem).filter(
            PurchaseOrderItem.id == item_input.po_item_id,
            PurchaseOrderItem.purchase_order_id == po.id
        ).first()

        if not po_item:
            continue

        qty_now = item_input.quantity_received_now
        po_item.quantity_received = round(po_item.quantity_received + qty_now, 4)

        # Update stock and WAC via inventory ledger
        record_stock_movement(
            db=db,
            business_id=business_id,
            product_id=po_item.product_id,
            movement_type=MovementTypeEnum.PURCHASE_RECEIVE,
            quantity=qty_now,
            unit_cost=po_item.unit_cost,
            reference_type="purchase_order",
            reference_id=po.po_number,
            reason=f"Purchase receiving from {po.supplier.name} ({receipt_num})",
            user_id=user_id
        )

        # Record product batch if batch number is provided
        if item_input.batch_number:
            batch = ProductBatch(
                business_id=business_id,
                product_id=po_item.product_id,
                batch_number=item_input.batch_number,
                quantity=qty_now,
                purchase_cost=po_item.unit_cost,
                expiry_date=item_input.expiry_date,
                received_date=date.today(),
                is_active=True
            )
            db.add(batch)

    # Update PO status: check if all items are fully received
    all_completed = True
    any_received = False
    for item in po.items:
        if item.quantity_received < item.quantity_ordered:
            all_completed = False
        if item.quantity_received > 0:
            any_received = True

    if all_completed:
        po.status = POStatusEnum.COMPLETED
        po.received_date = date.today()
    elif any_received:
        po.status = POStatusEnum.PARTIALLY_RECEIVED

    db.commit()
    db.refresh(po)
    return po
