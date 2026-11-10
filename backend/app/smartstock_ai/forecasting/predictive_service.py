import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceStatusEnum
from app.models.product import Product
from app.services.analytics_service import get_daily_sales_trend, get_stock_ageing_report
from app.services.ml_forecasting_service import (
    fetch_product_daily_sales,
    generate_product_forecast,
    get_shop_forecast_overview,
)
from app.services.recommendation_service import calculate_reorder_recommendations


def _holt_exponential_smoothing(values: np.ndarray, alpha: float = 0.35, beta: float = 0.15) -> float:
    """Computes Holt linear trend one-step smoothed level + trend without fragile heavy dependencies."""
    if len(values) == 0:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    level = float(values[0])
    trend = float(values[1] - values[0])
    for v in values[1:]:
        prev_level = level
        level = alpha * float(v) + (1.0 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1.0 - beta) * trend
    return max(0.0, level + trend)


def evaluate_extended_product_forecast(
    db: Session,
    business_id: int,
    product_id: int,
    horizon_days: int = 7,
) -> Dict[str, Any]:
    """Combines baseline ML forecasting service with Holt exponential smoothing benchmark when history allows."""
    base = generate_product_forecast(db, business_id, product_id, horizon_days=horizon_days)
    df = fetch_product_daily_sales(db, business_id, product_id)
    n_days = len(df)
    holt_daily = None
    holt_wape = None

    if n_days >= 14 and df["demand"].sum() > 0:
        series = df["demand"].values.astype(float)
        split_idx = max(10, int(len(series) * 0.8))
        train = series[:split_idx]
        test = series[split_idx:]
        holt_pred = _holt_exponential_smoothing(train)
        test_sum = float(np.sum(test))
        holt_mae = float(np.mean(np.abs(test - holt_pred)))
        holt_wape = round((np.sum(np.abs(test - holt_pred)) / test_sum * 100.0) if test_sum > 0 else 0.0, 1)
        holt_daily = round(_holt_exponential_smoothing(series), 2)
        if base.wape is not None and holt_wape < base.wape and holt_daily > 0:
            selected_daily = holt_daily
            forecast_qty = round(selected_daily * horizon_days, 2)
            return {
                "product_id": base.product_id,
                "product_name": base.product_name,
                "status": "HOLT_EXPONENTIAL_SMOOTHING",
                "confidence_level": base.confidence_level,
                "selected_model": "Holt Double Exponential Smoothing",
                "horizon_days": horizon_days,
                "forecast_quantity": forecast_qty,
                "lower_bound": round(max(0.0, forecast_qty * 0.78), 2),
                "upper_bound": round(forecast_qty * 1.22, 2),
                "daily_run_rate": selected_daily,
                "mae": round(holt_mae, 2),
                "wape": holt_wape,
                "stockout_risk_days": base.stockout_risk_days,
                "data_days": n_days,
                "data_type": "FORECAST",
                "explanation": (
                    f"Holt Exponential Smoothing outperformed baseline ensemble on recent holdout days "
                    f"(WAPE {holt_wape}%, MAE {holt_mae:.2f} vs baseline {base.wape}%)."
                ),
            }

    return {
        "product_id": base.product_id,
        "product_name": base.product_name,
        "status": base.status,
        "confidence_level": base.confidence_level,
        "selected_model": base.selected_model,
        "horizon_days": horizon_days,
        "forecast_quantity": base.forecast_quantity,
        "lower_bound": base.lower_bound,
        "upper_bound": base.upper_bound,
        "daily_run_rate": base.daily_run_rate,
        "mae": base.mae,
        "wape": base.wape,
        "stockout_risk_days": base.stockout_risk_days,
        "data_days": n_days,
        "holt_benchmark_daily": holt_daily,
        "holt_benchmark_wape": holt_wape,
        "data_type": "FORECAST" if base.confidence_level != "INSUFFICIENT" else "INSUFFICIENT_HISTORY",
        "explanation": base.explanation,
    }


def forecast_store_revenue(db: Session, business_id: int, horizon_days: int = 14) -> Dict[str, Any]:
    """Forecasts aggregate daily revenue using actual invoice time-series + confidence intervals."""
    trend_30 = get_daily_sales_trend(db, business_id, days=30)
    active_days = [pt for pt in trend_30 if pt.sales > 0 or pt.invoices > 0]

    # Measure genuine earliest invoice span
    earliest = db.query(func.min(Invoice.created_at)).filter(
        Invoice.business_id == business_id,
        Invoice.status == InvoiceStatusEnum.COMPLETED,
    ).scalar()

    if not earliest or len(active_days) == 0:
        return {
            "status": "INSUFFICIENT_DATA",
            "confidence_level": "INSUFFICIENT",
            "data_days": 0,
            "horizon_days": horizon_days,
            "projected_revenue": 0.0,
            "lower_bound": 0.0,
            "upper_bound": 0.0,
            "daily_projected_sales": 0.0,
            "method": "Insufficient POS History",
            "assumptions": [
                "Zero completed invoices exist in this workspace yet; revenue projections require at least 1 active trading day.",
            ],
            "daily_series": [],
            "data_type": "FORECAST",
        }

    # Trim window from first active sale day up to today (capped 30d) so new stores are not penalized by 29 pre-onboarding zeros
    first_active_date = max(earliest.date(), date.today() - timedelta(days=29))
    relevant_pts = [pt for pt in trend_30 if datetime.strptime(pt.date, "%Y-%m-%d").date() >= first_active_date]
    sales_arr = np.array([float(pt.sales) for pt in relevant_pts], dtype=float)
    n_days = len(sales_arr)

    avg_daily = float(np.mean(sales_arr)) if n_days > 0 else 0.0
    std_daily = float(np.std(sales_arr)) if n_days > 1 else avg_daily * 0.25

    if n_days >= 14:
        smoothed = _holt_exponential_smoothing(sales_arr, alpha=0.35, beta=0.12)
        recent_7 = float(np.mean(sales_arr[-7:]))
        daily_base = round(0.55 * recent_7 + 0.45 * smoothed, 2)
        confidence = "HIGH"
        method = "Holt Exponential Smoothing + 7-Day Rolling Blend"
    elif n_days >= 5:
        daily_base = round(float(np.mean(sales_arr[-min(7, n_days):])), 2)
        confidence = "MEDIUM"
        method = "Active Window Moving Average"
    else:
        daily_base = round(avg_daily, 2)
        confidence = "BASELINE"
        method = "Early Store Operating Average (Low History)"

    daily_series = []
    projected_total = 0.0
    margin_total = 0.0
    today = date.today()

    for step in range(1, horizon_days + 1):
        d = today + timedelta(days=step)
        dow = d.weekday()
        lift = 1.10 if dow in (5, 6) else (0.96 if dow in (0, 1) else 1.0)
        exp_val = round(max(0.0, daily_base * lift), 2)
        ci_half = round(max(exp_val * 0.12, 1.28 * std_daily * math.sqrt(max(1.0, step / 7.0))), 2)
        projected_total += exp_val
        margin_total += ci_half
        daily_series.append({
            "date": d.strftime("%Y-%m-%d"),
            "day": d.strftime("%a"),
            "projected_sales": exp_val,
            "lower_bound": round(max(0.0, exp_val - ci_half), 2),
            "upper_bound": round(exp_val + ci_half, 2),
        })

    lower_total = round(max(0.0, projected_total - (margin_total * 0.45)), 2)
    upper_total = round(projected_total + (margin_total * 0.45), 2)

    return {
        "status": "READY",
        "confidence_level": confidence,
        "data_days": n_days,
        "active_trading_days": len(active_days),
        "horizon_days": horizon_days,
        "daily_projected_sales": round(daily_base, 2),
        "projected_revenue": round(projected_total, 2),
        "lower_bound": lower_total,
        "upper_bound": upper_total,
        "method": method,
        "assumptions": [
            f"Evaluated over {n_days} active operating day(s) ({len(active_days)} day(s) with recorded sales).",
            "Applies empirical retail weekend uplift (+10% Sat-Sun, -4% Mon-Tue) on top of smoothed run-rate.",
            "Figures are statistical estimates (FORECAST) and not guaranteed booked revenue.",
        ],
        "daily_series": daily_series,
        "data_type": "FORECAST",
    }


def get_comprehensive_predictive_snapshot(db: Session, business_id: int) -> Dict[str, Any]:
    """Builds store-wide predictive risks: stockout horizon, demand forecast, slow/dead stock & revenue projection."""
    overview = get_shop_forecast_overview(db, business_id)
    reorders = calculate_reorder_recommendations(db, business_id, all_items=True)
    ageing = get_stock_ageing_report(db, business_id)
    rev_forecast_7d = forecast_store_revenue(db, business_id, horizon_days=7)
    rev_forecast_30d = forecast_store_revenue(db, business_id, horizon_days=30)

    stockouts_within_7d = [
        r for r in reorders
        if r.needs_reorder and (r.stockout_risk_days is not None and r.stockout_risk_days <= 7.0)
    ]
    out_of_stock_now = [r for r in reorders if r.current_stock <= 0]

    fast_movers = sorted(
        [f for f in overview if f.daily_velocity > 0],
        key=lambda x: x.daily_velocity,
        reverse=True,
    )[:5]

    return {
        "revenue_forecast_7d": rev_forecast_7d,
        "revenue_forecast_30d": rev_forecast_30d,
        "out_of_stock_count": len(out_of_stock_now),
        "stockout_within_7d_count": len(stockouts_within_7d),
        "stockouts_within_7d": [
            {
                "product_id": r.product_id,
                "product_name": r.product_name,
                "current_stock": r.current_stock,
                "incoming_po_stock": r.incoming_po_stock,
                "daily_demand": r.avg_daily_demand,
                "days_left": r.stockout_risk_days,
                "recommended_order_qty": r.recommended_order_qty,
                "estimated_cost": r.estimated_cost,
                "supplier_id": r.supplier_id,
                "supplier_name": r.supplier_name,
                "urgency": r.urgency_level,
                "unit": r.unit,
            }
            for r in stockouts_within_7d
        ],
        "reorder_candidates": [
            {
                "product_id": r.product_id,
                "product_name": r.product_name,
                "current_stock": r.current_stock,
                "incoming_po_stock": r.incoming_po_stock,
                "daily_demand": r.avg_daily_demand,
                "days_left": r.stockout_risk_days,
                "recommended_order_qty": r.recommended_order_qty,
                "unit_cost": r.unit_cost,
                "estimated_cost": r.estimated_cost,
                "supplier_id": r.supplier_id,
                "supplier_name": r.supplier_name,
                "urgency": r.urgency_level,
                "unit": r.unit,
            }
            for r in reorders
            if r.needs_reorder
        ],
        "fast_movers": [
            {
                "product_id": f.product_id,
                "product_name": f.product_name,
                "daily_velocity": f.daily_velocity,
                "forecast_7d": f.forecast_7d,
                "forecast_30d": f.forecast_30d,
                "confidence": f.confidence_level,
                "model_name": f.model_name,
            }
            for f in fast_movers
        ],
        "dead_stock_value": ageing.total_dead_stock_value,
        "slow_and_dead_items": [
            {
                "product_id": s.product_id,
                "product_name": s.product_name,
                "current_stock": s.current_stock,
                "inventory_value": s.inventory_value,
                "days_inactive": s.days_since_last_sale,
                "status": s.status,
            }
            for s in ageing.slow_and_dead_products[:8]
        ],
    }
