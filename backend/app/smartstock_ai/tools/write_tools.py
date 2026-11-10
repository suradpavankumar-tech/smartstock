import json
import uuid
from datetime import date
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import TenantContext, record_audit_log
from app.models.ai import AIApproval, AIDocument, AIWorkflow, utc_now
from app.models.customer import Customer
from app.models.expense import Expense, ExpenseCategoryEnum
from app.models.inventory import MovementTypeEnum
from app.models.invoice import Invoice
from app.models.product import Product
from app.models.purchase import Supplier
from app.schemas.purchase import POCreate, POItemCreate
from app.services.inventory_service import record_stock_movement
from app.services.purchase_service import create_purchase_order
from app.smartstock_ai.security.guard import can_approve_action, is_tool_allowed


def _new_idempotency_key(action_type: str) -> str:
    return f"ai_{action_type.lower()}_{uuid.uuid4().hex[:16]}"


def create_approval_request(
    db: Session,
    ctx: TenantContext,
    *,
    action_type: str,
    title: str,
    summary: str,
    preview: Dict[str, Any],
    payload: Dict[str, Any],
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
) -> AIApproval:
    """Persists an immutable PENDING approval draft — NEVER mutates business data before user confirmation."""
    if not is_tool_allowed(ctx.membership.role.value, action_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{ctx.membership.role.value}' is not authorized to propose '{action_type}'.",
        )

    approval = AIApproval(
        business_id=ctx.business.id,
        conversation_id=conversation_id,
        task_id=task_id,
        requested_by_user_id=ctx.user.id,
        action_type=action_type,
        title=title,
        summary=summary,
        preview_json=json.dumps(preview, default=str),
        payload_json=json.dumps(payload, default=str),
        idempotency_key=_new_idempotency_key(action_type),
        status="PENDING",
    )
    db.add(approval)
    db.flush()

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action=f"AI_PROPOSE_{action_type}",
        entity_type="ai_approval",
        entity_id=str(approval.id),
        details={"title": title, "idempotency_key": approval.idempotency_key},
    )
    return approval


def build_purchase_order_approval_draft(
    db: Session,
    ctx: TenantContext,
    *,
    supplier_id: int,
    items: List[Dict[str, Any]],
    notes: Optional[str] = None,
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> AIApproval:
    bid = ctx.business.id
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.business_id == bid).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Target supplier not found in workspace")
    if not items:
        raise HTTPException(status_code=400, detail="Purchase order draft requires at least 1 product line")

    preview_lines = []
    payload_items = []
    est_subtotal = 0.0
    est_tax = 0.0
    for it in items:
        prod = db.query(Product).filter(Product.id == int(it["product_id"]), Product.business_id == bid).first()
        if not prod:
            continue
        qty = max(1.0, float(it["quantity_ordered"]))
        unit_cost = max(0.0, float(it.get("unit_cost", prod.purchase_cost)))
        tax_rate = max(0.0, float(it.get("tax_rate_percent", 0.0)))
        line_sub = round(qty * unit_cost, 2)
        line_tax = round(line_sub * tax_rate / 100.0, 2)
        est_subtotal += line_sub
        est_tax += line_tax
        preview_lines.append({
            "product_id": prod.id,
            "product_name": prod.name,
            "current_stock": prod.current_stock,
            "unit": prod.unit,
            "quantity_ordered": qty,
            "unit_cost": unit_cost,
            "tax_rate_percent": tax_rate,
            "line_total": round(line_sub + line_tax, 2),
        })
        payload_items.append({
            "product_id": prod.id,
            "quantity_ordered": qty,
            "unit_cost": unit_cost,
            "tax_rate_percent": tax_rate,
        })

    if not payload_items:
        raise HTTPException(status_code=400, detail="No valid products resolved for Purchase Order draft")

    total_amount = round(est_subtotal + est_tax, 2)
    preview = {
        "action": "CREATE_PURCHASE_ORDER",
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "lead_time_days": supplier.lead_time_days,
        "line_count": len(preview_lines),
        "subtotal": round(est_subtotal, 2),
        "tax_amount": round(est_tax, 2),
        "total_amount": total_amount,
        "items": preview_lines,
        "notes": notes or "AI-prepared replenishment PO awaiting owner/manager approval",
    }
    payload = {
        "supplier_id": supplier.id,
        "items": payload_items,
        "notes": notes or "Created from approved SmartStock AI Ultra Purchase Draft",
    }
    if language == "kn":
        po_title = f"ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್: {supplier.name} ({len(preview_lines)} ವಸ್ತು{'ಗಳು' if len(preview_lines) > 1 else ''})"
        po_summary = f"{supplier.name} ರಿಂದ {len(preview_lines)} ವಸ್ತು(ಗಳಿಗೆ) ಒಟ್ಟು ₹{total_amount:,.2f} ಆರ್ಡರ್ (ಡೆಲಿವರಿ ~{supplier.lead_time_days} ದಿನ)."
    elif language == "hi":
        po_title = f"परचेज़ ऑर्डर ड्राफ्ट: {supplier.name} ({len(preview_lines)} आइटम)"
        po_summary = f"{supplier.name} से {len(preview_lines)} आइटम का ऑर्डर — कुल ₹{total_amount:,.2f} (लीड टाइम {supplier.lead_time_days} दिन)।"
    else:
        po_title = f"PO Draft: {supplier.name} ({len(preview_lines)} SKU{'s' if len(preview_lines) > 1 else ''})"
        po_summary = f"Order {len(preview_lines)} item(s) from {supplier.name} totaling ₹{total_amount:,.2f} (lead time {supplier.lead_time_days}d)."

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="CREATE_PURCHASE_ORDER",
        title=po_title,
        summary=po_summary,
        preview=preview,
        payload=payload,
        conversation_id=conversation_id,
        task_id=task_id,
    )


def build_stock_adjustment_draft(
    db: Session,
    ctx: TenantContext,
    *,
    product_id: int,
    quantity_delta: float,
    reason: str,
    movement_type: str = "AUDIT_CORRECTION",
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> AIApproval:
    prod = db.query(Product).filter(Product.id == product_id, Product.business_id == ctx.business.id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found in workspace")
    projected_stock = round(prod.current_stock + quantity_delta, 4)
    if projected_stock < 0:
        raise HTTPException(status_code=400, detail=f"Stock adjustment would make '{prod.name}' negative ({projected_stock}).")

    preview = {
        "action": "ADJUST_STOCK",
        "product_id": prod.id,
        "product_name": prod.name,
        "unit": prod.unit,
        "before_stock": prod.current_stock,
        "quantity_delta": quantity_delta,
        "after_stock": projected_stock,
        "estimated_value_impact": round(abs(quantity_delta) * prod.purchase_cost, 2),
        "movement_type": movement_type,
        "reason": reason,
    }
    payload = {
        "product_id": prod.id,
        "quantity_delta": quantity_delta,
        "movement_type": movement_type,
        "reason": reason,
    }
    if language == "kn":
        st_title = f"ಸ್ಟಾಕ್ ತಿದ್ದುಪಡಿ: {prod.name} ({quantity_delta:+.2f} {prod.unit})"
        st_summary = f"{prod.name} ಸ್ಟಾಕ್ ಅನ್ನು {prod.current_stock} ರಿಂದ {projected_stock} {prod.unit} ಗೆ ಬದಲಾಯಿಸಿ. ಕಾರಣ: {reason}"
    elif language == "hi":
        st_title = f"स्टॉक सुधार: {prod.name} ({quantity_delta:+.2f} {prod.unit})"
        st_summary = f"{prod.name} स्टॉक {prod.current_stock} से {projected_stock} {prod.unit} करें। कारण: {reason}"
    else:
        st_title = f"Adjust Stock: {prod.name} ({quantity_delta:+.2f} {prod.unit})"
        st_summary = f"Change {prod.name} stock from {prod.current_stock} to {projected_stock} {prod.unit}. Reason: {reason}"

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="ADJUST_STOCK",
        title=st_title,
        summary=st_summary,
        preview=preview,
        payload=payload,
        conversation_id=conversation_id,
        task_id=task_id,
    )


def build_price_update_draft(
    db: Session,
    ctx: TenantContext,
    *,
    product_id: int,
    new_selling_price: float,
    new_purchase_cost: Optional[float] = None,
    reason: str = "AI margin optimization",
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> AIApproval:
    prod = db.query(Product).filter(Product.id == product_id, Product.business_id == ctx.business.id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    if new_selling_price < 0:
        raise HTTPException(status_code=400, detail="Selling price cannot be negative")

    eff_cost = round(float(new_purchase_cost), 2) if new_purchase_cost is not None else prod.purchase_cost
    old_margin = round(((prod.selling_price - prod.purchase_cost) / prod.selling_price * 100.0), 1) if prod.selling_price > 0 else 0.0
    new_margin = round(((new_selling_price - eff_cost) / new_selling_price * 100.0), 1) if new_selling_price > 0 else 0.0

    preview = {
        "action": "UPDATE_PRODUCT_PRICE",
        "product_id": prod.id,
        "product_name": prod.name,
        "old_selling_price": prod.selling_price,
        "new_selling_price": round(new_selling_price, 2),
        "old_purchase_cost": prod.purchase_cost,
        "new_purchase_cost": eff_cost,
        "old_margin_percent": old_margin,
        "new_margin_percent": new_margin,
        "reason": reason,
    }
    payload = {
        "product_id": prod.id,
        "new_selling_price": round(new_selling_price, 2),
        "new_purchase_cost": eff_cost,
        "reason": reason,
    }
    if language == "kn":
        pu_title = f"ಬೆಲೆ ಬದಲಾವಣೆ: {prod.name} (₹{prod.selling_price} → ₹{new_selling_price:.2f})"
        pu_summary = f"'{prod.name}' ಮಾರಾಟ ಬೆಲೆಯನ್ನು ₹{prod.selling_price:,.2f} ರಿಂದ ₹{new_selling_price:,.2f} ಗೆ ಬದಲಾಯಿಸಿ (ಮಾರ್ಜಿನ್ {old_margin}% → {new_margin}%)."
    elif language == "hi":
        pu_title = f"कीमत अपडेट: {prod.name} (₹{prod.selling_price} → ₹{new_selling_price:.2f})"
        pu_summary = f"'{prod.name}' का विक्रय मूल्य ₹{prod.selling_price:,.2f} से ₹{new_selling_price:,.2f} करें (मार्जिन {old_margin}% → {new_margin}%)।"
    else:
        pu_title = f"Price Update: {prod.name} (₹{prod.selling_price} -> ₹{new_selling_price:.2f})"
        pu_summary = f"Update '{prod.name}' selling price from ₹{prod.selling_price:,.2f} to ₹{new_selling_price:,.2f} (margin {old_margin}% -> {new_margin}%)."

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="UPDATE_PRODUCT_PRICE",
        title=pu_title,
        summary=pu_summary,
        preview=preview,
        payload=payload,
        conversation_id=conversation_id,
        task_id=task_id,
    )


def build_expense_approval_draft(
    db: Session,
    ctx: TenantContext,
    *,
    title: str,
    amount: float,
    category: str = "OTHER",
    payment_method: str = "CASH",
    notes: Optional[str] = None,
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> AIApproval:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Expense amount must be positive")
    valid_cat = category.upper() if category.upper() in [e.value for e in ExpenseCategoryEnum] else "OTHER"
    preview = {
        "action": "RECORD_EXPENSE",
        "title": title.strip(),
        "amount": round(amount, 2),
        "category": valid_cat,
        "payment_method": payment_method.upper(),
        "expense_date": date.today().isoformat(),
        "notes": notes,
    }
    if language == "kn":
        ex_title = f"ವೆಚ್ಚ ದಾಖಲೆ: {title.strip()} (₹{amount:,.2f})"
        ex_summary = f"{valid_cat} ಅಡಿಯಲ್ಲಿ ₹{amount:,.2f} ವೆಚ್ಚವನ್ನು ({payment_method.upper()}) ದಾಖಲಿಸಿ."
    elif language == "hi":
        ex_title = f"खर्च दर्ज: {title.strip()} (₹{amount:,.2f})"
        ex_summary = f"{valid_cat} श्रेणी में ₹{amount:,.2f} का खर्च ({payment_method.upper()}) दर्ज करें।"
    else:
        ex_title = f"Record Expense: {title.strip()} (₹{amount:,.2f})"
        ex_summary = f"Log ₹{amount:,.2f} under {valid_cat} via {payment_method.upper()}."

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="RECORD_EXPENSE",
        title=ex_title,
        summary=ex_summary,
        preview=preview,
        payload=preview.copy(),
        conversation_id=conversation_id,
        task_id=task_id,
    )


def build_khata_payment_draft(
    db: Session,
    ctx: TenantContext,
    *,
    customer_id: int,
    amount: float,
    payment_method: str = "CASH",
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> AIApproval:
    cust = db.query(Customer).filter(Customer.id == customer_id, Customer.business_id == ctx.business.id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found in workspace")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Khata payment amount must be positive")

    new_bal = round(max(0.0, float(cust.outstanding_balance or 0.0) - amount), 2)
    preview = {
        "action": "RECORD_KHATA_PAYMENT",
        "customer_id": cust.id,
        "customer_name": cust.name,
        "before_balance": round(float(cust.outstanding_balance or 0.0), 2),
        "payment_amount": round(amount, 2),
        "after_balance": new_bal,
        "payment_method": payment_method.upper(),
    }
    payload = {
        "customer_id": cust.id,
        "amount": round(amount, 2),
        "payment_method": payment_method.upper(),
    }
    if language == "kn":
        kh_title = f"ಖಾತಾ ಪಾವತಿ: {cust.name} (₹{amount:,.2f})"
        kh_summary = f"{cust.name} ರವರ ₹{amount:,.2f} ಪಾವತಿ ದಾಖಲಿಸಿ (ಬಾಕಿ ₹{preview['before_balance']:,.2f} → ₹{new_bal:,.2f})."
    elif language == "hi":
        kh_title = f"खाता भुगतान: {cust.name} (₹{amount:,.2f})"
        kh_summary = f"{cust.name} का ₹{amount:,.2f} भुगतान दर्ज करें (बकाया ₹{preview['before_balance']:,.2f} → ₹{new_bal:,.2f})।"
    else:
        kh_title = f"Khata Settlement: {cust.name} (₹{amount:,.2f})"
        kh_summary = f"Record ₹{amount:,.2f} payment from {cust.name} (balance ₹{preview['before_balance']:,.2f} -> ₹{new_bal:,.2f})."

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="RECORD_KHATA_PAYMENT",
        title=kh_title,
        summary=kh_summary,
        preview=preview,
        payload=payload,
        conversation_id=conversation_id,
        task_id=task_id,
    )


def build_document_import_draft(
    db: Session,
    ctx: TenantContext,
    *,
    document: AIDocument,
    extracted: Dict[str, Any],
    conversation_id: Optional[int] = None,
    task_id: Optional[int] = None,
    language: str = "en",
) -> Optional[AIApproval]:
    matched_lines = [it for it in extracted.get("line_items", []) if it.get("matched_product_id") and float(it.get("quantity", 0)) > 0]
    if not matched_lines:
        return None
    supplier_id = extracted.get("matched_supplier_id")
    preview = {
        "action": "IMPORT_DOCUMENT_ITEMS",
        "document_id": document.id,
        "filename": document.filename,
        "document_type": document.document_type,
        "matched_supplier_id": supplier_id,
        "matched_supplier_name": extracted.get("matched_supplier_name"),
        "matched_items_count": len(matched_lines),
        "items": matched_lines[:25],
    }
    payload = {
        "document_id": document.id,
        "supplier_id": supplier_id,
        "items": [
            {
                "product_id": int(it["matched_product_id"]),
                "quantity": float(it["quantity"]),
                "unit_cost": float(it.get("unit_cost") or 0.0),
            }
            for it in matched_lines
        ],
    }
    if language == "kn":
        doc_title = f"ದಾಖಲೆಯಿಂದ ಸ್ಟಾಕ್ ಆಮದು: {document.filename}"
        doc_summary = f"{document.filename} ನಲ್ಲಿ ಗುರುತಿಸಿದ {len(matched_lines)} ವಸ್ತುಗಳನ್ನು ಸ್ಟಾಕ್‌ಗೆ ಸೇರಿಸಿ."
    elif language == "hi":
        doc_title = f"दस्तावेज़ स्टॉक आयात: {document.filename}"
        doc_summary = f"{document.filename} से {len(matched_lines)} आइटम स्टॉक में जोड़ें।"
    else:
        doc_title = f"Import Document Stock: {document.filename}"
        doc_summary = f"Receive stock & update Weighted Average Cost for {len(matched_lines)} matched SKU(s) extracted from {document.filename}."

    return create_approval_request(
        db=db,
        ctx=ctx,
        action_type="IMPORT_DOCUMENT_ITEMS",
        title=doc_title,
        summary=doc_summary,
        preview=preview,
        payload=payload,
        conversation_id=conversation_id,
        task_id=task_id,
    )


def execute_approved_action(
    db: Session,
    ctx: TenantContext,
    approval: AIApproval,
    decision_note: Optional[str] = None,
    edited_payload: Optional[Dict[str, Any]] = None,
) -> AIApproval:
    """Executes an approved AIAction atomically, idempotently, and with full audit logging."""
    if approval.business_id != ctx.business.id:
        raise HTTPException(status_code=404, detail="Approval request not found")

    if not can_approve_action(ctx.membership.role.value, approval.action_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{ctx.membership.role.value}' is not authorized to approve '{approval.action_type}'.",
        )

    # Strict idempotency: never execute twice
    if approval.status == "EXECUTED":
        return approval
    if approval.status == "REJECTED":
        raise HTTPException(status_code=409, detail="Cannot approve an already rejected request")

    payload = json.loads(approval.payload_json or "{}")
    if edited_payload and isinstance(edited_payload, dict):
        payload.update(edited_payload)
        approval.payload_json = json.dumps(payload, default=str)

    result: Dict[str, Any] = {}
    action_type = approval.action_type

    try:
        if action_type == "CREATE_PURCHASE_ORDER":
            po_in = POCreate(
                supplier_id=int(payload["supplier_id"]),
                notes=payload.get("notes"),
                items=[
                    POItemCreate(
                        product_id=int(it["product_id"]),
                        quantity_ordered=float(it["quantity_ordered"]),
                        unit_cost=float(it["unit_cost"]),
                        tax_rate_percent=float(it.get("tax_rate_percent", 0.0)),
                    )
                    for it in payload["items"]
                ],
            )
            po = create_purchase_order(db, ctx.business.id, ctx.user.id, po_in)
            result = {
                "purchase_order_id": po.id,
                "po_number": po.po_number,
                "status": po.status.value,
                "total_amount": po.total_amount,
                "items_count": len(po.items),
            }

        elif action_type == "ADJUST_STOCK":
            prod = db.query(Product).filter(
                Product.id == int(payload["product_id"]),
                Product.business_id == ctx.business.id,
            ).first()
            if not prod:
                raise HTTPException(status_code=404, detail="Target product not found")
            mv_type_str = payload.get("movement_type", "AUDIT_CORRECTION")
            mv_type = MovementTypeEnum[mv_type_str] if mv_type_str in MovementTypeEnum.__members__ else MovementTypeEnum.AUDIT_CORRECTION
            mv = record_stock_movement(
                db=db,
                business_id=ctx.business.id,
                product_id=prod.id,
                movement_type=mv_type,
                quantity=float(payload["quantity_delta"]),
                unit_cost=prod.purchase_cost,
                reference_type="ai_approval",
                reference_id=approval.idempotency_key,
                reason=payload.get("reason") or "Approved via SmartStock AI Ultra",
                user_id=ctx.user.id,
            )
            db.flush()
            result = {
                "movement_id": mv.id,
                "product_id": prod.id,
                "product_name": prod.name,
                "new_stock_balance": prod.current_stock,
            }

        elif action_type == "UPDATE_PRODUCT_PRICE":
            prod = db.query(Product).filter(
                Product.id == int(payload["product_id"]),
                Product.business_id == ctx.business.id,
            ).first()
            if not prod:
                raise HTTPException(status_code=404, detail="Product not found")
            old_price = prod.selling_price
            old_cost = prod.purchase_cost
            prod.selling_price = round(float(payload["new_selling_price"]), 2)
            if payload.get("new_purchase_cost") is not None:
                prod.purchase_cost = round(float(payload["new_purchase_cost"]), 2)
            db.flush()
            result = {
                "product_id": prod.id,
                "product_name": prod.name,
                "old_selling_price": old_price,
                "new_selling_price": prod.selling_price,
                "old_purchase_cost": old_cost,
                "new_purchase_cost": prod.purchase_cost,
            }

        elif action_type == "RECORD_EXPENSE":
            exp = Expense(
                business_id=ctx.business.id,
                category=ExpenseCategoryEnum(payload.get("category", "OTHER")),
                title=str(payload["title"]).strip(),
                amount=round(float(payload["amount"]), 2),
                payment_method=str(payload.get("payment_method", "CASH")).upper(),
                expense_date=date.fromisoformat(payload["expense_date"]) if payload.get("expense_date") else date.today(),
                notes=payload.get("notes") or f"Recorded via AI Approval {approval.idempotency_key}",
                created_by_user_id=ctx.user.id,
            )
            db.add(exp)
            db.flush()
            result = {
                "expense_id": exp.id,
                "title": exp.title,
                "amount": exp.amount,
                "category": exp.category.value,
            }

        elif action_type == "RECORD_KHATA_PAYMENT":
            cust = db.query(Customer).filter(
                Customer.id == int(payload["customer_id"]),
                Customer.business_id == ctx.business.id,
            ).first()
            if not cust:
                raise HTTPException(status_code=404, detail="Customer not found")
            amt = round(float(payload["amount"]), 2)
            old_bal = round(float(cust.outstanding_balance or 0.0), 2)
            cust.outstanding_balance = round(max(0.0, old_bal - amt), 2)
            if cust.outstanding_balance == 0.0:
                due_invs = (
                    db.query(Invoice)
                    .filter(Invoice.customer_id == cust.id, Invoice.business_id == ctx.business.id, Invoice.payment_status == "DUE")
                    .all()
                )
                for inv in due_invs:
                    inv.payment_status = "PAID"
            db.flush()
            result = {
                "customer_id": cust.id,
                "customer_name": cust.name,
                "amount_paid": amt,
                "previous_balance": old_bal,
                "remaining_balance": cust.outstanding_balance,
            }

        elif action_type == "IMPORT_DOCUMENT_ITEMS":
            updated_skus = []
            for it in payload.get("items", []):
                prod = db.query(Product).filter(
                    Product.id == int(it["product_id"]),
                    Product.business_id == ctx.business.id,
                ).first()
                if not prod:
                    continue
                qty = float(it.get("quantity", 0))
                unit_cost = float(it.get("unit_cost") or prod.purchase_cost)
                if qty > 0:
                    record_stock_movement(
                        db=db,
                        business_id=ctx.business.id,
                        product_id=prod.id,
                        movement_type=MovementTypeEnum.PURCHASE_RECEIVE,
                        quantity=qty,
                        unit_cost=unit_cost,
                        reference_type="ai_document",
                        reference_id=str(payload.get("document_id")),
                        reason=f"Imported from approved AI Document #{payload.get('document_id')}",
                        user_id=ctx.user.id,
                    )
                    updated_skus.append({"product_id": prod.id, "product_name": prod.name, "added_qty": qty, "new_stock": prod.current_stock})
            db.flush()
            result = {"imported_count": len(updated_skus), "updated_items": updated_skus}

        elif action_type == "ENABLE_WORKFLOW":
            wf = db.query(AIWorkflow).filter(
                AIWorkflow.id == int(payload["workflow_id"]),
                AIWorkflow.business_id == ctx.business.id,
            ).first()
            if not wf:
                raise HTTPException(status_code=404, detail="Workflow not found")
            wf.is_active = True
            db.flush()
            result = {"workflow_id": wf.id, "name": wf.name, "is_active": True}

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported approval action type: {action_type}")

        now = utc_now()
        approval.status = "EXECUTED"
        approval.approved_by_user_id = ctx.user.id
        approval.decision_note = decision_note
        approval.decided_at = now
        approval.executed_at = now
        approval.execution_result_json = json.dumps(result, default=str)
        db.commit()
        db.refresh(approval)

        record_audit_log(
            db=db,
            business_id=ctx.business.id,
            user_id=ctx.user.id,
            action=f"AI_EXECUTE_{action_type}",
            entity_type="ai_approval",
            entity_id=str(approval.id),
            details={"idempotency_key": approval.idempotency_key, "result": result},
        )
        return approval

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        approval.status = "FAILED"
        approval.decision_note = str(exc)
        db.commit()
        raise HTTPException(status_code=400, detail=f"Execution failed safely: {exc}")


def reject_approval_action(
    db: Session,
    ctx: TenantContext,
    approval: AIApproval,
    decision_note: Optional[str] = None,
) -> AIApproval:
    if approval.business_id != ctx.business.id:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if approval.status == "EXECUTED":
        raise HTTPException(status_code=409, detail="Cannot reject an already executed action")
    approval.status = "REJECTED"
    approval.approved_by_user_id = ctx.user.id
    approval.decision_note = decision_note or "Rejected by user"
    approval.decided_at = utc_now()
    db.commit()
    db.refresh(approval)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action=f"AI_REJECT_{approval.action_type}",
        entity_type="ai_approval",
        entity_id=str(approval.id),
        details={"reason": approval.decision_note},
    )
    return approval
