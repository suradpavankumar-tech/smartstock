from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from app.models.product import Product
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatusEnum

def get_active_sales_velocity(db: Session, business_id: int) -> Dict[int, float]:
    """
    Computes daily unit velocity per product.
    Adjusts window to actual store active history days rather than always dividing by 30,
    preventing 30x dilution for newly onboarded stores.
    """
    earliest_inv = db.query(func.min(Invoice.created_at)).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED
    ).scalar()

    if earliest_inv:
        days_active = max(1, (datetime.utcnow() - earliest_inv).days + 1)
        divisor = min(30.0, float(days_active))
    else:
        divisor = 30.0

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    sales = db.query(
        InvoiceItem.product_id,
        func.sum(InvoiceItem.quantity).label("units_sold")
    ).join(Invoice, Invoice.id == InvoiceItem.invoice_id).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
        Invoice.created_at >= thirty_days_ago
    ).group_by(InvoiceItem.product_id).all()

    sales_rate_map: Dict[int, float] = {}
    for row in sales:
        sales_rate_map[row.product_id] = float(row.units_sold or 0.0) / divisor

    return sales_rate_map

def simulate_supplier_delay(
    db: Session,
    business_id: int,
    delay_days: int = 5
) -> Dict[str, Any]:
    """
    Simulates impact if supplier deliveries are delayed by N days.
    Provides complete multi-tiered inventory risk breakdown.
    """
    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    ).all()

    sales_rate_map = get_active_sales_velocity(db, business_id)

    evaluated_products = []
    stockout_products_count = 0
    total_potential_lost_revenue = 0.0

    for p in products:
        daily_burn = sales_rate_map.get(p.id, 0.0)
        is_baseline_estimate = False
        if daily_burn <= 0:
            # Baseline turnover estimate: 0.8 units/day or 5% of stock
            daily_burn = max(0.8, round(p.current_stock * 0.05, 2))
            is_baseline_estimate = True

        normal_lead_time = p.supplier.lead_time_days if (p.supplier and p.supplier.lead_time_days) else 3
        delayed_lead_time = normal_lead_time + delay_days
        demand_during_delayed_gap = daily_burn * delayed_lead_time

        runway_days = round(p.current_stock / daily_burn, 1) if daily_burn > 0 else 0.0

        if p.current_stock < demand_during_delayed_gap:
            units_short = demand_during_delayed_gap - p.current_stock
            lost_rev = round(units_short * p.selling_price, 2)
            risk_level = "CRITICAL"
            status_label = f"Stocks out in {runway_days}d (Deficit: {units_short:.1f} {p.unit})"
            stockout_products_count += 1
            total_potential_lost_revenue += lost_rev
        elif runway_days <= (delayed_lead_time * 1.5):
            units_short = 0.0
            lost_rev = 0.0
            risk_level = "WARNING"
            status_label = f"Buffer depleted to {runway_days}d runway"
        else:
            units_short = 0.0
            lost_rev = 0.0
            risk_level = "SAFE"
            status_label = f"Healthy buffer ({runway_days}d runway)"

        item_data = {
            "product_id": p.id,
            "product_name": p.name,
            "unit": p.unit,
            "current_stock": p.current_stock,
            "daily_burn_rate": round(daily_burn, 2),
            "avg_daily_demand": round(daily_burn, 2),
            "normal_lead_time_days": normal_lead_time,
            "simulated_lead_time_days": delayed_lead_time,
            "days_until_stockout": runway_days,
            "buffer_days": runway_days,
            "projected_units_short": round(units_short, 1),
            "potential_lost_revenue": lost_rev,
            "lost_revenue": lost_rev,
            "risk_level": risk_level,
            "status_label": status_label,
            "is_baseline_estimate": is_baseline_estimate
        }
        evaluated_products.append(item_data)

    # Sort critical risk first, then by shortest runway
    severity_rank = {"CRITICAL": 0, "WARNING": 1, "SAFE": 2}
    evaluated_products.sort(key=lambda x: (severity_rank[x["risk_level"]], x["buffer_days"]))

    recommendation = (
        f"Under a +{delay_days} day supplier delay, {stockout_products_count} product line(s) face stockout with ₹{total_potential_lost_revenue:,.2f} in forfeited sales. "
        f"Place replenishment purchase orders {delay_days} days in advance for critical SKUs."
        if stockout_products_count > 0 else
        f"All active product inventories possess sufficient safety buffers to absorb a +{delay_days} day distributor shipment delay without customer stockouts."
    )

    return {
        "scenario_type": "SUPPLIER_DELIVERY_DELAY",
        "assumptions": f"Simulating a +{delay_days} day delivery disruption across suppliers.",
        "simulated_delay_days": delay_days,
        "impacted_products_count": stockout_products_count,
        "stockout_products_count": stockout_products_count,
        "total_potential_lost_revenue": round(total_potential_lost_revenue, 2),
        "estimated_lost_revenue": round(total_potential_lost_revenue, 2),
        "impacted_products": evaluated_products,
        "vulnerable_products": evaluated_products,
        "recommendation": recommendation
    }

def simulate_demand_shock(
    db: Session,
    business_id: int,
    demand_change_percent: float = 20.0
) -> Dict[str, Any]:
    """
    Simulates impact of a festive demand surge or seasonal slump.
    Provides complete multi-tiered inventory runway breakdown.
    """
    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    ).all()

    sales_rate_map = get_active_sales_velocity(db, business_id)

    multiplier = max(0.1, 1.0 + (demand_change_percent / 100.0))
    evaluated_lines = []
    total_capital_needed_for_reorder = 0.0
    projected_additional_profit = 0.0
    critical_count = 0

    for p in products:
        daily_burn = sales_rate_map.get(p.id, 0.0)
        is_baseline_estimate = False
        if daily_burn <= 0:
            daily_burn = max(0.8, round(p.current_stock * 0.05, 2))
            is_baseline_estimate = True

        simulated_daily_burn = round(daily_burn * multiplier, 2)
        normal_runway = round(p.current_stock / daily_burn, 1) if daily_burn > 0 else 999.0
        simulated_runway = round(p.current_stock / simulated_daily_burn, 1) if simulated_daily_burn > 0 else 999.0

        lead_time = p.supplier.lead_time_days if (p.supplier and p.supplier.lead_time_days) else 3
        unit_margin = max(0.0, p.selling_price - p.purchase_cost)

        # Monthly profit impact
        monthly_delta_units = (simulated_daily_burn - daily_burn) * 30.0
        product_profit_delta = monthly_delta_units * unit_margin
        projected_additional_profit += product_profit_delta

        if simulated_runway <= (lead_time * 2.0):
            needed_units = max(p.min_order_qty, (simulated_daily_burn * lead_time * 2.0) - p.current_stock)
            cost = round(needed_units * p.purchase_cost, 2)
            total_capital_needed_for_reorder += cost
            urgency = "CRITICAL" if simulated_runway <= lead_time else "HIGH"
            critical_count += 1
        else:
            needed_units = 0.0
            cost = 0.0
            urgency = "NORMAL"

        evaluated_lines.append({
            "product_id": p.id,
            "product_name": p.name,
            "unit": p.unit,
            "current_stock": p.current_stock,
            "normal_daily_burn": round(daily_burn, 2),
            "simulated_daily_burn": round(simulated_daily_burn, 2),
            "normal_runway_days": normal_runway,
            "simulated_runway_days": simulated_runway,
            "emergency_order_units": round(needed_units, 1),
            "capital_required": cost,
            "urgency": urgency,
            "is_baseline_estimate": is_baseline_estimate
        })

    urgency_rank = {"CRITICAL": 0, "HIGH": 1, "NORMAL": 2}
    evaluated_lines.sort(key=lambda x: (urgency_rank[x["urgency"]], x["simulated_runway_days"]))

    acceleration_text = f"{demand_change_percent:+.0f}% {'acceleration' if demand_change_percent >= 0 else 'slowdown'}"

    summary = (
        f"Under a {demand_change_percent:+.1f}% demand surge, {critical_count} product line(s) will exhaust inventory within supplier lead times. "
        f"An estimated ₹{total_capital_needed_for_reorder:,.2f} in procurement funds is needed to prevent shelf stockouts, "
        f"generating a projected monthly gross profit impact of {projected_additional_profit:+,.2f}."
    )

    return {
        "scenario_type": "DEMAND_SHOCK_SIMULATION",
        "assumptions": f"Simulating a {demand_change_percent:+.1f}% shift in retail sales demand.",
        "demand_change_percent": demand_change_percent,
        "critical_lines_count": critical_count,
        "total_capital_needed_for_reorder": round(total_capital_needed_for_reorder, 2),
        "additional_capital_required": round(total_capital_needed_for_reorder, 2),
        "projected_additional_profit": round(projected_additional_profit, 2),
        "depletion_acceleration": acceleration_text,
        "critical_lines": evaluated_lines,
        "summary": summary
    }

def simulate_price_elasticity(
    db: Session,
    business_id: int,
    product_id: Optional[int] = None,
    price_change_percent: float = 5.0,
    elasticity: float = -1.2
) -> Dict[str, Any]:
    """
    Simulates retail price changes using Price Elasticity of Demand (Ed).
    % Delta Quantity = Ed * % Delta Price
    """
    query = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_archived == False
    )
    if product_id:
        query = query.filter(Product.id == product_id)

    products = query.all()
    if not products:
        products = db.query(Product).filter(Product.business_id == business_id).all()

    sales_rate_map = get_active_sales_velocity(db, business_id)

    demand_change_pct = elasticity * (price_change_percent / 100.0)
    quantity_multiplier = max(0.1, 1.0 + demand_change_pct)

    results = []
    total_baseline_revenue = 0.0
    total_simulated_revenue = 0.0
    total_baseline_profit = 0.0
    total_simulated_profit = 0.0

    for p in products:
        daily_units = sales_rate_map.get(p.id, 0.0)
        if daily_units <= 0:
            daily_units = max(0.8, round(p.current_stock * 0.05, 2))

        base_monthly_units = daily_units * 30.0
        sim_monthly_units = base_monthly_units * quantity_multiplier

        base_price = p.selling_price
        sim_price = round(base_price * (1.0 + (price_change_percent / 100.0)), 2)
        cost_price = p.purchase_cost

        base_unit_margin = base_price - cost_price
        sim_unit_margin = sim_price - cost_price

        base_margin_pct = (base_unit_margin / base_price * 100.0) if base_price > 0 else 0.0
        sim_margin_pct = (sim_unit_margin / sim_price * 100.0) if sim_price > 0 else 0.0

        base_rev = base_monthly_units * base_price
        sim_rev = sim_monthly_units * sim_price

        base_profit = base_monthly_units * base_unit_margin
        sim_profit = sim_monthly_units * sim_unit_margin

        rev_delta = sim_rev - base_rev
        profit_delta = sim_profit - base_profit

        total_baseline_revenue += base_rev
        total_simulated_revenue += sim_rev
        total_baseline_profit += base_profit
        total_simulated_profit += sim_profit

        results.append({
            "product_id": p.id,
            "product_name": p.name,
            "unit": p.unit,
            "base_selling_price": base_price,
            "simulated_selling_price": sim_price,
            "purchase_cost": cost_price,
            "base_unit_margin": round(base_unit_margin, 2),
            "simulated_unit_margin": round(sim_unit_margin, 2),
            "base_margin_percent": round(base_margin_pct, 1),
            "simulated_margin_percent": round(sim_margin_pct, 1),
            "base_monthly_units": round(base_monthly_units, 1),
            "simulated_monthly_units": round(sim_monthly_units, 1),
            "monthly_revenue_delta": round(rev_delta, 2),
            "monthly_profit_delta": round(profit_delta, 2)
        })

    net_monthly_profit_delta = total_simulated_profit - total_baseline_profit
    net_monthly_revenue_delta = total_simulated_revenue - total_baseline_revenue

    if net_monthly_profit_delta > 0:
        recommendation = (
            f"A {price_change_percent:+.1f}% price adjustment is projected to EXPAND monthly gross profit by ₹{net_monthly_profit_delta:,.2f} "
            f"({(net_monthly_profit_delta/total_baseline_profit*100.0 if total_baseline_profit else 0):+.1f}%), as margin gains exceed estimated demand drop."
        )
    else:
        recommendation = (
            f"A {price_change_percent:+.1f}% price adjustment is projected to REDUCE monthly gross profit by ₹{abs(net_monthly_profit_delta):,.2f}. "
            f"Customer demand drop of {abs(demand_change_pct*100):.1f}% erodes volume benefits."
        )

    return {
        "scenario_type": "PRICE_ELASTICITY_SIMULATION",
        "price_change_percent": price_change_percent,
        "elasticity_coefficient": elasticity,
        "total_baseline_monthly_revenue": round(total_baseline_revenue, 2),
        "total_simulated_monthly_revenue": round(total_simulated_revenue, 2),
        "monthly_revenue_delta": round(net_monthly_revenue_delta, 2),
        "total_baseline_monthly_profit": round(total_baseline_profit, 2),
        "total_simulated_monthly_profit": round(total_simulated_profit, 2),
        "monthly_profit_delta": round(net_monthly_profit_delta, 2),
        "products_simulated_count": len(results),
        "product_results": results,
        "recommendation": recommendation
    }
