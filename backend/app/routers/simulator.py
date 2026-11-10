from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional

from app.database import get_db
from app.dependencies import get_tenant_context, TenantContext
from app.services.simulator_service import (
    simulate_supplier_delay,
    simulate_demand_shock,
    simulate_price_elasticity
)

router = APIRouter(prefix="/simulator", tags=["Business Scenario Simulator"])

@router.get("/delay")
def simulate_delay_scenario(
    delay_days: int = Query(5, ge=1, le=30),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return simulate_supplier_delay(
        db=db,
        business_id=ctx.business.id,
        delay_days=delay_days
    )

@router.get("/demand")
def simulate_demand_scenario(
    change_percent: float = Query(20.0, ge=-90.0, le=200.0),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return simulate_demand_shock(
        db=db,
        business_id=ctx.business.id,
        demand_change_percent=change_percent
    )

@router.get("/price")
def simulate_price_scenario(
    product_id: Optional[int] = Query(None),
    price_change_percent: float = Query(5.0, ge=-50.0, le=100.0),
    elasticity: float = Query(-1.2, ge=-5.0, le=0.0),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return simulate_price_elasticity(
        db=db,
        business_id=ctx.business.id,
        product_id=product_id,
        price_change_percent=price_change_percent,
        elasticity=elasticity
    )
