from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models.anomaly import AnomalyAlert, AnomalyStatusEnum
from app.models.business import RoleEnum
from app.schemas.anomaly import AnomalyOut, AnomalyResolveRequest
from app.dependencies import get_tenant_context, TenantContext, require_roles, record_audit_log

router = APIRouter(prefix="/anomalies", tags=["Unusual Activity & Anomalies"])

@router.get("/", response_model=List[AnomalyOut])
def list_anomaly_alerts(
    status_filter: Optional[AnomalyStatusEnum] = None,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    query = db.query(AnomalyAlert).filter(AnomalyAlert.business_id == ctx.business.id)
    if status_filter:
        query = query.filter(AnomalyAlert.status == status_filter)

    alerts = query.order_by(desc(AnomalyAlert.created_at)).all()
    results = []
    for a in alerts:
        out = AnomalyOut.from_orm(a)
        out.reviewed_by_name = a.reviewed_by.full_name if a.reviewed_by else None
        results.append(out)
    return results

@router.post("/{alert_id}/resolve", response_model=AnomalyOut)
def resolve_anomaly_alert(
    alert_id: int,
    req: AnomalyResolveRequest,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db)
):
    alert = db.query(AnomalyAlert).filter(
        AnomalyAlert.id == alert_id,
        AnomalyAlert.business_id == ctx.business.id
    ).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anomaly alert not found")

    alert.status = req.status
    alert.resolution_notes = req.resolution_notes
    alert.reviewed_by_user_id = ctx.user.id
    alert.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)

    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="RESOLVE_ANOMALY_ALERT",
        entity_type="anomaly_alert",
        entity_id=str(alert.id),
        details={"status": req.status.value, "notes": req.resolution_notes}
    )

    out = AnomalyOut.from_orm(alert)
    out.reviewed_by_name = ctx.user.full_name
    return out
