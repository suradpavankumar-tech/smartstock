import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.dependencies import TenantContext
from app.models.ai import AIAlert
from app.models.anomaly import AnomalyAlert, AnomalyStatusEnum
from app.models.audit import AuditLog
from app.models.cash_shift import CashShift
from app.models.customer import Customer
from app.models.expense import Expense
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatusEnum, SalesReturn
from app.models.product import Category, Product, ProductBatch
from app.models.purchase import POStatusEnum, PurchaseOrder, PurchaseOrderItem, Supplier
from app.routers.cash_drawer import _live_totals, _open_shift
from app.services.analytics_service import (
    get_category_performance,
    get_daily_sales_trend,
    get_financial_summary,
    get_gstr1_report,
    get_product_performance,
    get_stock_ageing_report,
)
from app.services.recommendation_service import calculate_reorder_recommendations
from app.services.simulator_service import (
    simulate_demand_shock,
    simulate_price_elasticity,
    simulate_supplier_delay,
)


def _month_bounds(anchor: date) -> tuple[date, date]:
    start = anchor.replace(day=1)
    if start.month == 12:
        next_start = date(start.year + 1, 1, 1)
    else:
        next_start = date(start.year, start.month + 1, 1)
    end = next_start - timedelta(days=1)
    return start, min(end, date.today()) if anchor.year == date.today().year and anchor.month == date.today().month else end


def tool_workspace_overview(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    bid = ctx.business.id
    active_skus = db.query(Product).filter(Product.business_id == bid, Product.is_archived == False).count()
    low_stock_skus = (
        db.query(Product)
        .filter(Product.business_id == bid, Product.is_archived == False, Product.current_stock <= Product.reorder_threshold)
        .count()
    )
    out_of_stock_skus = (
        db.query(Product)
        .filter(Product.business_id == bid, Product.is_archived == False, Product.current_stock <= 0)
        .count()
    )
    suppliers_count = (
        db.query(Supplier)
        .filter(Supplier.business_id == bid, func.upper(Supplier.is_active) != "NO")
        .count()
    )
    customers_count = db.query(Customer).filter(Customer.business_id == bid).count()
    open_pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.business_id == bid,
            PurchaseOrder.status.in_([POStatusEnum.DRAFT, POStatusEnum.ORDERED, POStatusEnum.PARTIALLY_RECEIVED]),
        )
        .count()
    )
    active_shift = _open_shift(db, ctx)
    active_ai_alerts = (
        db.query(AIAlert).filter(AIAlert.business_id == bid, AIAlert.status == "ACTIVE").count()
    )
    return {
        "business_id": bid,
        "business_name": ctx.business.name,
        "city": ctx.business.city,
        "state": ctx.business.state,
        "role": ctx.membership.role.value,
        "active_skus": active_skus,
        "low_stock_skus": low_stock_skus,
        "out_of_stock_skus": out_of_stock_skus,
        "suppliers_count": suppliers_count,
        "customers_count": customers_count,
        "open_purchase_orders": open_pos,
        "cash_shift_open": active_shift is not None,
        "cash_opening_float": round(float(active_shift.opening_float), 2) if active_shift else 0.0,
        "active_ai_alerts": active_ai_alerts,
    }


def tool_sales_summary(
    db: Session,
    ctx: TenantContext,
    period: str = "today",
    product_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Summarizes daily/recent POS sales, invoice counts, top-selling products by units & revenue,
    yesterday comparison, and optional per-product comparison & next-7-day stock runway.
    """
    bid = ctx.business.id
    today = date.today()
    yesterday = today - timedelta(days=1)

    today_sum = get_financial_summary(db, bid, start_date=today, end_date=today)
    yest_sum = get_financial_summary(db, bid, start_date=yesterday, end_date=yesterday)

    today_top_qty = [
        p.model_dump()
        for p in get_product_performance(
            db, bid, limit=10, start_date=today, end_date=today, sort_by="units_sold"
        )
    ]
    today_top_rev = [
        p.model_dump()
        for p in get_product_performance(
            db, bid, limit=10, start_date=today, end_date=today, sort_by="revenue"
        )
    ]
    yest_top_qty = [
        p.model_dump()
        for p in get_product_performance(
            db, bid, limit=10, start_date=yesterday, end_date=yesterday, sort_by="units_sold"
        )
    ]

    p_days = 7 if period == "week" else (30 if period == "month" else 1)
    period_sum = (
        today_sum
        if period == "today"
        else (yest_sum if period == "yesterday" else get_financial_summary(db, bid, start_date=today - timedelta(days=p_days - 1), end_date=today))
    )

    # Overall top sellers over the requested window (fallback to 30d if no sales specifically today)
    win_start = today if period == "today" else (yesterday if period == "yesterday" else today - timedelta(days=p_days - 1))
    win_end = yesterday if period == "yesterday" else today
    window_top_qty = [
        p.model_dump()
        for p in get_product_performance(
            db, bid, limit=10, start_date=win_start, end_date=win_end, sort_by="units_sold"
        )
    ]
    if not window_top_qty and period == "today":
        # Check last 30 days as fallback metadata (kept clearly distinct from today's 0)
        overall_top_qty = [
            p.model_dump()
            for p in get_product_performance(db, bid, limit=5, sort_by="units_sold")
        ]
    else:
        overall_top_qty = window_top_qty[:5]

    unit_map = {
        pid: (u or "unit")
        for pid, u in db.query(Product.id, Product.unit).filter(Product.business_id == bid).all()
    }
    for bucket in (today_top_qty, today_top_rev, yest_top_qty, overall_top_qty):
        for entry in bucket:
            entry.setdefault("unit", unit_map.get(entry.get("product_id"), "unit"))
            entry.setdefault("profit", entry.get("gross_profit", 0.0))

    target_pid = product_id or (today_top_qty[0]["product_id"] if today_top_qty else (yest_top_qty[0]["product_id"] if yest_top_qty else None))
    product_comparison: Optional[Dict[str, Any]] = None
    if target_pid is not None:
        t_map = _period_product_profit(db, bid, today, today)
        y_map = _period_product_profit(db, bid, yesterday, yesterday)
        prod_row = db.query(Product).filter(Product.id == target_pid, Product.business_id == bid).first()
        rec_map = {r.product_id: r for r in calculate_reorder_recommendations(db, bid, all_items=True)}
        rec = rec_map.get(target_pid)
        t_entry = t_map.get(target_pid, {})
        y_entry = y_map.get(target_pid, {})
        t_qty = round(float(t_entry.get("qty", 0.0)), 2)
        y_qty = round(float(y_entry.get("qty", 0.0)), 2)
        t_rev = round(float(t_entry.get("revenue", 0.0)), 2)
        y_rev = round(float(y_entry.get("revenue", 0.0)), 2)
        prod_name = (
            t_entry.get("product_name")
            or y_entry.get("product_name")
            or (prod_row.name if prod_row else f"SKU #{target_pid}")
        )
        curr_stock = round(float(prod_row.current_stock), 2) if prod_row else 0.0
        avg_daily = round(float(rec.avg_daily_demand), 2) if rec else 0.0
        days_left = rec.stockout_risk_days if rec else None
        weekly_need = round(avg_daily * 7.0, 2)
        product_comparison = {
            "product_id": target_pid,
            "product_name": prod_name,
            "unit": prod_row.unit if prod_row else "unit",
            "today_qty": t_qty,
            "today_revenue": t_rev,
            "yesterday_qty": y_qty,
            "yesterday_revenue": y_rev,
            "qty_delta": round(t_qty - y_qty, 2),
            "revenue_delta": round(t_rev - y_rev, 2),
            "current_stock": curr_stock,
            "avg_daily_demand": avg_daily,
            "weekly_projected_demand": weekly_need,
            "days_left": days_left,
            "enough_for_next_week": bool(curr_stock > 0 and (days_left is None or days_left >= 7.0)),
            "recommended_order_qty": rec.recommended_order_qty if rec else 0.0,
        }

    return {
        "period": period,
        "today_date": today.isoformat(),
        "yesterday_date": yesterday.isoformat(),
        "today": {
            "date": today.isoformat(),
            "net_sales": today_sum.net_sales,
            "gross_sales": today_sum.gross_sales,
            "gross_profit": today_sum.gross_profit,
            "operating_profit": today_sum.operating_profit,
            "invoices_count": today_sum.total_invoices_count,
            "average_order_value": today_sum.average_order_value,
        },
        "yesterday": {
            "date": yesterday.isoformat(),
            "net_sales": yest_sum.net_sales,
            "gross_sales": yest_sum.gross_sales,
            "gross_profit": yest_sum.gross_profit,
            "operating_profit": yest_sum.operating_profit,
            "invoices_count": yest_sum.total_invoices_count,
        },
        "selected_period": {
            "start_date": period_sum.start_date.isoformat(),
            "end_date": period_sum.end_date.isoformat(),
            "net_sales": period_sum.net_sales,
            "gross_profit": period_sum.gross_profit,
            "operating_profit": period_sum.operating_profit,
            "invoices_count": period_sum.total_invoices_count,
        },
        "today_vs_yesterday_sales_delta": round(today_sum.net_sales - yest_sum.net_sales, 2),
        "today_top_by_qty": today_top_qty,
        "today_top_by_revenue": today_top_rev,
        "yesterday_top_by_qty": yest_top_qty,
        "overall_top_by_qty": overall_top_qty,
        "product_comparison": product_comparison,
        "data_type": "ACTUAL",
    }


def tool_financial_pnl(
    db: Session,
    ctx: TenantContext,
    days: int = 30,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    bid = ctx.business.id
    end_d = end_date or date.today()
    start_d = start_date or (end_d - timedelta(days=days - 1))
    summary = get_financial_summary(db, bid, start_date=start_d, end_date=end_d)
    trend = get_daily_sales_trend(db, bid, days=min(30, max(7, days)))

    # Expense breakdown by category
    exp_rows = (
        db.query(Expense.category, func.coalesce(func.sum(Expense.amount), 0.0).label("total"))
        .filter(Expense.business_id == bid, Expense.expense_date >= start_d, Expense.expense_date <= end_d)
        .group_by(Expense.category)
        .order_by(desc("total"))
        .all()
    )
    expense_breakdown = [
        {
            "category": r.category.value if hasattr(r.category, "value") else str(r.category),
            "amount": round(float(r.total or 0.0), 2),
        }
        for r in exp_rows
    ]
    net_margin_pct = round((summary.operating_profit / summary.net_sales * 100.0), 2) if summary.net_sales > 0 else 0.0

    return {
        "start_date": summary.start_date.isoformat(),
        "end_date": summary.end_date.isoformat(),
        "gross_sales": summary.gross_sales,
        "discounts": summary.discounts,
        "returns": summary.returns,
        "net_sales": summary.net_sales,
        "cogs": summary.cost_of_goods_sold,
        "gross_profit": summary.gross_profit,
        "gross_margin_percent": summary.gross_margin_percent,
        "operating_expenses": summary.operating_expenses,
        "operating_profit": summary.operating_profit,
        "net_margin_percent": net_margin_pct,
        "invoices_count": summary.total_invoices_count,
        "average_order_value": summary.average_order_value,
        "inventory_valuation": summary.inventory_valuation,
        "total_stock_units": summary.total_stock_units,
        "low_stock_products_count": summary.low_stock_products_count,
        "expense_breakdown": expense_breakdown,
        "daily_trend": [pt.model_dump() for pt in trend],
        "data_type": "ACTUAL",
    }


def _period_product_profit(db: Session, bid: int, start_d: date, end_d: date) -> Dict[int, Dict[str, Any]]:
    start_dt = datetime.combine(start_d, datetime.min.time())
    end_dt = datetime.combine(end_d, datetime.max.time())
    rows = (
        db.query(
            InvoiceItem.product_id,
            InvoiceItem.product_name,
            func.sum(InvoiceItem.quantity).label("qty"),
            func.sum(InvoiceItem.total_amount).label("rev"),
            func.sum(InvoiceItem.total_cost).label("cost"),
        )
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(
            Invoice.business_id == bid,
            Invoice.status == InvoiceStatusEnum.COMPLETED,
            Invoice.created_at >= start_dt,
            Invoice.created_at <= end_dt,
        )
        .group_by(InvoiceItem.product_id, InvoiceItem.product_name)
        .all()
    )
    out: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        rev = float(r.rev or 0.0)
        cst = float(r.cost or 0.0)
        out[r.product_id] = {
            "product_id": r.product_id,
            "product_name": r.product_name,
            "qty": round(float(r.qty or 0.0), 2),
            "revenue": round(rev, 2),
            "cost": round(cst, 2),
            "profit": round(rev - cst, 2),
        }
    return out


def tool_profit_drop_investigation(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    """
    Compares Current Month vs Previous Month (and falls back cleanly to 14d vs prior 14d
    if monthly boundary comparison has less previous-month data) to decompose profit drivers.
    """
    bid = ctx.business.id
    today = date.today()
    curr_m_start, curr_m_end = _month_bounds(today)
    prev_m_anchor = curr_m_start - timedelta(days=1)
    prev_m_start, prev_m_end = _month_bounds(prev_m_anchor)

    curr_sum = get_financial_summary(db, bid, start_date=curr_m_start, end_date=curr_m_end)
    prev_sum = get_financial_summary(db, bid, start_date=prev_m_start, end_date=prev_m_end)
    comparison_label = f"{curr_m_start.strftime('%b %Y')} vs {prev_m_start.strftime('%b %Y')}"
    c_start, c_end, p_start, p_end = curr_m_start, curr_m_end, prev_m_start, prev_m_end

    # If previous calendar month has zero invoices and zero expenses, test rolling 7d vs prior 7d so recent drops surface
    if prev_sum.total_invoices_count == 0 and prev_sum.operating_expenses == 0:
        r_curr_end = today
        r_curr_start = today - timedelta(days=6)
        r_prev_end = r_curr_start - timedelta(days=1)
        r_prev_start = r_prev_end - timedelta(days=6)
        rc = get_financial_summary(db, bid, start_date=r_curr_start, end_date=r_curr_end)
        rp = get_financial_summary(db, bid, start_date=r_prev_start, end_date=r_prev_end)
        if rp.total_invoices_count > 0 or rp.operating_expenses > 0:
            curr_sum, prev_sum = rc, rp
            c_start, c_end, p_start, p_end = r_curr_start, r_curr_end, r_prev_start, r_prev_end
            comparison_label = "Last 7 Days vs Prior 7 Days"

    rev_delta = round(curr_sum.net_sales - prev_sum.net_sales, 2)
    cogs_delta = round(curr_sum.cost_of_goods_sold - prev_sum.cost_of_goods_sold, 2)
    gp_delta = round(curr_sum.gross_profit - prev_sum.gross_profit, 2)
    disc_delta = round(curr_sum.discounts - prev_sum.discounts, 2)
    ret_delta = round(curr_sum.returns - prev_sum.returns, 2)
    opex_delta = round(curr_sum.operating_expenses - prev_sum.operating_expenses, 2)
    op_profit_delta = round(curr_sum.operating_profit - prev_sum.operating_profit, 2)
    margin_pts_delta = round(curr_sum.gross_margin_percent - prev_sum.gross_margin_percent, 2)

    # Expense driver comparison by category
    curr_exp = {
        (r.category.value if hasattr(r.category, "value") else str(r.category)): float(r.total or 0.0)
        for r in db.query(Expense.category, func.sum(Expense.amount).label("total"))
        .filter(Expense.business_id == bid, Expense.expense_date >= c_start, Expense.expense_date <= c_end)
        .group_by(Expense.category)
        .all()
    }
    prev_exp = {
        (r.category.value if hasattr(r.category, "value") else str(r.category)): float(r.total or 0.0)
        for r in db.query(Expense.category, func.sum(Expense.amount).label("total"))
        .filter(Expense.business_id == bid, Expense.expense_date >= p_start, Expense.expense_date <= p_end)
        .group_by(Expense.category)
        .all()
    }
    exp_deltas = []
    for cat in set(curr_exp.keys()) | set(prev_exp.keys()):
        c_val = round(curr_exp.get(cat, 0.0), 2)
        p_val = round(prev_exp.get(cat, 0.0), 2)
        diff = round(c_val - p_val, 2)
        exp_deltas.append({"category": cat, "current": c_val, "previous": p_val, "delta": diff})
    exp_deltas.sort(key=lambda x: x["delta"], reverse=True)

    # Product-level profit bridge
    curr_prods = _period_product_profit(db, bid, c_start, c_end)
    prev_prods = _period_product_profit(db, bid, p_start, p_end)
    prod_deltas = []
    for pid in set(curr_prods.keys()) | set(prev_prods.keys()):
        cp = curr_prods.get(pid) or {"product_name": prev_prods[pid]["product_name"], "revenue": 0.0, "profit": 0.0, "qty": 0.0}
        pp = prev_prods.get(pid) or {"product_name": cp["product_name"], "revenue": 0.0, "profit": 0.0, "qty": 0.0}
        prod_deltas.append({
            "product_id": pid,
            "product_name": cp["product_name"],
            "current_profit": cp["profit"],
            "previous_profit": pp["profit"],
            "profit_delta": round(cp["profit"] - pp["profit"], 2),
            "current_revenue": cp["revenue"],
            "previous_revenue": pp["revenue"],
            "revenue_delta": round(cp["revenue"] - pp["revenue"], 2),
        })
    prod_draggers = sorted([d for d in prod_deltas if d["profit_delta"] < 0], key=lambda x: x["profit_delta"])[:5]
    prod_gainers = sorted([d for d in prod_deltas if d["profit_delta"] > 0], key=lambda x: x["profit_delta"], reverse=True)[:5]

    drivers: List[str] = []
    if op_profit_delta < 0:
        if rev_delta < 0:
            drivers.append(f"Net sales fell by ₹{abs(rev_delta):,.2f} ({curr_sum.total_invoices_count} vs {prev_sum.total_invoices_count} bills).")
        if opex_delta > 0:
            top_e = exp_deltas[0] if exp_deltas else None
            extra = f" (led by {top_e['category']}: +₹{top_e['delta']:,.2f})" if top_e and top_e["delta"] > 0 else ""
            drivers.append(f"Operating expenses rose by ₹{opex_delta:,.2f}{extra}.")
        if margin_pts_delta < -0.5:
            drivers.append(f"Gross margin compressed by {abs(margin_pts_delta):.1f} pp ({curr_sum.gross_margin_percent:.1f}% vs {prev_sum.gross_margin_percent:.1f}%).")
        if disc_delta > 0:
            drivers.append(f"Discounts increased by ₹{disc_delta:,.2f}.")
        if ret_delta > 0:
            drivers.append(f"Customer refunds/returns increased by ₹{ret_delta:,.2f}.")
    elif prev_sum.total_invoices_count == 0 and prev_sum.operating_expenses == 0:
        drivers.append("No prior comparison period transactions exist yet; showing active period profitability structure and highest margin levers.")
    else:
        drivers.append(f"Operating profit improved by +₹{op_profit_delta:,.2f} across {comparison_label}.")

    return {
        "comparison_label": comparison_label,
        "current_window": {"start": c_start.isoformat(), "end": c_end.isoformat()},
        "previous_window": {"start": p_start.isoformat(), "end": p_end.isoformat()},
        "current": {
            "net_sales": curr_sum.net_sales,
            "cogs": curr_sum.cost_of_goods_sold,
            "gross_profit": curr_sum.gross_profit,
            "gross_margin_percent": curr_sum.gross_margin_percent,
            "discounts": curr_sum.discounts,
            "returns": curr_sum.returns,
            "operating_expenses": curr_sum.operating_expenses,
            "operating_profit": curr_sum.operating_profit,
            "invoices_count": curr_sum.total_invoices_count,
        },
        "previous": {
            "net_sales": prev_sum.net_sales,
            "cogs": prev_sum.cost_of_goods_sold,
            "gross_profit": prev_sum.gross_profit,
            "gross_margin_percent": prev_sum.gross_margin_percent,
            "discounts": prev_sum.discounts,
            "returns": prev_sum.returns,
            "operating_expenses": prev_sum.operating_expenses,
            "operating_profit": prev_sum.operating_profit,
            "invoices_count": prev_sum.total_invoices_count,
        },
        "deltas": {
            "net_sales_delta": rev_delta,
            "cogs_delta": cogs_delta,
            "gross_profit_delta": gp_delta,
            "margin_pct_delta": margin_pts_delta,
            "discounts_delta": disc_delta,
            "returns_delta": ret_delta,
            "operating_expenses_delta": opex_delta,
            "operating_profit_delta": op_profit_delta,
        },
        "expense_deltas": exp_deltas[:6],
        "top_profit_draggers": prod_draggers,
        "top_profit_gainers": prod_gainers,
        "drivers": drivers,
        "data_type": "ACTUAL",
    }


def tool_margin_and_working_capital(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    bid = ctx.business.id
    perf = get_product_performance(db, bid, limit=50)
    ageing = get_stock_ageing_report(db, bid)
    cat_perf = get_category_performance(db, bid)
    products = db.query(Product).filter(Product.business_id == bid, Product.is_archived == False).all()

    total_inventory_val = round(sum(max(0.0, p.current_stock) * p.purchase_cost for p in products), 2)
    top_margins_by_pct = sorted(
        [
            {
                "product_id": p.id,
                "product_name": p.name,
                "purchase_cost": p.purchase_cost,
                "selling_price": p.selling_price,
                "unit_margin": round(p.selling_price - p.purchase_cost, 2),
                "margin_percent": round(((p.selling_price - p.purchase_cost) / p.selling_price * 100.0), 1)
                if p.selling_price > 0
                else 0.0,
                "current_stock": p.current_stock,
                "stock_capital": round(max(0.0, p.current_stock) * p.purchase_cost, 2),
            }
            for p in products
        ],
        key=lambda x: (x["margin_percent"], x["unit_margin"]),
        reverse=True,
    )
    top_realized_profit = sorted(
        [pt.model_dump() for pt in perf],
        key=lambda x: x["gross_profit"],
        reverse=True,
    )
    top_capital_lockup = sorted(
        top_margins_by_pct,
        key=lambda x: x["stock_capital"],
        reverse=True,
    )
    receivables = (
        db.query(func.coalesce(func.sum(Customer.outstanding_balance), 0.0))
        .filter(Customer.business_id == bid)
        .scalar()
        or 0.0
    )

    return {
        "total_inventory_valuation": total_inventory_val,
        "dead_stock_value": ageing.total_dead_stock_value,
        "khata_receivables": round(float(receivables), 2),
        "total_working_capital_tied": round(total_inventory_val + float(receivables), 2),
        "ageing_cohorts": [c.model_dump() for c in ageing.cohorts],
        "slow_and_dead_products": [s.model_dump() for s in ageing.slow_and_dead_products[:10]],
        "top_realized_profit_skus": top_realized_profit[:10],
        "highest_margin_catalog_skus": top_margins_by_pct[:10],
        "highest_capital_lockup_skus": top_capital_lockup[:10],
        "category_mix": [c.model_dump() for c in cat_perf],
        "data_type": "ACTUAL",
    }


def tool_supplier_price_comparison(
    db: Session,
    ctx: TenantContext,
    product_query: Optional[str] = None,
) -> Dict[str, Any]:
    bid = ctx.business.id
    suppliers = (
        db.query(Supplier)
        .filter(Supplier.business_id == bid)
        .order_by(Supplier.name)
        .all()
    )
    sup_map = {s.id: s for s in suppliers}

    # Historical purchase cost observations across all non-cancelled POs
    po_rows = (
        db.query(
            PurchaseOrderItem.product_id,
            Product.name.label("product_name"),
            Product.unit.label("unit"),
            Product.purchase_cost.label("current_wac"),
            PurchaseOrder.supplier_id,
            Supplier.name.label("supplier_name"),
            Supplier.lead_time_days,
            Supplier.payment_terms_days,
            func.min(PurchaseOrderItem.unit_cost).label("min_unit_cost"),
            func.avg(PurchaseOrderItem.unit_cost).label("avg_unit_cost"),
            func.max(PurchaseOrderItem.unit_cost).label("max_unit_cost"),
            func.sum(PurchaseOrderItem.quantity_ordered).label("total_qty"),
            func.count(PurchaseOrder.id).label("po_count"),
            func.max(PurchaseOrder.order_date).label("last_order_date"),
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .join(Product, Product.id == PurchaseOrderItem.product_id)
        .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)
        .filter(
            PurchaseOrder.business_id == bid,
            PurchaseOrder.status != POStatusEnum.CANCELLED,
        )
        .group_by(
            PurchaseOrderItem.product_id,
            Product.name,
            Product.unit,
            Product.purchase_cost,
            PurchaseOrder.supplier_id,
            Supplier.name,
            Supplier.lead_time_days,
            Supplier.payment_terms_days,
        )
        .all()
    )

    by_product: Dict[int, Dict[str, Any]] = {}
    supplier_stats: Dict[int, Dict[str, Any]] = {
        s.id: {
            "supplier_id": s.id,
            "supplier_name": s.name,
            "lead_time_days": s.lead_time_days,
            "payment_terms_days": s.payment_terms_days,
            "total_pos": 0,
            "total_spend": 0.0,
            "skus_assigned": 0,
            "avg_margin_on_assigned_skus": 0.0,
        }
        for s in suppliers
    }

    # Aggregate PO spend per supplier
    po_totals = (
        db.query(
            PurchaseOrder.supplier_id,
            func.count(PurchaseOrder.id).label("cnt"),
            func.coalesce(func.sum(PurchaseOrder.total_amount), 0.0).label("spend"),
        )
        .filter(PurchaseOrder.business_id == bid, PurchaseOrder.status != POStatusEnum.CANCELLED)
        .group_by(PurchaseOrder.supplier_id)
        .all()
    )
    for row in po_totals:
        if row.supplier_id in supplier_stats:
            supplier_stats[row.supplier_id]["total_pos"] = int(row.cnt or 0)
            supplier_stats[row.supplier_id]["total_spend"] = round(float(row.spend or 0.0), 2)

    # Assigned SKU counts per supplier
    products = db.query(Product).filter(Product.business_id == bid, Product.is_archived == False).all()
    for p in products:
        if p.supplier_id and p.supplier_id in supplier_stats:
            supplier_stats[p.supplier_id]["skus_assigned"] += 1

    q_lower = (product_query or "").strip().lower()
    for r in po_rows:
        if q_lower and q_lower not in r.product_name.lower() and q_lower not in r.supplier_name.lower():
            continue
        entry = by_product.setdefault(
            r.product_id,
            {
                "product_id": r.product_id,
                "product_name": r.product_name,
                "unit": r.unit,
                "current_wac": round(float(r.current_wac or 0.0), 2),
                "quotes": [],
            },
        )
        entry["quotes"].append({
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier_name,
            "lead_time_days": r.lead_time_days,
            "payment_terms_days": r.payment_terms_days,
            "min_unit_cost": round(float(r.min_unit_cost), 2),
            "avg_unit_cost": round(float(r.avg_unit_cost), 2),
            "max_unit_cost": round(float(r.max_unit_cost), 2),
            "total_qty_ordered": round(float(r.total_qty or 0.0), 2),
            "po_count": int(r.po_count or 0),
            "last_order_date": r.last_order_date.isoformat() if r.last_order_date else None,
        })

    comparisons = []
    for p_entry in by_product.values():
        quotes = sorted(p_entry["quotes"], key=lambda q: q["avg_unit_cost"])
        best = quotes[0]
        worst = quotes[-1]
        savings_per_unit = round(worst["avg_unit_cost"] - best["avg_unit_cost"], 2) if len(quotes) > 1 else 0.0
        p_entry["quotes"] = quotes
        p_entry["best_supplier"] = best["supplier_name"]
        p_entry["best_avg_unit_cost"] = best["avg_unit_cost"]
        p_entry["unit_spread_savings"] = savings_per_unit
        comparisons.append(p_entry)

    comparisons.sort(key=lambda x: x["unit_spread_savings"], reverse=True)
    supplier_list = sorted(supplier_stats.values(), key=lambda x: (x["total_spend"], x["skus_assigned"]), reverse=True)

    return {
        "suppliers_count": len(supplier_list),
        "suppliers": supplier_list,
        "product_price_comparisons": comparisons[:15],
        "has_multi_supplier_quotes": any(len(c["quotes"]) > 1 for c in comparisons),
        "data_type": "ACTUAL",
    }


def tool_khata_receivables(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    bid = ctx.business.id
    customers = (
        db.query(Customer)
        .filter(Customer.business_id == bid)
        .order_by(desc(Customer.outstanding_balance), Customer.name)
        .all()
    )
    debtors = [c for c in customers if (c.outstanding_balance or 0.0) > 0]
    total_due = round(sum(float(c.outstanding_balance or 0.0) for c in debtors), 2)

    due_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.business_id == bid,
            Invoice.status == InvoiceStatusEnum.COMPLETED,
            Invoice.payment_status.in_(["DUE", "PARTIAL"]),
        )
        .order_by(Invoice.created_at.asc())
        .limit(20)
        .all()
    )

    return {
        "total_customers": len(customers),
        "debtors_count": len(debtors),
        "total_receivable": total_due,
        "top_debtors": [
            {
                "customer_id": c.id,
                "name": c.name,
                "phone": c.phone,
                "outstanding_balance": round(float(c.outstanding_balance or 0.0), 2),
            }
            for c in debtors[:12]
        ],
        "pending_credit_invoices": [
            {
                "invoice_id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_id": inv.customer_id,
                "customer_name": inv.customer_name or "Customer",
                "credit_amount": round(float(inv.credit_amount or inv.total_amount), 2),
                "created_at": inv.created_at.strftime("%Y-%m-%d"),
            }
            for inv in due_invoices
        ],
        "data_type": "ACTUAL",
    }


def tool_cash_till_status(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    bid = ctx.business.id
    active = _open_shift(db, ctx)
    recent_closed = (
        db.query(CashShift)
        .filter(CashShift.business_id == bid, CashShift.status == "CLOSED")
        .order_by(desc(CashShift.closed_at))
        .limit(5)
        .all()
    )
    open_shift_payload = None
    if active:
        cash_sales, cash_expenses, cash_refunds, expected = _live_totals(db, active)
        open_shift_payload = {
            "shift_id": active.id,
            "opened_at": active.opened_at.strftime("%Y-%m-%d %H:%M"),
            "opening_float": active.opening_float,
            "cash_sales": cash_sales,
            "cash_expenses": cash_expenses,
            "cash_refunds": cash_refunds,
            "expected_cash": expected,
        }
    return {
        "has_open_shift": active is not None,
        "open_shift": open_shift_payload,
        "recent_closed_shifts": [
            {
                "shift_id": s.id,
                "closed_at": s.closed_at.strftime("%Y-%m-%d %H:%M") if s.closed_at else None,
                "expected_cash": s.expected_cash,
                "counted_cash": s.counted_cash,
                "variance": s.variance,
            }
            for s in recent_closed
        ],
        "data_type": "ACTUAL",
    }


def tool_inventory_lookup(db: Session, ctx: TenantContext, query_text: Optional[str] = None) -> Dict[str, Any]:
    bid = ctx.business.id
    q = db.query(Product).filter(Product.business_id == bid, Product.is_archived == False)
    products = q.order_by(Product.name).all()
    reorders = {r.product_id: r for r in calculate_reorder_recommendations(db, bid, all_items=True)}

    cleaned = (query_text or "").strip().lower()
    raw_tokens = re.findall(r"[a-z0-9\u0C80-\u0CFF\u0900-\u097F]+", cleaned)
    stop = {
        "the", "for", "and", "with", "what", "which", "show", "check", "stock",
        "inventory", "product", "products", "price", "selling", "purchase", "cost",
        "items", "item", "how", "much", "many", "current", "available", "left",
        "remaining", "tell", "list", "give", "find", "have", "has", "any", "are",
        "all", "low", "shortage", "status", "enough", "next", "week", "today",
        "its", "it", "this", "that", "those", "my", "store", "shop", "our", "in",
        "idya", "illa", "mugidideya", "mugidide", "yav", "yaav", "yaavudu",
        "eshtu", "torsi", "torisi", "nodona", "hege", "illa",
        "ಇದೆ", "ಎಷ್ಟು", "ಸ್ಟಾಕ್", "ಬೆಲೆ", "ವಸ್ತುಗಳು", "ಕಡಿಮೆ", "ತೋರಿಸಿ",
        "है", "कितना", "स्टॉक", "दिखाओ",
    }
    meaningful = [t for t in raw_tokens if len(t) >= 2 and t not in stop]

    matched = []
    if meaningful:
        non_qty_tokens = [
            t for t in meaningful if not re.match(r"^\d+(?:g|kg|ml|l|gm|pcs|pc|pack)?$", t)
        ]
        probe_tokens = non_qty_tokens or meaningful
        for p in products:
            hay = f"{p.name} {p.sku or ''} {p.barcode or ''} {p.category.name if p.category else ''}".lower()
            if any(t in hay for t in probe_tokens):
                matched.append(p)
    else:
        matched = sorted(products, key=lambda p: (p.current_stock > 0, p.current_stock - p.reorder_threshold))[:15]

    total_val = round(sum(max(0.0, p.current_stock) * p.purchase_cost for p in products), 2)
    low_count = sum(1 for p in products if p.current_stock <= p.reorder_threshold)
    oos_count = sum(1 for p in products if p.current_stock <= 0)

    return {
        "total_skus": len(products),
        "low_stock_count": low_count,
        "out_of_stock_count": oos_count,
        "total_inventory_valuation": total_val,
        "matched_query": bool(meaningful),
        "query_tokens": meaningful,
        "items": [
            {
                "product_id": p.id,
                "name": p.name,
                "sku": p.sku,
                "category": p.category.name if p.category else "General",
                "supplier_id": p.supplier_id,
                "supplier_name": p.supplier.name if p.supplier else None,
                "unit": p.unit,
                "current_stock": p.current_stock,
                "reorder_threshold": p.reorder_threshold,
                "min_order_qty": p.min_order_qty,
                "purchase_cost": p.purchase_cost,
                "selling_price": p.selling_price,
                "stock_value": round(max(0.0, p.current_stock) * p.purchase_cost, 2),
                "days_left": reorders[p.id].stockout_risk_days if p.id in reorders else None,
                "daily_demand": reorders[p.id].avg_daily_demand if p.id in reorders else 0.0,
                "urgency": reorders[p.id].urgency_level if p.id in reorders else "HEALTHY",
                "recommended_order_qty": reorders[p.id].recommended_order_qty if p.id in reorders else 0.0,
            }
            for p in matched[:15]
        ],
        "data_type": "ACTUAL",
    }


def tool_expiring_batches(db: Session, ctx: TenantContext, days_ahead: int = 30) -> Dict[str, Any]:
    bid = ctx.business.id
    cutoff = date.today() + timedelta(days=days_ahead)
    batches = (
        db.query(ProductBatch, Product.name, Product.unit)
        .join(Product, Product.id == ProductBatch.product_id)
        .filter(
            ProductBatch.business_id == bid,
            ProductBatch.is_active == True,
            ProductBatch.quantity > 0,
            ProductBatch.expiry_date != None,
            ProductBatch.expiry_date <= cutoff,
        )
        .order_by(ProductBatch.expiry_date.asc())
        .all()
    )
    today = date.today()
    items = []
    at_risk_val = 0.0
    for b, prod_name, unit in batches:
        days_rem = (b.expiry_date - today).days
        val = round(float(b.quantity) * float(b.purchase_cost or 0.0), 2)
        at_risk_val += val
        items.append({
            "batch_id": b.id,
            "product_id": b.product_id,
            "product_name": prod_name,
            "batch_number": b.batch_number,
            "quantity": b.quantity,
            "unit": unit,
            "expiry_date": b.expiry_date.isoformat(),
            "days_remaining": days_rem,
            "at_risk_value": val,
        })
    return {
        "days_horizon": days_ahead,
        "expiring_batches_count": len(items),
        "total_at_risk_value": round(at_risk_val, 2),
        "batches": items,
        "data_type": "ACTUAL",
    }


def tool_what_if_scenario(
    db: Session,
    ctx: TenantContext,
    scenario_kind: str,
    param_value: float,
    product_id: Optional[int] = None,
) -> Dict[str, Any]:
    bid = ctx.business.id
    if scenario_kind == "SUPPLIER_DELAY":
        res = simulate_supplier_delay(db, bid, delay_days=max(1, int(round(param_value))))
    elif scenario_kind == "DEMAND_SHOCK":
        res = simulate_demand_shock(db, bid, demand_change_percent=param_value)
    else:
        res = simulate_price_elasticity(db, bid, product_id=product_id, price_change_percent=param_value)
    res["data_type"] = "HYPOTHETICAL_SIMULATION"
    res["non_guarantee_disclaimer"] = (
        "Simulated what-if projection based on current catalog margins, velocity, and elasticity assumptions — not guaranteed actual results."
    )
    return res


def tool_audit_and_anomalies(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    bid = ctx.business.id
    open_anomalies = (
        db.query(AnomalyAlert)
        .filter(AnomalyAlert.business_id == bid, AnomalyAlert.status == AnomalyStatusEnum.PENDING_REVIEW)
        .order_by(desc(AnomalyAlert.created_at))
        .limit(10)
        .all()
    )
    active_ai_alerts = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == bid, AIAlert.status == "ACTIVE")
        .order_by(desc(AIAlert.detected_at))
        .limit(10)
        .all()
    )
    recent_audit = (
        db.query(AuditLog)
        .filter(AuditLog.business_id == bid)
        .order_by(desc(AuditLog.created_at))
        .limit(12)
        .all()
    )
    return {
        "pending_system_anomalies": [
            {
                "id": a.id,
                "type": a.alert_type,
                "severity": a.severity.value if hasattr(a.severity, "value") else str(a.severity),
                "description": a.description,
                "created_at": a.created_at.strftime("%Y-%m-%d %H:%M"),
            }
            for a in open_anomalies
        ],
        "active_ai_alerts": [
            {
                "id": a.id,
                "category": a.category,
                "severity": a.severity,
                "title": a.title,
                "what_happened": a.what_happened,
            }
            for a in active_ai_alerts
        ],
        "recent_audit_events": [
            {
                "id": l.id,
                "action": l.action,
                "entity_type": l.entity_type,
                "entity_id": l.entity_id,
                "created_at": l.created_at.strftime("%Y-%m-%d %H:%M"),
            }
            for l in recent_audit
        ],
        "data_type": "ACTUAL",
    }


def tool_gstr1_summary(db: Session, ctx: TenantContext) -> Dict[str, Any]:
    report = get_gstr1_report(db, ctx.business.id)
    return {
        "summary": report.summary.model_dump(),
        "b2b_count": len(report.b2b),
        "b2cs_slabs": [b.model_dump() for b in report.b2cs],
        "top_hsn": [h.model_dump() for h in report.hsn_summary[:8]],
        "data_type": "ACTUAL",
    }
