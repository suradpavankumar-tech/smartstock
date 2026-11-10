from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.schemas.forecast import ProductForecastReport, ForecastItemOut
from app.dependencies import get_tenant_context, TenantContext
from app.services.ml_forecasting_service import get_shop_forecast_overview, generate_product_forecast

router = APIRouter(prefix="/forecasting", tags=["Demand Forecasting & ML"])

@router.get("/overview", response_model=List[ProductForecastReport])
def forecast_overview(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_shop_forecast_overview(
        db=db,
        business_id=ctx.business.id
    )

@router.get("/products/{product_id}", response_model=ForecastItemOut)
def product_forecast_detail(
    product_id: int,
    horizon_days: int = Query(7, ge=1, le=60),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return generate_product_forecast(
        db=db,
        business_id=ctx.business.id,
        product_id=product_id,
        horizon_days=horizon_days
    )
