import asyncio
import json
import threading
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context, record_audit_log, require_roles
from app.models.ai import (
    AIAlert,
    AIApproval,
    AIConversation,
    AIDocument,
    AIMemory,
    AIMessage,
    AIWorkflow,
    utc_now,
)
from app.models.business import RoleEnum
from app.schemas.ai_ultra import (
    AIAlertOut,
    AIAlertStatusUpdate,
    AIApprovalDecisionRequest,
    AIApprovalOut,
    AIBriefingOut,
    AIChatRequest,
    AIChatResponse,
    AIConversationCreate,
    AIConversationOut,
    AIDocumentOut,
    AIMemoryCreate,
    AIMemoryOut,
    AIMessageOut,
    AIObservabilityOut,
    AIRuntimeOut,
    AIWorkflowCreate,
    AIWorkflowOut,
    AIWorkflowToggle,
)
from app.smartstock_ai.agents.specialists import SPECIALIST_AGENTS
from app.smartstock_ai.documents.document_engine import extract_and_match_document
from app.smartstock_ai.evaluations.eval_runner import get_ai_observability_snapshot
from app.smartstock_ai.llm_gateway import get_llm_status
from app.smartstock_ai.monitoring.proactive_engine import (
    build_daily_briefing,
    create_ai_workflow,
    execute_workflow,
    run_proactive_scan,
    serialize_alert,
)
from app.smartstock_ai.orchestrator import (
    approval_to_out,
    message_to_out,
    run_ai_ultra_turn,
    stream_ai_ultra_chat,
)
from app.smartstock_ai.security.guard import (
    can_approve_action,
    contains_secret_pattern,
    get_role_tool_partition,
)
from app.smartstock_ai.tools.write_tools import execute_approved_action, reject_approval_action

router = APIRouter(prefix="/ai", tags=["SmartStock AI Ultra"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _doc_to_out(d: AIDocument) -> AIDocumentOut:
    try:
        ext = json.loads(d.extracted_json or "{}")
    except Exception:
        ext = {}
    return AIDocumentOut(
        id=d.id,
        business_id=d.business_id,
        conversation_id=d.conversation_id,
        filename=d.filename,
        content_type=d.content_type,
        document_type=d.document_type,
        file_size_bytes=d.file_size_bytes,
        extraction_status=d.extraction_status,
        raw_excerpt=d.raw_excerpt,
        extracted=ext,
        created_at=d.created_at,
    )


def _wf_to_out(w: AIWorkflow) -> AIWorkflowOut:
    try:
        cond = json.loads(w.condition_json or "{}")
    except Exception:
        cond = {}
    try:
        act = json.loads(w.action_json or "{}")
    except Exception:
        act = {}
    return AIWorkflowOut(
        id=w.id,
        business_id=w.business_id,
        name=w.name,
        natural_language_rule=w.natural_language_rule,
        trigger_type=w.trigger_type,
        schedule_cron=w.schedule_cron,
        condition=cond,
        action=act,
        requires_approval=w.requires_approval,
        is_active=w.is_active,
        last_run_at=w.last_run_at,
        last_run_summary=w.last_run_summary,
        run_count=w.run_count,
        created_at=w.created_at,
    )


@router.get("/runtime", response_model=AIRuntimeOut)
def get_ai_runtime(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    role = ctx.membership.role.value
    allowed, restricted = get_role_tool_partition(role)
    llm = get_llm_status()
    pending_count = (
        db.query(AIApproval)
        .filter(AIApproval.business_id == ctx.business.id, AIApproval.status == "PENDING")
        .count()
    )
    alerts_count = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == ctx.business.id, AIAlert.status == "ACTIVE")
        .count()
    )
    return AIRuntimeOut(
        assistant_name="SmartStock AI Ultra",
        version="2.0.0",
        workspace_name=ctx.business.name,
        role=role,
        active_provider=llm["active_provider"],
        external_llm_enabled=llm["external_llm_enabled"],
        external_providers=llm["external_providers"],
        supported_modes=["QUICK_ASSIST", "DEEP_ANALYSIS", "AGENT"],
        supported_languages=["auto", "en", "kn", "hi"],
        specialists=SPECIALIST_AGENTS,
        allowed_tools=allowed,
        restricted_tools=restricted,
        pending_approvals_count=pending_count,
        active_alerts_count=alerts_count,
    )


@router.get("/conversations", response_model=List[AIConversationOut])
def list_conversations(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    convs = (
        db.query(AIConversation)
        .filter(
            AIConversation.business_id == ctx.business.id,
            AIConversation.user_id == ctx.user.id,
        )
        .order_by(desc(AIConversation.last_message_at))
        .limit(40)
        .all()
    )
    out = []
    for c in convs:
        cnt = db.query(AIMessage).filter(AIMessage.conversation_id == c.id).count()
        out.append(
            AIConversationOut(
                id=c.id,
                business_id=c.business_id,
                user_id=c.user_id,
                title=c.title,
                mode=c.mode,
                language=c.language,
                context_summary=c.context_summary,
                last_message_at=c.last_message_at,
                created_at=c.created_at,
                message_count=cnt,
            )
        )
    return out


@router.post("/conversations", response_model=AIConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    req: AIConversationCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    conv = AIConversation(
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        title=(req.title or "New SmartStock AI Session").strip(),
        mode=req.mode,
        language=req.language,
        context_summary=json.dumps({}),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return AIConversationOut(
        id=conv.id,
        business_id=conv.business_id,
        user_id=conv.user_id,
        title=conv.title,
        mode=conv.mode,
        language=conv.language,
        context_summary=conv.context_summary,
        last_message_at=conv.last_message_at,
        created_at=conv.created_at,
        message_count=0,
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == conversation_id,
            AIConversation.business_id == ctx.business.id,
            AIConversation.user_id == ctx.user.id,
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return {"message": "Conversation deleted"}


@router.get("/conversations/{conversation_id}/messages", response_model=List[AIMessageOut])
def list_conversation_messages(
    conversation_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == conversation_id,
            AIConversation.business_id == ctx.business.id,
            AIConversation.user_id == ctx.user.id,
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conv.id)
        .order_by(AIMessage.created_at.asc(), AIMessage.id.asc())
        .all()
    )
    return [message_to_out(m, db) for m in msgs]


@router.post("/chat", response_model=AIChatResponse)
def ai_ultra_chat(
    req: AIChatRequest,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    return run_ai_ultra_turn(
        db=db,
        ctx=ctx,
        message=req.message,
        conversation_id=req.conversation_id,
        mode=req.mode,
        language=req.language,
        document_id=req.document_id,
    )


@router.post("/chat/stream")
async def ai_ultra_chat_stream(
    req: AIChatRequest,
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    cancel_event = threading.Event()
    gen = stream_ai_ultra_chat(
        db=db,
        ctx=ctx,
        message=req.message,
        conversation_id=req.conversation_id,
        mode=req.mode,
        language=req.language,
        document_id=req.document_id,
        cancel_event=cancel_event,
    )
    _sentinel = object()

    async def _event_stream():
        async def _watch_disconnect():
            try:
                while not cancel_event.is_set():
                    if await request.is_disconnected():
                        cancel_event.set()
                        break
                    await asyncio.sleep(0.15)
            except Exception:
                pass

        watcher = asyncio.create_task(_watch_disconnect())
        try:
            while True:
                if await request.is_disconnected():
                    cancel_event.set()
                    break
                chunk = await run_in_threadpool(next, gen, _sentinel)
                if chunk is _sentinel:
                    break
                yield chunk
        finally:
            cancel_event.set()
            watcher.cancel()
            try:
                await watcher
            except BaseException:
                pass
            try:
                gen.close()
            except Exception:
                pass

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/approvals", response_model=List[AIApprovalOut])
def list_approvals(
    status_filter: Optional[str] = Query(None, alias="status"),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    q = db.query(AIApproval).filter(AIApproval.business_id == ctx.business.id)
    if status_filter:
        q = q.filter(AIApproval.status == status_filter.upper())
    rows = q.order_by(desc(AIApproval.created_at)).limit(50).all()
    return [approval_to_out(r) for r in rows]


@router.post("/approvals/{approval_id}/approve", response_model=AIApprovalOut)
def approve_ai_action(
    approval_id: int,
    req: AIApprovalDecisionRequest = AIApprovalDecisionRequest(),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    appr = db.query(AIApproval).filter(AIApproval.id == approval_id, AIApproval.business_id == ctx.business.id).first()
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")
    updated = execute_approved_action(db, ctx, appr, decision_note=req.note, edited_payload=req.edited_payload)
    return approval_to_out(updated)


@router.post("/approvals/{approval_id}/reject", response_model=AIApprovalOut)
def reject_ai_action(
    approval_id: int,
    req: AIApprovalDecisionRequest = AIApprovalDecisionRequest(),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    appr = db.query(AIApproval).filter(AIApproval.id == approval_id, AIApproval.business_id == ctx.business.id).first()
    if not appr:
        raise HTTPException(status_code=404, detail="Approval request not found")
    if not can_approve_action(ctx.membership.role.value, appr.action_type):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{ctx.membership.role.value}' cannot reject '{appr.action_type}' requests.",
        )
    updated = reject_approval_action(db, ctx, appr, decision_note=req.note)
    return approval_to_out(updated)


@router.get("/alerts", response_model=List[AIAlertOut])
def list_ai_alerts(
    auto_scan: bool = True,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    if auto_scan:
        return run_proactive_scan(db, ctx.business.id, force=False)
    rows = (
        db.query(AIAlert)
        .filter(AIAlert.business_id == ctx.business.id)
        .order_by(desc(AIAlert.detected_at))
        .limit(50)
        .all()
    )
    return [serialize_alert(r) for r in rows]


@router.post("/alerts/scan", response_model=List[AIAlertOut])
def trigger_ai_alert_scan(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    return run_proactive_scan(db, ctx.business.id, force=True)


@router.post("/alerts/{alert_id}/status", response_model=AIAlertOut)
def update_ai_alert_status(
    alert_id: int,
    req: AIAlertStatusUpdate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    alert = db.query(AIAlert).filter(AIAlert.id == alert_id, AIAlert.business_id == ctx.business.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = req.status
    if req.status in ("RESOLVED", "DISMISSED"):
        alert.resolved_at = utc_now()
    db.commit()
    db.refresh(alert)
    return serialize_alert(alert)


@router.get("/briefing", response_model=AIBriefingOut)
def get_ai_daily_briefing(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    return build_daily_briefing(db, ctx)


@router.post("/documents/upload", response_model=AIDocumentOut)
async def upload_ai_document(
    file: UploadFile = File(...),
    document_type: str = Form("PURCHASE_INVOICE"),
    conversation_id: Optional[int] = Form(None),
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded document exceeds 10 MB limit")

    ext_status, raw_excerpt, extracted = extract_and_match_document(
        db=db,
        business_id=ctx.business.id,
        filename=file.filename or "document.txt",
        content_type=file.content_type or "application/octet-stream",
        raw_bytes=raw_bytes,
        document_type=document_type,
    )
    doc = AIDocument(
        business_id=ctx.business.id,
        uploaded_by_user_id=ctx.user.id,
        conversation_id=conversation_id,
        filename=file.filename or "document.txt",
        content_type=file.content_type or "application/octet-stream",
        document_type=document_type,
        file_size_bytes=len(raw_bytes),
        extraction_status=ext_status,
        raw_excerpt=raw_excerpt,
        extracted_json=json.dumps(extracted, default=str),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    record_audit_log(
        db=db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        action="AI_UPLOAD_DOCUMENT",
        entity_type="ai_document",
        entity_id=str(doc.id),
        details={"filename": doc.filename, "items_count": extracted.get("items_count", 0)},
    )
    return _doc_to_out(doc)


@router.get("/documents", response_model=List[AIDocumentOut])
def list_ai_documents(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AIDocument)
        .filter(AIDocument.business_id == ctx.business.id)
        .order_by(desc(AIDocument.created_at))
        .limit(30)
        .all()
    )
    return [_doc_to_out(r) for r in rows]


@router.get("/memories", response_model=List[AIMemoryOut])
def list_ai_memories(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    return (
        db.query(AIMemory)
        .filter(AIMemory.business_id == ctx.business.id)
        .order_by(desc(AIMemory.updated_at))
        .all()
    )


@router.post("/memories", response_model=AIMemoryOut, status_code=status.HTTP_201_CREATED)
def create_ai_memory(
    req: AIMemoryCreate,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    if contains_secret_pattern(req.memory_value) or contains_secret_pattern(req.memory_key):
        raise HTTPException(
            status_code=400,
            detail="SmartStock AI Memory strictly rejects credentials, passwords, tokens, or API keys.",
        )
    mem = AIMemory(
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        memory_key=req.memory_key.strip(),
        memory_value=req.memory_value.strip(),
        category=req.category,
        is_active=True,
        source="USER_EXPLICIT",
    )
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return mem


@router.delete("/memories/{memory_id}")
def delete_ai_memory(
    memory_id: int,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    mem = db.query(AIMemory).filter(AIMemory.id == memory_id, AIMemory.business_id == ctx.business.id).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    db.delete(mem)
    db.commit()
    return {"message": "Memory entry removed"}


@router.get("/workflows", response_model=List[AIWorkflowOut])
def list_ai_workflows(
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AIWorkflow)
        .filter(AIWorkflow.business_id == ctx.business.id)
        .order_by(desc(AIWorkflow.created_at))
        .all()
    )
    return [_wf_to_out(r) for r in rows]


@router.post("/workflows", response_model=AIWorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow_endpoint(
    req: AIWorkflowCreate,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db),
):
    wf = create_ai_workflow(
        db=db,
        ctx=ctx,
        name=req.name,
        natural_language_rule=req.natural_language_rule,
        trigger_type=req.trigger_type,
        schedule_cron=req.schedule_cron,
        requires_approval=req.requires_approval,
    )
    return _wf_to_out(wf)


@router.patch("/workflows/{workflow_id}", response_model=AIWorkflowOut)
def toggle_workflow(
    workflow_id: int,
    req: AIWorkflowToggle,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db),
):
    wf = db.query(AIWorkflow).filter(AIWorkflow.id == workflow_id, AIWorkflow.business_id == ctx.business.id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if req.is_active is not None:
        wf.is_active = req.is_active
    if req.requires_approval is not None:
        wf.requires_approval = req.requires_approval
    db.commit()
    db.refresh(wf)
    return _wf_to_out(wf)


@router.post("/workflows/{workflow_id}/run")
def run_workflow_now(
    workflow_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db),
):
    wf = db.query(AIWorkflow).filter(AIWorkflow.id == workflow_id, AIWorkflow.business_id == ctx.business.id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return execute_workflow(db, ctx, wf)


@router.delete("/workflows/{workflow_id}")
def delete_workflow(
    workflow_id: int,
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db),
):
    wf = db.query(AIWorkflow).filter(AIWorkflow.id == workflow_id, AIWorkflow.business_id == ctx.business.id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(wf)
    db.commit()
    return {"message": "Workflow deleted"}


@router.get("/observability", response_model=AIObservabilityOut)
def get_observability(
    ctx: TenantContext = Depends(require_roles([RoleEnum.OWNER, RoleEnum.MANAGER])),
    db: Session = Depends(get_db),
):
    return AIObservabilityOut(**get_ai_observability_snapshot(db, ctx.business.id))
