import asyncio
from contextlib import asynccontextmanager
import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import engine, Base, SessionLocal, ensure_schema_compatibility
import app.models  # ensures all models are imported before create_all

# Routers
from app.routers import (
    auth,
    businesses,
    categories,
    products,
    inventory,
    invoices,
    purchases,
    suppliers,
    customers,
    expenses,
    analytics,
    forecasting,
    recommendations,
    reconciliation,
    simulator,
    assistant,
    agent,
    ai_ultra,
    anomalies,
    sync,
    audit,
    cash_drawer,
)
from app.models.business import Business
from app.smartstock_ai.monitoring.proactive_engine import run_proactive_scan

# Initialize database tables
Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()


async def _proactive_monitor_loop():
    """Periodic background health evaluator for active workspaces."""
    interval = max(60, settings.AI_PROACTIVE_SCAN_INTERVAL_SEC)
    while True:
        try:
            db = SessionLocal()
            try:
                businesses_list = db.query(Business).filter(Business.is_active == True).all()
                for biz in businesses_list:
                    run_proactive_scan(db, biz.id, force=False)
            finally:
                db.close()
        except Exception:
            pass
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    bg_task = None
    if settings.AI_ENABLE_BACKGROUND_MONITOR and "PYTEST_CURRENT_TEST" not in os.environ:
        bg_task = asyncio.create_task(_proactive_monitor_loop())
    try:
        yield
    finally:
        if bg_task:
            bg_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SmartStock — Intelligent Inventory, Billing, Sales Analytics & Business Decision Platform for Independent Retailers in India.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add correlation and timing headers
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    return response

# Health check
@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "HEALTHY",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "timezone": settings.DEFAULT_TIMEZONE,
        "currency": settings.DEFAULT_CURRENCY,
        "locale": settings.DEFAULT_LOCALE
    }

# Register all API v1 routers
prefix = settings.API_V1_STR
app.include_router(auth.router, prefix=prefix)
app.include_router(businesses.router, prefix=prefix)
app.include_router(categories.router, prefix=prefix)
app.include_router(products.router, prefix=prefix)
app.include_router(inventory.router, prefix=prefix)
app.include_router(invoices.router, prefix=prefix)
app.include_router(purchases.router, prefix=prefix)
app.include_router(suppliers.router, prefix=prefix)
app.include_router(customers.router, prefix=prefix)
app.include_router(expenses.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix)
app.include_router(forecasting.router, prefix=prefix)
app.include_router(recommendations.router, prefix=prefix)
app.include_router(reconciliation.router, prefix=prefix)
app.include_router(simulator.router, prefix=prefix)
app.include_router(assistant.router, prefix=prefix)
app.include_router(agent.router, prefix=prefix)
app.include_router(ai_ultra.router, prefix=prefix)
app.include_router(anomalies.router, prefix=prefix)
app.include_router(sync.router, prefix=prefix)
app.include_router(audit.router, prefix=prefix)
app.include_router(cash_drawer.router, prefix=prefix)
