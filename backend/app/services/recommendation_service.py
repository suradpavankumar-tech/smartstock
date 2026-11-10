import math
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.models.product import Product
from app.models.purchase import PurchaseOrder, PurchaseOrderItem, POStatusEnum, Supplier
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatusEnum
from app.schemas.forecast import ReorderRecommendationOut

def calculate_reorder_recommendations(
    db: Session,
    business_id: int,
    all_items: bool = True
) -> List[ReorderRecommendationOut]:
    """
    Calculates explainable replenishment recommendations.
    Uses active store operating days to prevent 30-day dilution on newer stores.
    Returns all active items with their urgency and needs_reorder flags.
    """
    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    ).order_by(Product.name).all()

    # Pre-fetch pending incoming PO quantities per product
    incoming_po_q = db.query(
        PurchaseOrderItem.product_id,
        func.sum(PurchaseOrderItem.quantity_ordered - PurchaseOrderItem.quantity_received).label("pending_qty")
    ).join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)\
     .filter(
        PurchaseOrder.business_id == business_id,
        PurchaseOrder.status.in_([POStatusEnum.ORDERED, POStatusEnum.PARTIALLY_RECEIVED])
    ).group_by(PurchaseOrderItem.product_id).all()

    incoming_map = {row.product_id: max(0.0, float(row.pending_qty or 0.0)) for row in incoming_po_q}

    # Determine genuine store active operating span
    earliest_sale = db.query(func.min(Invoice.created_at)).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED
    ).scalar()

    if earliest_sale:
        store_age_days = max(1, (date.today() - earliest_sale.date()).days + 1)
    else:
        store_age_days = 1

    effective_operating_days = max(1, min(30, store_age_days))

    # Pre-fetch past 30 days total sales per product
    thirty_days_ago = datetime.now() - timedelta(days=30)
    sales_q = db.query(
        InvoiceItem.product_id,
        func.sum(InvoiceItem.quantity).label("total_sold"),
        func.count(func.distinct(func.date(Invoice.created_at))).label("distinct_days")
    ).join(Invoice, Invoice.id == InvoiceItem.invoice_id)\
     .filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
        Invoice.created_at >= thirty_days_ago
    ).group_by(InvoiceItem.product_id).all()

    sales_map = {row.product_id: (float(row.total_sold or 0.0), int(row.distinct_days or 0)) for row in sales_q}

    # Fallback default supplier if none is assigned to product
    default_supplier = db.query(Supplier).filter(
        Supplier.business_id == business_id,
        func.upper(func.coalesce(Supplier.is_active, "YES")) != "NO"
    ).first()

    recommendations = []

    for p in products:
        incoming_stock = incoming_map.get(p.id, 0.0)
        effective_stock = p.current_stock + incoming_stock

        total_sold, distinct_days = sales_map.get(p.id, (0.0, 0))
        # Daily sales rate using active store operating span
        avg_daily = (total_sold / effective_operating_days) if total_sold > 0 else 0.0

        # Supplier lead time
        active_supplier = p.supplier or default_supplier
        lead_time = active_supplier.lead_time_days if active_supplier else 3
        lead_time_demand = avg_daily * lead_time
        
        # Safety stock: buffer based on demand variability and reorder threshold
        safety_stock = max(p.reorder_threshold * 0.5, avg_daily * 2.0)
        reorder_point = max(p.reorder_threshold, lead_time_demand + safety_stock)

        # Days until stockout at current daily sales velocity
        if avg_daily > 0:
            days_to_stockout = p.current_stock / avg_daily
        elif p.current_stock <= 0:
            days_to_stockout = 0.0
        else:
            days_to_stockout = 999.0

        # Check if replenishment is needed
        needs_reorder = (
            effective_stock <= reorder_point or
            p.current_stock <= p.reorder_threshold or
            p.current_stock <= 0 or
            (avg_daily > 0 and days_to_stockout <= (lead_time + 2))
        )

        # Determine urgency
        if p.current_stock <= 0:
            urgency = "CRITICAL"
        elif days_to_stockout <= lead_time:
            urgency = "CRITICAL"
        elif effective_stock <= (reorder_point * 0.75) or p.current_stock <= p.reorder_threshold:
            urgency = "HIGH"
        elif effective_stock <= reorder_point:
            urgency = "MEDIUM"
        elif days_to_stockout <= (lead_time + 5):
            urgency = "LOW"
        else:
            urgency = "HEALTHY"

        # Recommended order quantity
        # Buffer up to target: 2x reorder point or minimum order quantity
        target_stock = max(p.min_order_qty * 2.0, reorder_point * 1.5, lead_time_demand * 3.0)
        raw_order_qty = max(0.0, target_stock - effective_stock)
        
        # Snap to pack size / MOQ
        order_qty = max(p.min_order_qty, math.ceil(raw_order_qty))
        estimated_cost = round(order_qty * p.purchase_cost, 2)

        # Supplier identification
        supplier_id = p.supplier_id or (default_supplier.id if default_supplier else None)
        supplier_name = (
            p.supplier.name if p.supplier
            else (default_supplier.name if default_supplier else "No Supplier Assigned")
        )

        # Plain-language explanation
        if p.current_stock <= 0:
            reason_text = (
                f"STOCKOUT ALERT: Current inventory is 0 {p.unit}. "
                f"Immediate purchase order of {order_qty} {p.unit} required from '{supplier_name}' "
                f"(Lead time: {lead_time} days)."
            )
        elif avg_daily > 0:
            reason_text = (
                f"Stock is {p.current_stock} {p.unit} ({incoming_stock} inbound PO). "
                f"Burn rate: {avg_daily:.1f} {p.unit}/day. "
                f"Runway: ~{days_to_stockout:.1f} days vs {lead_time}d supplier lead time. "
                f"Reorder point is {reorder_point:.1f} {p.unit}."
            )
        else:
            reason_text = (
                f"Stock of {p.current_stock} {p.unit} vs configured reorder threshold of {p.reorder_threshold} {p.unit}. "
                f"No POS sales recorded recently. MOQ is {p.min_order_qty} {p.unit}."
            )

        item_rec = ReorderRecommendationOut(
            product_id=p.id,
            product_name=p.name,
            sku=p.sku,
            current_stock=p.current_stock,
            incoming_po_stock=incoming_stock,
            effective_stock=effective_stock,
            avg_daily_demand=round(avg_daily, 2),
            supplier_lead_time_days=lead_time,
            lead_time_demand=round(lead_time_demand, 2),
            safety_stock=round(safety_stock, 2),
            reorder_point=round(reorder_point, 2),
            recommended_order_qty=order_qty,
            min_order_qty=p.min_order_qty,
            unit=p.unit,
            unit_cost=p.purchase_cost,
            estimated_cost=estimated_cost,
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            urgency_level=urgency,
            stockout_risk_days=round(days_to_stockout, 1) if days_to_stockout < 999.0 else None,
            needs_reorder=needs_reorder,
            reason=reason_text,
            is_forecast_backed=distinct_days >= 7 or store_age_days >= 7
        )

        if all_items or needs_reorder:
            recommendations.append(item_rec)

    # Sort by urgency (CRITICAL first, then HIGH, MEDIUM, LOW, HEALTHY)
    urgency_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "HEALTHY": 4}
    recommendations.sort(key=lambda r: (urgency_order.get(r.urgency_level, 5), r.stockout_risk_days or 999.0))
    return recommendations

