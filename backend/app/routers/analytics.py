from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.schemas.analytics import (
    FinancialSummaryOut,
    DailySalesPoint,
    ProductPerformancePoint,
    CategoryPerformancePoint,
    StockAgeingReportOut,
    Gstr1ReportOut
)
from app.dependencies import get_tenant_context, TenantContext
from app.services.analytics_service import (
    get_financial_summary,
    get_daily_sales_trend,
    get_product_performance,
    get_category_performance,
    get_stock_ageing_report,
    get_gstr1_report,
    export_gstr1_csv_string
)

router = APIRouter(prefix="/analytics", tags=["Financial Analytics & Reports"])

@router.get("/summary", response_model=FinancialSummaryOut)
def financial_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_financial_summary(
        db=db,
        business_id=ctx.business.id,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/daily-sales", response_model=List[DailySalesPoint])
def daily_sales_trend(
    days: int = Query(14, ge=7, le=90),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_daily_sales_trend(
        db=db,
        business_id=ctx.business.id,
        days=days
    )

@router.get("/top-products", response_model=List[ProductPerformancePoint])
def top_products_performance(
    limit: int = Query(10, ge=1, le=50),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_product_performance(
        db=db,
        business_id=ctx.business.id,
        limit=limit
    )

@router.get("/categories", response_model=List[CategoryPerformancePoint])
def category_performance(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_category_performance(
        db=db,
        business_id=ctx.business.id
    )

@router.get("/stock-ageing", response_model=StockAgeingReportOut)
def stock_ageing_report(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_stock_ageing_report(
        db=db,
        business_id=ctx.business.id
    )

@router.get("/gstr1-report", response_model=Gstr1ReportOut)
def gstr1_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    return get_gstr1_report(
        db=db,
        business_id=ctx.business.id,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/gstr1-export/csv")
def gstr1_export_csv(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    report = get_gstr1_report(
        db=db,
        business_id=ctx.business.id,
        start_date=start_date,
        end_date=end_date
    )
    csv_content = export_gstr1_csv_string(
        report=report,
        shop_name=ctx.business.name,
        gstin=ctx.business.gstin
    )
    filename = f"GSTR1_{ctx.business.name.replace(' ', '_')}_{report.summary.start_date}_to_{report.summary.end_date}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
