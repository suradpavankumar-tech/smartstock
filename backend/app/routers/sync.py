from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.models.invoice import Invoice
from app.models.anomaly import AnomalyAlert, AnomalyStatusEnum
from app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncItemResult, SyncStatusResponse
from app.schemas.invoice import InvoiceCreate
from app.dependencies import get_tenant_context, TenantContext
from app.services.billing_service import create_sale_invoice

router = APIRouter(prefix="/sync", tags=["Offline Synchronization"])

@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    pending_anomalies = db.query(AnomalyAlert).filter(
        AnomalyAlert.business_id == ctx.business.id,
        AnomalyAlert.status == AnomalyStatusEnum.PENDING_REVIEW
    ).count()

    return SyncStatusResponse(
        server_time=datetime.utcnow(),
        active_business_id=ctx.business.id,
        business_name=ctx.business.name,
        pending_conflicts_count=pending_anomalies,
        connection_status="ONLINE"
    )

@router.post("/push", response_model=SyncPushResponse)
def sync_offline_items(
    req: SyncPushRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db)
):
    results = []
    processed = 0
    skipped = 0
    failed = 0

    for item in req.items:
        try:
            if item.action_type == "CREATE_INVOICE":
                # Check if idempotency key already processed
                existing = db.query(Invoice).filter(
                    Invoice.business_id == ctx.business.id,
                    Invoice.idempotency_key == item.client_uuid
                ).first()

                if existing:
                    skipped += 1
                    results.append(SyncItemResult(
                        client_uuid=item.client_uuid,
                        status="DUPLICATE_SKIPPED",
                        server_id=existing.invoice_number,
                        message="Invoice already recorded previously"
                    ))
                    continue

                inv_data = InvoiceCreate(**item.payload)
                inv_data.idempotency_key = item.client_uuid
                created_inv = create_sale_invoice(
                    db=db,
                    business_id=ctx.business.id,
                    user_id=ctx.user.id,
                    data=inv_data,
                    tax_mode=ctx.business.tax_mode,
                )
                processed += 1
                results.append(SyncItemResult(
                    client_uuid=item.client_uuid,
                    status="PROCESSED",
                    server_id=created_inv.invoice_number,
                    message="Offline invoice successfully synchronized to server"
                ))
            else:
                skipped += 1
                results.append(SyncItemResult(
                    client_uuid=item.client_uuid,
                    status="SKIPPED",
                    message=f"Action type '{item.action_type}' not supported in sync"
                ))
        except Exception as e:
            failed += 1
            results.append(SyncItemResult(
                client_uuid=item.client_uuid,
                status="FAILED",
                message=f"Synchronization failed: {str(e)}"
            ))

    return SyncPushResponse(
        processed_count=processed,
        skipped_count=skipped,
        failed_count=failed,
        results=results
    )
