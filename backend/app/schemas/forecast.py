from pydantic import BaseModel
from typing import Optional, List

class ModelEvaluationMetrics(BaseModel):
    model_name: str
    mae: float
    wape: float
    training_days_count: int
    test_days_count: int
    baseline_comparison: str

class ForecastDailyPoint(BaseModel):
    day_offset: int
    date: str
    day_name: str
    projected_demand: float
    lower_bound: float
    upper_bound: float

class ForecastItemOut(BaseModel):
    product_id: int
    product_name: str
    status: str  # ACTIVE_ENSEMBLE, ROLLING_TREND, ADAPTIVE_VELOCITY, NO_SALES_RECORDED
    horizon_days: int
    forecast_quantity: float
    lower_bound: float
    upper_bound: float
    historical_daily_avg: float
    daily_run_rate: float
    selected_model: str  # Ridge Regression, Moving Average (7d), Seasonal Naive, Adaptive Velocity, or Baseline
    confidence_level: str  # HIGH, MEDIUM, BASELINE, INSUFFICIENT
    mae: Optional[float] = None
    wape: Optional[float] = None
    model_version: str
    trained_at: Optional[str] = None
    stockout_risk_days: Optional[float] = None
    explanation: str
    daily_projections: List[ForecastDailyPoint] = []

class ProductForecastReport(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str] = None
    category_name: Optional[str] = None
    unit: str = "units"
    current_stock: float
    status: str  # ACTIVE_ENSEMBLE, ROLLING_TREND, ADAPTIVE_VELOCITY, NO_SALES_RECORDED
    confidence_level: str = "BASELINE"
    model_name: str = "Adaptive Velocity"
    daily_velocity: float = 0.0
    days_of_sales_history: int
    required_history_days: int = 14
    forecast_7d: Optional[float] = None
    forecast_14d: Optional[float] = None
    forecast_30d: Optional[float] = None
    stockout_risk_days: Optional[float] = None
    model_metrics: Optional[ModelEvaluationMetrics] = None
    explanation: str

class ReorderRecommendationOut(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str] = None
    current_stock: float
    incoming_po_stock: float
    effective_stock: float  # current_stock + incoming_po_stock
    avg_daily_demand: float
    supplier_lead_time_days: int
    lead_time_demand: float  # avg_daily_demand * lead_time_days
    safety_stock: float
    reorder_point: float  # lead_time_demand + safety_stock
    recommended_order_qty: float
    min_order_qty: float
    unit: str
    unit_cost: float
    estimated_cost: float
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    urgency_level: str  # CRITICAL, HIGH, MEDIUM, LOW, HEALTHY
    stockout_risk_days: Optional[float] = None
    needs_reorder: bool = True
    reason: str
    is_forecast_backed: bool
