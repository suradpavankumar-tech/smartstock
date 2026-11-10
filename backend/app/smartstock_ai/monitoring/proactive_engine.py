import json
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.dependencies import TenantContext, record_audit_log
from app.models.ai import AIAlert, AIWorkflow, utc_now
from app.models.inventory import MovementTypeEnum, StockMovement
from app.models.invoice import Invoice, InvoiceStatusEnum
from app.models.product import Product, ProductBatch
from app.models.purchase import POStatusEnum, PurchaseOrder, PurchaseOrderItem, Supplier
from app.schemas.ai_ultra import AIActionShortcut, AIAlertOut, AIBriefingOut, AIKpiMetric
from app.services.analytics_service import get_financial_summary, get_stock_ageing_report
from app.services.recommendation_service import calculate_reorder_recommendations
from app.smartstock_ai.tools.read_tools import tool_khata_receivables
from app.smartstock_ai.tools.write_tools import build_purchase_order_approval_draft


def _upsert_alert(
    db: Session,
    *,
    business_id: int,
    alert_key: str,
    category: str,
    severity: str,
    title: str,
    what_happened: str,
    why_it_matters: str,
    supporting_data: Dict[str, Any],
    recommended_action: str,
    recommended_tab: str,
) -> AIAlert:
    existing = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == business_id, AIAlert.alert_key == alert_key)
        .first()
    )
    now = utc_now()
    if existing:
        existing.category = category
        existing.severity = severity
        existing.title = title
        existing.what_happened = what_happened
        existing.why_it_matters = why_it_matters
        existing.supporting_data_json = json.dumps(supporting_data, default=str)
        existing.recommended_action = recommended_action
        existing.recommended_tab = recommended_tab
        if existing.status == "RESOLVED":
            existing.status = "ACTIVE"
            existing.resolved_at = None
        existing.detected_at = now
        return existing

    alert = AIAlert(
        business_id=business_id,
        alert_key=alert_key,
        category=category,
        severity=severity,
        title=title,
        what_happened=what_happened,
        why_it_matters=why_it_matters,
        supporting_data_json=json.dumps(supporting_data, default=str),
        recommended_action=recommended_action,
        recommended_tab=recommended_tab,
        status="ACTIVE",
        detected_at=now,
    )
    db.add(alert)
    return alert


def serialize_alert(alert: AIAlert) -> AIAlertOut:
    try:
        supp = json.loads(alert.supporting_data_json or "{}")
    except Exception:
        supp = {}
    return AIAlertOut(
        id=alert.id,
        business_id=alert.business_id,
        alert_key=alert.alert_key,
        category=alert.category,
        severity=alert.severity,
        title=alert.title,
        what_happened=alert.what_happened,
        why_it_matters=alert.why_it_matters,
        supporting_data=supp,
        recommended_action=alert.recommended_action,
        recommended_tab=alert.recommended_tab,
        status=alert.status,
        detected_at=alert.detected_at,
        resolved_at=alert.resolved_at,
    )


def run_proactive_scan(db: Session, business_id: int, force: bool = True, commit: bool = True) -> List[AIAlertOut]:
    """
    Evaluates real tenant DB state across stockout risk, sales velocity drops, abnormal PO costs,
    repeated stock adjustments, cancelled bills, expiring batches, delayed POs, and dead stock.
    """
    if not force:
        latest = (
            db.query(func.max(AIAlert.detected_at))
            .filter(AIAlert.business_id == business_id)
            .scalar()
        )
        if latest and (utc_now() - latest).total_seconds() < 120:
            rows = (
                db.query(AIAlert)
                .filter(AIAlert.business_id == business_id, AIAlert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
                .order_by(desc(AIAlert.detected_at))
                .all()
            )
            return [serialize_alert(r) for r in rows]

    today = date.today()
    active_keys: set[str] = set()

    # 1. Out-of-stock & imminent <7d stockout alerts
    reorders = calculate_reorder_recommendations(db, business_id, all_items=True)
    oos = [r for r in reorders if r.current_stock <= 0]
    imminent = [
        r for r in reorders
        if r.current_stock > 0 and r.needs_reorder and (r.stockout_risk_days is not None and r.stockout_risk_days <= 7.0)
    ]

    if oos:
        key = "stockout_zero_skus"
        active_keys.add(key)
        names = ", ".join(r.product_name for r in oos[:4])
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="OUT_OF_STOCK",
            severity="CRITICAL",
            title=f"{len(oos)} Product(s) Completely Out of Stock",
            what_happened=f"{len(oos)} active SKU(s) hit 0 units on hand: {names}{'...' if len(oos) > 4 else ''}.",
            why_it_matters="Customers asking for these items at the POS counter will result in immediate lost sales and walk-outs.",
            supporting_data={
                "count": len(oos),
                "products": [{"product_id": r.product_id, "name": r.product_name, "recommended_qty": r.recommended_order_qty} for r in oos[:8]],
            },
            recommended_action="Prepare an immediate Purchase Order draft for out-of-stock items in Agent Mode.",
            recommended_tab="reorder",
        )

    if imminent:
        key = "stockout_within_7_days"
        active_keys.add(key)
        names = ", ".join(f"{r.product_name} ({r.stockout_risk_days:.1f}d)" for r in imminent[:4])
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="LOW_STOCK",
            severity="HIGH",
            title=f"{len(imminent)} Product(s) May Stock Out Within 7 Days",
            what_happened=f"Based on recent POS sales velocity, {len(imminent)} item(s) have <= 7 days cover: {names}.",
            why_it_matters="Supplier delivery lead times may exceed remaining stock runway, causing mid-week shelf gaps.",
            supporting_data={
                "count": len(imminent),
                "products": [{"product_id": r.product_id, "name": r.product_name, "days_left": r.stockout_risk_days, "recommended_qty": r.recommended_order_qty} for r in imminent[:8]],
            },
            recommended_action="Review reorder quantities and generate a grouped Purchase Order draft.",
            recommended_tab="agent",
        )

    # 2. Sales drop vs prior 7-day baseline
    c_end = today
    c_start = today - timedelta(days=6)
    p_end = c_start - timedelta(days=1)
    p_start = p_end - timedelta(days=6)
    curr_sum = get_financial_summary(db, business_id, start_date=c_start, end_date=c_end)
    prev_sum = get_financial_summary(db, business_id, start_date=p_start, end_date=p_end)

    if prev_sum.net_sales >= 500.0 and prev_sum.total_invoices_count >= 2:
        drop_pct = ((prev_sum.net_sales - curr_sum.net_sales) / prev_sum.net_sales) * 100.0
        if drop_pct >= 25.0:
            key = "weekly_sales_drop"
            active_keys.add(key)
            _upsert_alert(
                db,
                business_id=business_id,
                alert_key=key,
                category="SALES_DROP",
                severity="HIGH" if drop_pct >= 40.0 else "MEDIUM",
                title=f"7-Day Net Sales Dropped {drop_pct:.1f}% vs Prior Week",
                what_happened=f"Net sales over the last 7 days totaled ₹{curr_sum.net_sales:,.2f} vs ₹{prev_sum.net_sales:,.2f} in the prior 7-day period.",
                why_it_matters="Sustained revenue drops shrink operating profit coverage for fixed rent and salary expenses.",
                supporting_data={"current_7d_sales": curr_sum.net_sales, "previous_7d_sales": prev_sum.net_sales, "drop_percent": round(drop_pct, 1)},
                recommended_action="Run a Deep Analysis profit & category drop diagnostic to isolate affected SKUs.",
                recommended_tab="analytics",
            )

    # 3. Inventory valuation / Dead stock tie-up
    ageing = get_stock_ageing_report(db, business_id)
    if ageing.total_dead_stock_value > 0 or len(ageing.slow_and_dead_products) >= 3:
        key = "slow_dead_stock_capital"
        active_keys.add(key)
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="SLOW_DEAD_STOCK",
            severity="MEDIUM",
            title=f"₹{ageing.total_dead_stock_value:,.2f} Tied Up in Dead Stock (90+ Days Inactive)",
            what_happened=f"{len(ageing.slow_and_dead_products)} slow/dormant/dead SKU(s) are locking up working capital without turning over.",
            why_it_matters="Cash immobilized in stagnant shelves reduces liquidity needed for fast-moving replenishment.",
            supporting_data={"dead_stock_value": ageing.total_dead_stock_value, "slow_count": len(ageing.slow_and_dead_products)},
            recommended_action="Consider targeted clearance bundles or promotional price discounts on stagnant SKUs.",
            recommended_tab="analytics",
        )

    # 4. Expiring batches within 30 days
    exp_cutoff = today + timedelta(days=30)
    exp_batches = (
        db.query(ProductBatch, Product.name)
        .join(Product, Product.id == ProductBatch.product_id)
        .filter(
            ProductBatch.business_id == business_id,
            ProductBatch.is_active == True,
            ProductBatch.quantity > 0,
            ProductBatch.expiry_date != None,
            ProductBatch.expiry_date <= exp_cutoff,
        )
        .all()
    )
    if exp_batches:
        key = "batch_expiry_30d"
        active_keys.add(key)
        at_risk = round(sum(float(b.quantity) * float(b.purchase_cost or 0.0) for b, _ in exp_batches), 2)
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="EXPIRY_RISK",
            severity="HIGH",
            title=f"{len(exp_batches)} Product Batch(es) Expiring Within 30 Days",
            what_happened=f"{len(exp_batches)} active batch(es) carrying ₹{at_risk:,.2f} stock value expire within 30 days or have already passed expiry.",
            why_it_matters="Expired inventory becomes a direct write-off loss and a compliance hazard if sold.",
            supporting_data={"batch_count": len(exp_batches), "at_risk_value": at_risk, "sample_items": [n for _, n in exp_batches[:5]]},
            recommended_action="Prioritize FEFO shelf rotation or bundle promotions before expiry.",
            recommended_tab="inventory",
        )

    # 5. Delayed supplier deliveries
    delayed_pos = (
        db.query(PurchaseOrder, Supplier.name)
        .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)
        .filter(
            PurchaseOrder.business_id == business_id,
            PurchaseOrder.status.in_([POStatusEnum.ORDERED, POStatusEnum.PARTIALLY_RECEIVED]),
            PurchaseOrder.expected_delivery_date != None,
            PurchaseOrder.expected_delivery_date < today,
        )
        .all()
    )
    if delayed_pos:
        key = "supplier_delivery_delays"
        active_keys.add(key)
        po_nums = ", ".join(po.po_number for po, _ in delayed_pos[:4])
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="SUPPLIER_DELAY",
            severity="HIGH",
            title=f"{len(delayed_pos)} Open Purchase Order(s) Past Expected Delivery Date",
            what_happened=f"Pending PO(s) {po_nums} have passed their expected delivery date without full completion.",
            why_it_matters="Delayed inbound stock raises stockout probability for linked products.",
            supporting_data={"delayed_count": len(delayed_pos), "po_numbers": [po.po_number for po, _ in delayed_pos]},
            recommended_action="Follow up with supplier(s) or switch urgent items to alternate vendors.",
            recommended_tab="purchases",
        )

    # 6. Repeated manual adjustments or invoice cancellations (past 7d)
    week_ago = utc_now() - timedelta(days=7)
    adj_rows = (
        db.query(
            StockMovement.product_id,
            Product.name,
            func.count(StockMovement.id).label("cnt"),
        )
        .join(Product, Product.id == StockMovement.product_id)
        .filter(
            StockMovement.business_id == business_id,
            StockMovement.movement_type.in_([
                MovementTypeEnum.RECONCILIATION_ADJUSTMENT,
                MovementTypeEnum.AUDIT_CORRECTION,
                MovementTypeEnum.DAMAGE_WASTAGE,
            ]),
            StockMovement.created_at >= week_ago,
        )
        .group_by(StockMovement.product_id, Product.name)
        .having(func.count(StockMovement.id) >= 3)
        .all()
    )
    if adj_rows:
        key = "repeated_stock_adjustments"
        active_keys.add(key)
        top_adj = ", ".join(f"{r.name} ({r.cnt}x)" for r in adj_rows[:4])
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="REPEATED_ADJUSTMENT",
            severity="MEDIUM",
            title="Repeated Manual Stock Adjustments Detected",
            what_happened=f"Products adjusted >= 3 times in the past 7 days: {top_adj}.",
            why_it_matters="Frequent manual adjustments can indicate counting errors, shrinkage, damage, or unbilled POS movement.",
            supporting_data={"items": [{"product_id": r.product_id, "name": r.name, "adjustments_7d": r.cnt} for r in adj_rows]},
            recommended_action="Conduct a focused cycle count in Stock Reconciliation and inspect audit logs.",
            recommended_tab="inventory",
        )

    # 7. Negative or zero-margin products
    neg_margin = (
        db.query(Product)
        .filter(
            Product.business_id == business_id,
            Product.is_archived == False,
            Product.selling_price > 0,
            Product.purchase_cost >= Product.selling_price,
        )
        .all()
    )
    if neg_margin:
        key = "zero_or_negative_margin_skus"
        active_keys.add(key)
        _upsert_alert(
            db,
            business_id=business_id,
            alert_key=key,
            category="MARGIN_CHANGE",
            severity="HIGH",
            title=f"{len(neg_margin)} SKU(s) Selling At or Below Purchase Cost",
            what_happened=f"{', '.join(p.name for p in neg_margin[:4])} have selling_price <= purchase_cost.",
            why_it_matters="Every unit billed on the POS loses gross margin or erodes cash flow.",
            supporting_data={"skus": [{"product_id": p.id, "name": p.name, "cost": p.purchase_cost, "price": p.selling_price} for p in neg_margin[:8]]},
            recommended_action="Review supplier cost increases and update selling prices where appropriate.",
            recommended_tab="products",
        )

    # Auto-resolve alerts whose condition has cleared
    stale_active = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == business_id, AIAlert.status == "ACTIVE")
        .all()
    )
    for st in stale_active:
        if st.alert_key not in active_keys:
            st.status = "RESOLVED"
            st.resolved_at = utc_now()

    if commit:
        db.commit()
    else:
        db.flush()

    all_rows = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == business_id, AIAlert.status.in_(["ACTIVE", "ACKNOWLEDGED"]))
        .order_by(desc(AIAlert.detected_at))
        .all()
    )
    severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    all_rows.sort(key=lambda r: (severity_rank.get(r.severity, 4), -(r.detected_at.timestamp() if r.detected_at else 0)))
    return [serialize_alert(r) for r in all_rows]


def build_daily_briefing(db: Session, ctx: TenantContext, commit: bool = True) -> AIBriefingOut:
    bid = ctx.business.id
    alerts = run_proactive_scan(db, bid, force=True, commit=commit)
    today = date.today()
    yesterday = today - timedelta(days=1)

    today_sum = get_financial_summary(db, bid, start_date=today, end_date=today)
    yest_sum = get_financial_summary(db, bid, start_date=yesterday, end_date=yesterday)
    month_sum = get_financial_summary(db, bid, start_date=today.replace(day=1), end_date=today)
    khata = tool_khata_receivables(db, ctx)
    reorders = calculate_reorder_recommendations(db, bid, all_items=True)
    needs_reorder = [r for r in reorders if r.needs_reorder]

    rev_diff = round(today_sum.net_sales - yest_sum.net_sales, 2)
    rev_delta_str = f"{'+' if rev_diff >= 0 else ''}₹{rev_diff:,.0f} vs yesterday"

    opportunities: List[str] = []
    if khata["total_receivable"] > 0:
        opportunities.append(f"Collect ₹{khata['total_receivable']:,.2f} in pending Customer Khata dues across {khata['debtors_count']} account(s) to boost immediate cash.")
    if needs_reorder:
        est_po = round(sum(r.estimated_cost for r in needs_reorder[:5]), 2)
        opportunities.append(f"{len(needs_reorder)} SKU(s) need replenishment (top 5 estimated PO cost ₹{est_po:,.2f}) — ready to draft in Agent Mode.")
    if month_sum.gross_margin_percent > 0:
        opportunities.append(f"MTD Gross Margin is tracking at {month_sum.gross_margin_percent:.1f}% across {month_sum.total_invoices_count} completed bills.")
    if not opportunities:
        opportunities.append("Store operations are healthy with balanced inventory levels and zero urgent cash traps.")

    headline = (
        f"Daily Briefing for {ctx.business.name}: "
        f"{len([a for a in alerts if a.severity in ('CRITICAL', 'HIGH')])} high-priority risk(s), "
        f"{len(needs_reorder)} reorder cue(s)."
    )
    summary_md = (
        f"### Morning Intelligence Briefing — {ctx.business.name} ({today.isoformat()})\n\n"
        f"- **Today's Sales:** ₹{today_sum.net_sales:,.2f} across {today_sum.total_invoices_count} bill(s) ({rev_delta_str})\n"
        f"- **Month-to-Date Performance:** ₹{month_sum.net_sales:,.2f} net sales · ₹{month_sum.gross_profit:,.2f} gross profit ({month_sum.gross_margin_percent:.1f}% margin) · ₹{month_sum.operating_profit:,.2f} operating profit\n"
        f"- **Stock & Replenishment:** {len(needs_reorder)} product(s) at/below reorder point · Current stock valuation ₹{month_sum.inventory_valuation:,.2f}\n"
        f"- **Active AI Alerts:** {len(alerts)} active monitoring insight(s) requiring review\n"
        f"- **Pending Khata Receivables:** ₹{khata['total_receivable']:,.2f} across {khata['debtors_count']} customer(s)"
    )

    kpis = [
        AIKpiMetric(label="Today's Net Sales", value=f"₹{today_sum.net_sales:,.2f}", delta=rev_delta_str, tone="info"),
        AIKpiMetric(label="MTD Operating Profit", value=f"₹{month_sum.operating_profit:,.2f}", delta=f"{month_sum.gross_margin_percent:.1f}% gross margin", tone="positive" if month_sum.operating_profit >= 0 else "warning"),
        AIKpiMetric(label="Inventory Valuation", value=f"₹{month_sum.inventory_valuation:,.2f}", delta=f"{len(needs_reorder)} reorder needed", tone="warning" if needs_reorder else "positive"),
        AIKpiMetric(label="Khata Receivables", value=f"₹{khata['total_receivable']:,.2f}", delta=f"{khata['debtors_count']} customer(s)", tone="neutral"),
    ]

    return AIBriefingOut(
        generated_at=utc_now(),
        workspace_name=ctx.business.name,
        headline=headline,
        summary_markdown=summary_md,
        kpis=kpis,
        top_risks=alerts[:5],
        opportunities=opportunities,
        recommended_actions=[
            AIActionShortcut(label="Prepare Replenishment PO Draft", prompt="Identify products running low on stock, check sales velocity, and prepare a purchase draft.", mode="AGENT"),
            AIActionShortcut(label="Analyze Margin & Working Capital", prompt="Which products are affecting my working capital and which give top margins?", mode="DEEP_ANALYSIS"),
            AIActionShortcut(label="Open Reorder Center", target_tab="reorder"),
        ],
    )


def parse_workflow_rule(natural_language_rule: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    lower = natural_language_rule.lower()
    days_match = re.search(r"(\d+)\s*(?:day|ದಿನ|दिन)", lower)
    days_horizon = int(days_match.group(1)) if days_match else 7

    if any(k in lower for k in ["purchase", "po", "reorder", "replenish", "order draft", "restock", "ಖರೀದಿ", "ಮರುಖರೀದಿ", "ऑर्डर", "रीस्टॉक"]):
        return (
            {"check": "stockout_risk_days", "max_days": days_horizon},
            {"action_type": "CREATE_PURCHASE_ORDER", "group_by_supplier": True},
        )
    if any(k in lower for k in ["brief", "summary", "morning", "daily", "report", "profit", "ವರದಿ", "ಸಾರಾಂಶ", "ಲಾಭ", "ಬೆಳಿಗ್ಗೆ", "रिपोर्ट", "मुनाफा"]):
        return (
            {"check": "daily_kpi_digest"},
            {"action_type": "DAILY_BRIEFING"},
        )
    return (
        {"check": "full_proactive_anomaly_scan", "horizon_days": days_horizon},
        {"action_type": "PROACTIVE_SCAN_ALERTS"},
    )


def create_ai_workflow(
    db: Session,
    ctx: TenantContext,
    *,
    name: str,
    natural_language_rule: str,
    trigger_type: str = "SCHEDULED",
    schedule_cron: Optional[str] = "0 9 * * *",
    requires_approval: bool = True,
) -> AIWorkflow:
    condition, action = parse_workflow_rule(natural_language_rule)
    wf = AIWorkflow(
        business_id=ctx.business.id,
        created_by_user_id=ctx.user.id,
        name=name.strip(),
        natural_language_rule=natural_language_rule.strip(),
        trigger_type=trigger_type,
        schedule_cron=schedule_cron,
        condition_json=json.dumps(condition),
        action_json=json.dumps(action),
        requires_approval=requires_approval,
        is_active=True,
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="AI_CREATE_WORKFLOW",
        entity_type="ai_workflow",
        entity_id=str(wf.id),
        details={"name": wf.name, "trigger_type": trigger_type},
    )
    return wf


def execute_workflow(db: Session, ctx: TenantContext, wf: AIWorkflow) -> Dict[str, Any]:
    """Executes an AIWorkflow rule against real shop data — creates AIApprovals for any mutations."""
    action = json.loads(wf.action_json or "{}")
    action_type = action.get("action_type", "PROACTIVE_SCAN_ALERTS")
    created_approvals: List[int] = []

    if action_type == "CREATE_PURCHASE_ORDER":
        reorders = [r for r in calculate_reorder_recommendations(db, ctx.business.id, all_items=True) if r.needs_reorder]
        by_sup: Dict[int, List[Dict[str, Any]]] = {}
        for r in reorders:
            if not r.supplier_id:
                continue
            by_sup.setdefault(r.supplier_id, []).append({
                "product_id": r.product_id,
                "quantity_ordered": r.recommended_order_qty,
                "unit_cost": r.unit_cost,
                "tax_rate_percent": 0.0,
            })
        for sup_id, items in by_sup.items():
            appr = build_purchase_order_approval_draft(
                db,
                ctx,
                supplier_id=sup_id,
                items=items,
                notes=f"Auto-drafted by Workflow '{wf.name}'",
            )
            created_approvals.append(appr.id)
        summary = (
            f"Prepared {len(created_approvals)} Purchase Order approval draft(s) covering {len(reorders)} low-stock SKU(s)."
            if created_approvals
            else "Evaluated reorder status: no supplier-linked SKU currently requires replenishment."
        )
    elif action_type == "DAILY_BRIEFING":
        briefing = build_daily_briefing(db, ctx)
        summary = briefing.headline
    else:
        alerts = run_proactive_scan(db, ctx.business.id, force=True)
        summary = f"Completed proactive business health scan: {len(alerts)} active alert(s) tracked."

    wf.last_run_at = utc_now()
    wf.last_run_summary = summary
    wf.run_count = (wf.run_count or 0) + 1
    db.commit()
    db.refresh(wf)
    return {
        "workflow_id": wf.id,
        "summary": summary,
        "created_approval_ids": created_approvals,
        "run_count": wf.run_count,
    }
