from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime, date, time
from pydantic import BaseModel
import csv
import io
import json

from app.database import get_db
from app.models.audit import AuditLog
from app.models.business import BusinessMembership, RoleEnum
from app.dependencies import get_tenant_context, TenantContext, require_roles

router = APIRouter(prefix="/audit", tags=["Audit Trails"])

HIGH_RISK_ACTIONS = {
    "CANCEL_INVOICE", "INVOICE_CANCEL",
    "STOCK_ADJUST", "ADJUST_STOCK", "APPROVE_RECONCILIATION",
    "UPDATE_STAFF", "RESET_STAFF_PASSWORD", "REMOVE_STAFF",
    "UPDATE_BUSINESS_PROFILE", "ARCHIVE_PRODUCT", "BULK_IMPORT_PRODUCTS"
}

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details_json: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    is_high_risk: bool = False

    class Config:
        from_attributes = True

class AuditSummaryOut(BaseModel):
    total_events: int
    today_events: int
    cancelled_invoices_count: int
    stock_adjustments_count: int
    security_events_count: int
    unique_users_count: int

@router.get("/summary", response_model=AuditSummaryOut)
def get_audit_summary(
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    base_q = db.query(AuditLog).filter(AuditLog.business_id == ctx.business.id)
    total_events = base_q.count()

    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    today_events = base_q.filter(AuditLog.created_at >= today_start).count()

    cancelled_invoices_count = base_q.filter(
        AuditLog.action.in_(["CANCEL_INVOICE", "INVOICE_CANCEL"])
    ).count()

    stock_adjustments_count = base_q.filter(
        AuditLog.action.in_(["STOCK_ADJUST", "ADJUST_STOCK", "APPROVE_RECONCILIATION"])
    ).count()

    security_events_count = base_q.filter(
        AuditLog.action.in_(["INVITE_STAFF", "UPDATE_STAFF", "RESET_STAFF_PASSWORD", "REMOVE_STAFF", "UPDATE_BUSINESS_PROFILE"])
    ).count()

    unique_users_count = db.query(func.count(func.distinct(AuditLog.user_id))).filter(
        AuditLog.business_id == ctx.business.id,
        AuditLog.user_id.isnot(None)
    ).scalar() or 0

    return AuditSummaryOut(
        total_events=total_events,
        today_events=today_events,
        cancelled_invoices_count=cancelled_invoices_count,
        stock_adjustments_count=stock_adjustments_count,
        security_events_count=security_events_count,
        unique_users_count=unique_users_count
    )

@router.get("/", response_model=List[AuditLogOut])
def list_audit_logs(
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    high_risk_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog).filter(AuditLog.business_id == ctx.business.id)

    if action and action != "ALL":
        query = query.filter(AuditLog.action == action)

    if entity_type and entity_type != "ALL":
        query = query.filter(AuditLog.entity_type == entity_type)

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    if high_risk_only:
        query = query.filter(AuditLog.action.in_(list(HIGH_RISK_ACTIONS)))

    if date_from:
        try:
            d_from = datetime.fromisoformat(date_from)
            query = query.filter(AuditLog.created_at >= d_from)
        except ValueError:
            pass

    if date_to:
        try:
            d_to = datetime.fromisoformat(date_to)
            query = query.filter(AuditLog.created_at <= d_to)
        except ValueError:
            pass

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(AuditLog.action).like(term) |
            func.lower(AuditLog.entity_type).like(term) |
            func.lower(AuditLog.entity_id).like(term) |
            func.lower(AuditLog.details_json).like(term)
        )

    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    # Pre-fetch user roles for this shop to avoid N+1 queries
    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.business_id == ctx.business.id
    ).all()
    role_map = {m.user_id: m.role.value for m in memberships}

    results = []
    for l in logs:
        out = AuditLogOut(
            id=l.id,
            user_id=l.user_id,
            user_name=l.user.full_name if l.user else "System",
            user_role=role_map.get(l.user_id, "System" if not l.user_id else "Staff"),
            action=l.action,
            entity_type=l.entity_type,
            entity_id=l.entity_id,
            details_json=l.details_json,
            ip_address=l.ip_address,
            created_at=l.created_at,
            is_high_risk=(l.action in HIGH_RISK_ACTIONS)
        )
        results.append(out)
    return results

@router.get("/export/csv")
def export_audit_logs_csv(
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
    high_risk_only: bool = False,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog).filter(AuditLog.business_id == ctx.business.id)

    if action and action != "ALL":
        query = query.filter(AuditLog.action == action)
    if entity_type and entity_type != "ALL":
        query = query.filter(AuditLog.entity_type == entity_type)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if high_risk_only:
        query = query.filter(AuditLog.action.in_(list(HIGH_RISK_ACTIONS)))

    logs = query.order_by(desc(AuditLog.created_at)).limit(1000).all()

    memberships = db.query(BusinessMembership).filter(
        BusinessMembership.business_id == ctx.business.id
    ).all()
    role_map = {m.user_id: m.role.value for m in memberships}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Log ID",
        "Timestamp (UTC)",
        "Action Performed",
        "Staff Name",
        "Role",
        "Entity Type",
        "Target Entity ID",
        "Is High Risk",
        "Details JSON",
        "IP / Station"
    ])

    for l in logs:
        user_name = l.user.full_name if l.user else "System"
        user_role = role_map.get(l.user_id, "System" if not l.user_id else "Staff")
        is_hr = "YES" if l.action in HIGH_RISK_ACTIONS else "NO"
        writer.writerow([
            l.id,
            l.created_at.strftime("%Y-%m-%d %H:%M:%S") if l.created_at else "",
            l.action,
            user_name,
            user_role,
            l.entity_type or "",
            l.entity_id or "",
            is_hr,
            l.details_json or "",
            l.ip_address or ""
        ])

    csv_data = output.getvalue()
    date_str = datetime.utcnow().strftime("%Y%m%d_%H%M")
    filename = f"smartstock_audit_log_{ctx.business.name.replace(' ', '_')}_{date_str}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache",
        }
    )
