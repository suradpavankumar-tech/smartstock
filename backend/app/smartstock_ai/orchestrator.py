import concurrent.futures
import json
import queue
import re
import threading
import time
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple
from sqlalchemy import desc, text
from sqlalchemy.orm import Session, sessionmaker

from app.dependencies import TenantContext
from app.models.ai import (
    AIAgentExecution,
    AIApproval,
    AIConversation,
    AIDocument,
    AIMemory,
    AIMessage,
    AITask,
    AIToolExecution,
    AIWorkflow,
    utc_now,
)
from app.models.business import Business, BusinessMembership
from app.models.customer import Customer
from app.models.product import Product
from app.models.purchase import Supplier
from app.models.user import User
from app.schemas.ai_ultra import (
    AIActionShortcut,
    AIApprovalOut,
    AIChartPoint,
    AIChartSpec,
    AIChatResponse,
    AIEvidenceItem,
    AIKpiMetric,
    AIMessageOut,
    AIMessagePayload,
    AISpecialistTrace,
    AITableSpec,
    AIToolTrace,
)
from app.services.recommendation_service import calculate_reorder_recommendations
from app.smartstock_ai.agents.specialists import SPECIALIST_MAP
from app.smartstock_ai.chat_formatter import build_general_gpt_reply
from app.smartstock_ai.evaluations.eval_runner import (
    record_turn_evaluation,
    verify_turn_groundedness,
)
from app.smartstock_ai.forecasting.predictive_service import get_comprehensive_predictive_snapshot
from app.smartstock_ai.llm_gateway import maybe_synthesize_with_llm
from app.smartstock_ai.monitoring.proactive_engine import (
    build_daily_briefing,
    create_ai_workflow,
    execute_workflow,
)
from app.smartstock_ai.multimodal.language_engine import (
    detect_language,
    localize_restriction_notice,
    localize_security_block,
    normalize_multilingual_query,
    translate_text,
)
from app.smartstock_ai.security.guard import (
    contains_secret_pattern,
    inspect_prompt_security,
    is_tool_allowed,
    redact_secrets,
    sanitize_tool_args,
)
from app.smartstock_ai.tools.read_tools import (
    tool_audit_and_anomalies,
    tool_cash_till_status,
    tool_expiring_batches,
    tool_financial_pnl,
    tool_gstr1_summary,
    tool_inventory_lookup,
    tool_khata_receivables,
    tool_margin_and_working_capital,
    tool_profit_drop_investigation,
    tool_sales_summary,
    tool_supplier_price_comparison,
    tool_what_if_scenario,
    tool_workspace_overview,
)
from app.smartstock_ai.tools.write_tools import (
    build_document_import_draft,
    build_expense_approval_draft,
    build_khata_payment_draft,
    build_price_update_draft,
    build_purchase_order_approval_draft,
    build_stock_adjustment_draft,
)


def _L(lang: str, en: str, kn: str, hi: Optional[str] = None) -> str:
    if lang == "kn":
        return kn
    if lang == "hi":
        return hi or en
    return en


def approval_to_out(a: AIApproval) -> AIApprovalOut:
    try:
        preview = json.loads(a.preview_json or "{}")
    except Exception:
        preview = {}
    try:
        exec_res = json.loads(a.execution_result_json) if a.execution_result_json else None
    except Exception:
        exec_res = None
    return AIApprovalOut(
        id=a.id,
        business_id=a.business_id,
        conversation_id=a.conversation_id,
        task_id=a.task_id,
        action_type=a.action_type,
        title=a.title,
        summary=a.summary,
        preview=preview,
        idempotency_key=a.idempotency_key,
        status=a.status,
        decision_note=a.decision_note,
        execution_result=exec_res,
        created_at=a.created_at,
        decided_at=a.decided_at,
        executed_at=a.executed_at,
    )


def message_to_out(msg: AIMessage, db: Optional[Session] = None) -> AIMessageOut:
    try:
        raw_p = json.loads(msg.response_payload_json or "{}") if msg.response_payload_json else {}
    except Exception:
        raw_p = {}
    payload = AIMessagePayload(**raw_p) if raw_p else AIMessagePayload()
    if db and payload.approval_ids:
        rows = (
            db.query(AIApproval)
            .filter(AIApproval.business_id == msg.business_id, AIApproval.id.in_(payload.approval_ids))
            .all()
        )
        payload.approvals = [approval_to_out(r) for r in rows]
    return AIMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        content=msg.content,
        mode=msg.mode,
        language=msg.language,
        intent=msg.intent,
        confidence=msg.confidence,
        payload=payload,
        tokens_used=msg.tokens_used,
        latency_ms=msg.latency_ms,
        created_at=msg.created_at,
    )


def _get_or_create_conversation(
    db: Session,
    ctx: TenantContext,
    conversation_id: Optional[int],
    mode: str,
    language: str,
    first_prompt: str,
) -> AIConversation:
    if conversation_id:
        conv = (
            db.query(AIConversation)
            .filter(
                AIConversation.id == conversation_id,
                AIConversation.business_id == ctx.business.id,
                AIConversation.user_id == ctx.user.id,
            )
            .first()
        )
        if conv:
            return conv

    clean_title = (first_prompt.strip()[:64] + "...") if len(first_prompt.strip()) > 64 else first_prompt.strip()
    conv = AIConversation(
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        title=clean_title or "SmartStock AI Session",
        mode=mode,
        language=language,
        context_summary=json.dumps({}),
    )
    db.add(conv)
    db.flush()
    return conv


def _load_active_memories(db: Session, business_id: int) -> List[AIMemory]:
    return (
        db.query(AIMemory)
        .filter(AIMemory.business_id == business_id, AIMemory.is_active == True)
        .order_by(desc(AIMemory.updated_at))
        .limit(20)
        .all()
    )


def _match_product_from_text(db: Session, business_id: int, text: str) -> Optional[Product]:
    lower = (text or "").lower()
    products = db.query(Product).filter(Product.business_id == business_id, Product.is_archived == False).all()
    for p in sorted(products, key=lambda x: len(x.name), reverse=True):
        if p.name.lower() in lower or (p.sku and p.sku.lower() in lower):
            return p
    for p in products:
        words = [w for w in p.name.lower().split() if len(w) >= 4]
        if words and any(w in lower for w in words):
            return p
    return None


def _match_customer_from_text(db: Session, business_id: int, text: str) -> Optional[Customer]:
    lower = (text or "").lower()
    customers = db.query(Customer).filter(Customer.business_id == business_id).all()
    for c in sorted(customers, key=lambda x: len(x.name), reverse=True):
        if c.name.lower() in lower:
            return c
    return None


class _TraceRecorder:
    def __init__(
        self,
        db: Session,
        task: AITask,
        business_id: int,
        event_cb: Optional[Callable[[str, Dict[str, Any]], None]] = None,
        cancel_event: Optional[threading.Event] = None,
    ):
        self.db = db
        self.task = task
        self.business_id = business_id
        self.event_cb = event_cb
        self.cancel_event = cancel_event
        self._lock = threading.Lock()
        self.agent_traces: List[AISpecialistTrace] = []
        self.tool_traces: List[AIToolTrace] = []

    def is_cancelled(self) -> bool:
        return bool(self.cancel_event and self.cancel_event.is_set())

    def add_agent(self, agent_name: str, summary: str, input_summary: str = "", confidence: float = 0.96, duration_ms: int = 4) -> None:
        meta = SPECIALIST_MAP.get(agent_name, {"agent_role": "AI Specialist"})
        trace_obj = AISpecialistTrace(
            agent_name=agent_name,
            agent_role=meta["agent_role"],
            status="COMPLETED",
            summary=summary,
            confidence=confidence,
            duration_ms=duration_ms,
        )
        with self._lock:
            row = AIAgentExecution(
                task_id=self.task.id,
                business_id=self.business_id,
                agent_name=agent_name,
                agent_role=meta["agent_role"],
                status="COMPLETED",
                input_summary=input_summary[:500],
                output_summary=summary[:1000],
                confidence=confidence,
                duration_ms=duration_ms,
            )
            self.db.add(row)
            self.agent_traces.append(trace_obj)
        if self.event_cb:
            try:
                self.event_cb("agent_step", trace_obj.model_dump())
            except Exception:
                pass

    def record_tool_result(
        self,
        agent_name: str,
        tool_name: str,
        label: str,
        status: str,
        ms: int,
        summary: str,
        args_preview: Optional[Dict[str, Any]] = None,
        is_mutating: bool = False,
    ) -> None:
        safe_args = sanitize_tool_args(args_preview)
        with self._lock:
            self.db.add(
                AIToolExecution(
                    task_id=self.task.id,
                    business_id=self.business_id,
                    agent_name=agent_name,
                    tool_name=tool_name,
                    is_mutating=is_mutating,
                    arguments_json=json.dumps(safe_args, default=str),
                    status=status,
                    result_summary=summary[:400],
                    duration_ms=ms,
                )
            )
            self.tool_traces.append(
                AIToolTrace(
                    tool_name=tool_name,
                    agent_name=agent_name,
                    label=label,
                    status=status,
                    is_mutating=is_mutating,
                    summary=summary[:180],
                    duration_ms=ms,
                )
            )

    def run_tool(
        self,
        agent_name: str,
        tool_name: str,
        label: str,
        role: str,
        fn,
        args_preview: Optional[Dict[str, Any]] = None,
        is_mutating: bool = False,
    ) -> Tuple[bool, Any]:
        t0 = time.perf_counter()
        if not is_tool_allowed(role, tool_name):
            ms = max(1, int((time.perf_counter() - t0) * 1000))
            self.record_tool_result(
                agent_name=agent_name,
                tool_name=tool_name,
                label=label,
                status="DENIED",
                ms=ms,
                summary=f"Role '{role}' denied",
                args_preview=args_preview,
                is_mutating=is_mutating,
            )
            return False, None

        try:
            res = fn()
            ms = max(1, int((time.perf_counter() - t0) * 1000))
            self.record_tool_result(
                agent_name=agent_name,
                tool_name=tool_name,
                label=label,
                status="COMPLETED",
                ms=ms,
                summary=f"Completed ({ms}ms)",
                args_preview=args_preview,
                is_mutating=is_mutating,
            )
            return True, res
        except Exception as exc:
            ms = max(1, int((time.perf_counter() - t0) * 1000))
            self.record_tool_result(
                agent_name=agent_name,
                tool_name=tool_name,
                label=label,
                status="ERROR",
                ms=ms,
                summary=str(exc),
                args_preview=args_preview,
                is_mutating=is_mutating,
            )
            return False, None


def _can_parallelize_db(db: Session) -> bool:
    """
    Returns True only when the underlying bind supports concurrent read-only
    worker sessions safely (e.g., Postgres or WAL-mode file SQLite).
    """
    if db.new or db.dirty or db.deleted:
        return False
    try:
        bind = db.get_bind()
        url = getattr(bind, "url", None)
        if not url:
            return False
        db_name = str(getattr(url, "database", "") or "")
        if db_name in ("", ":memory:"):
            return False
        if str(url.drivername).startswith("sqlite"):
            jm = db.execute(text("PRAGMA journal_mode")).scalar()
            return "wal" in str(jm or "").lower()
        return True
    except Exception:
        return False


def _run_parallel_stage1(
    db: Session,
    ctx: TenantContext,
    trace: _TraceRecorder,
    role: str,
    specs: List[Tuple[str, str, str, str, Callable[[Session, TenantContext], Any], Dict[str, Any]]],
    allow_parallel: bool,
) -> Dict[str, Tuple[bool, Any]]:
    """
    Executes independent read-only Stage-1 specialist tools concurrently when
    the DB engine supports concurrent WAL/MVCC reads, falling back sequentially
    on :memory: or non-WAL SQLite sessions.
    Each spec: (key, agent_name, tool_name, label, fn(db, ctx), args_preview).
    """
    results: Dict[str, Tuple[bool, Any]] = {}
    allowed_specs = []
    for key, ag, tl, lbl, fn, args in specs:
        if not is_tool_allowed(role, tl):
            results[key] = trace.run_tool(ag, tl, lbl, role, lambda: None, args_preview=args)
        else:
            allowed_specs.append((key, ag, tl, lbl, fn, args))

    if not allowed_specs:
        return results

    if not allow_parallel or len(allowed_specs) < 2:
        for key, ag, tl, lbl, fn, args in allowed_specs:
            if trace.is_cancelled():
                break
            results[key] = trace.run_tool(ag, tl, lbl, role, lambda f=fn: f(db, ctx), args_preview=args)
        return results

    bind = db.get_bind()
    SessionFactory = sessionmaker(bind=bind, autoflush=False, autocommit=False)
    uid = ctx.user.id
    bid = ctx.business.id
    mid = ctx.membership.id

    def _worker(spec_tuple):
        key, ag, tl, lbl, fn, args = spec_tuple
        t0 = time.perf_counter()
        if trace.is_cancelled():
            return key, ag, tl, lbl, args, False, None, 1, "Cancelled"
        with SessionFactory() as wdb:
            w_user = wdb.query(User).filter(User.id == uid).first()
            w_biz = wdb.query(Business).filter(Business.id == bid).first()
            w_mem = wdb.query(BusinessMembership).filter(BusinessMembership.id == mid).first()
            if not (w_user and w_biz and w_mem):
                ms = max(1, int((time.perf_counter() - t0) * 1000))
                return key, ag, tl, lbl, args, False, None, ms, "Context unavailable"
            wctx = TenantContext(user=w_user, business=w_biz, membership=w_mem)
            data = fn(wdb, wctx)
            ms = max(1, int((time.perf_counter() - t0) * 1000))
            return key, ag, tl, lbl, args, True, data, ms, f"Completed ({ms}ms)"

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(allowed_specs))) as pool:
        fut_to_spec = {pool.submit(_worker, sp): sp for sp in allowed_specs}
        for fut in concurrent.futures.as_completed(fut_to_spec):
            sp = fut_to_spec[fut]
            try:
                key, ag, tl, lbl, args, ok, data, ms, msg = fut.result()
                trace.record_tool_result(
                    agent_name=ag,
                    tool_name=tl,
                    label=lbl,
                    status="COMPLETED" if ok else "ERROR",
                    ms=ms,
                    summary=msg,
                    args_preview=args,
                    is_mutating=False,
                )
                results[key] = (ok, data)
            except Exception as exc:
                key, ag, tl, lbl, _fn, args = sp
                trace.record_tool_result(
                    agent_name=ag,
                    tool_name=tl,
                    label=lbl,
                    status="ERROR",
                    ms=1,
                    summary=str(exc),
                    args_preview=args,
                    is_mutating=False,
                )
                results[key] = (False, None)
    return results


def _select_best_supplier_and_cost(
    rec: Any,
    sup_data: Optional[Dict[str, Any]],
    default_sup_id: Optional[int],
    default_sup_name: str = "",
) -> Tuple[Optional[int], str, float]:
    """
    Combines SupplierIntelligenceAgent historical quote benchmarks with product master data:
    switches to a cheaper supplier quote ONLY when avg_unit_cost is strictly below rec.unit_cost.
    """
    best_sid = rec.supplier_id or default_sup_id
    best_sname = rec.supplier_name or default_sup_name or ""
    best_cost = float(rec.unit_cost)
    if sup_data:
        for comp in sup_data.get("product_price_comparisons", []):
            if int(comp.get("product_id", -1)) == int(rec.product_id):
                quotes = comp.get("quotes") or []
                if quotes:
                    top_q = quotes[0]
                    q_cost = float(top_q.get("avg_unit_cost", best_cost))
                    if q_cost > 0 and q_cost < best_cost:
                        best_sid = int(top_q["supplier_id"])
                        best_sname = str(top_q["supplier_name"])
                        best_cost = q_cost
                break
    return best_sid, best_sname, best_cost


def _load_recent_chat_history(db: Session, conv_id: int, before_msg_id: int, limit: int = 6) -> List[Dict[str, str]]:
    rows = (
        db.query(AIMessage)
        .filter(AIMessage.conversation_id == conv_id, AIMessage.id < before_msg_id)
        .order_by(desc(AIMessage.id))
        .limit(limit)
        .all()
    )
    rows.reverse()
    return [{"role": m.role, "content": (m.content or "")[:600]} for m in rows]


def _detect_conversational_intent(clean_query: str) -> Optional[str]:
    norm = re.sub(r"[^\w\s\u0C80-\u0CFF\u0900-\u097F]", " ", (clean_query or "").lower()).strip()
    tokens = [t for t in norm.split() if t]
    if not tokens:
        return "CONVERSATIONAL_GREETING"

    business_terms = {
        "profit", "profits", "sales", "sale", "sell", "selling", "sold", "revenue", "margin", "margins", "stock", "stocks",
        "inventory", "product", "products", "sku", "skus", "reorder", "supplier", "suppliers",
        "vendor", "vendors", "khata", "credit", "due", "dues", "receivable", "receivables",
        "customer", "customers", "invoice", "invoices", "bill", "bills", "gst", "gstr", "tax",
        "expense", "expenses", "opex", "order", "orders", "po", "purchase", "price", "prices",
        "cost", "costs", "forecast", "predict", "projection", "briefing", "alert", "alerts",
        "risk", "risks", "cash", "till", "drawer", "shift", "expiry", "expiring", "batch",
        "batches", "audit", "anomaly", "anomalies", "working", "capital", "simulate", "delay",
        "document", "csv", "xlsx", "remember", "memory", "workflow", "workflows", "automation",
        "automations", "approval", "approvals", "draft", "drafts", "rule", "rules", "report", "summary",
        "ಲಾಭ", "ನಷ್ಟ", "ಮಾರಾಟ", "ಮಾರಾಟವಾಗಿದೆ", "ಸೇಲ್", "ಸೇಲ್ಸ್", "ಪ್ರಾಡಕ್ಟ್", "ಸ್ಟಾಕ್", "ಖಾತಾ",
        "ಬಾಕಿ", "ಖರ್ಚು", "ಸರಬರಾಜು", "ಆರ್ಡರ್", "ಡ್ರಾಫ್ಟ್", "ಅನುಮೋದನೆ", "ಎಚ್ಚರಿಕೆ", "ವರದಿ", "ಆಟೋಮೇಷನ್", "ನಿಯಮ",
        "मुनाफा", "नुकसान", "बिक्री", "स्टॉक", "खर्चा", "उधार", "बकाया", "ऑर्डर", "सप्लायर", "मंजूरी",
        "labha", "laabha", "munafa", "nuksan", "kharchu", "kharcha", "udhar", "bakaya", "maal",
        "eshtu", "kitna", "hisab", "mangao", "khatam", "anumodane", "agide", "aagide",
    }
    if any(t in business_terms for t in tokens):
        return None

    help_phrases = {
        "help", "what can you do", "what do you do", "how can you help", "capabilities",
        "features", "what can you help with", "how to use", "options", "menu", "commands",
        "ನೀವು ಏನು ಮಾಡಬಲ್ಲಿರಿ", "ಏನೆಲ್ಲಾ ಮಾಡಬಹುದು", "ನೀವು ಏನು ಮಾಡುತ್ತೀರಿ", "ಸಹಾಯ", "आप क्या कर सकते हैं",
    }
    if norm in help_phrases or any(norm.startswith(p) for p in ("help me", "what can you", "how can you")):
        return "CONVERSATIONAL_HELP"

    ack_words = {
        "thanks", "thank", "thankyou", "thx", "ty", "tysm", "ok", "okay", "okey", "kk", "k",
        "cool", "great", "nice", "awesome", "perfect", "good", "got", "done", "alright", "fine",
        "bye", "goodbye", "cya", "yes", "yeah", "yep", "sure", "nope", "no",
        "dhanyavada", "dhanyavadagalu", "shukriya", "dhanyawad", "ಧನ್ಯವಾದ", "ಧನ್ಯವಾದಗಳು",
        "ಸರಿ", "ಹೌದು", "ಒಳ್ಳೆಯದು", "धन्यवाद", "शुक्रिया", "ठीक", "अच्छा", "हाँ", "जी",
    }
    if len(tokens) <= 5 and all(t in ack_words or t in {"you", "it", "hai", "see", "very", "much", "so"} for t in tokens):
        return "CONVERSATIONAL_ACK"

    greeting_exact = {
        "hi", "hello", "helo", "hey", "yo", "hola", "gm", "ga", "ge", "good morning",
        "good afternoon", "good evening", "good night", "namaskara", "namaste", "namaskar",
        "pranam", "how are you", "how are you doing", "how are you doing today", "how r u",
        "how do you do", "how have you been", "how s it going", "hows it going", "how are u",
        "whats up", "what s up", "wassup", "who are you", "what are you", "are you there",
        "hegidira", "hegiddira", "chennagide", "chennagidira", "kaise ho", "kaise hain",
        "kya haal", "kya haal hai", "test", "testing", "ಹಲೋ", "ಹಾಯ್", "ನಮಸ್ಕಾರ", "ನಮಸ್ತೆ",
        "ಶುಭೋದಯ", "ಹೇಗಿದ್ದೀರಾ", "ಹೇಗಿದ್ದೀಯಾ", "ಚೆನ್ನಾಗಿದ್ದೀರಾ", "ನೀವು ಹೇಗಿದ್ದೀರಾ", "ನೀವು ಯಾರು",
        "नमस्ते", "हैलो", "कैसे हो", "क्या हाल है",
    }
    is_elongated_hi = bool(re.match(r"^(hi+|he+y+|he+l+o+|ha+i+)$", tokens[0]))
    if (
        norm in greeting_exact
        or (len(tokens) <= 7 and norm.startswith(("how are you", "how r u", "how do you do", "how have you been")))
        or (len(tokens) <= 7 and (is_elongated_hi or tokens[0] in {"namaste", "namaskara", "namaskar", "pranam", "gm", "yo", "hola", "ನಮಸ್ಕಾರ", "ನಮಸ್ತೆ", "ಹಲೋ", "ಹಾಯ್", "ಶುಭೋದಯ", "नमस्ते", "हैलो"}))
    ):
        return "CONVERSATIONAL_GREETING"

    return None


def _is_general_gpt_question(clean_query: str, normalized_query: str) -> bool:
    """
    Detects non-database general ChatGPT queries (marketing advice, retail definitions,
    WhatsApp message drafting, pricing math, language checks, general AI questions) so we
    answer naturally without forcing store telemetry or fake DB lookups.
    """
    low = (clean_query or "").lower()
    norm_low = (normalized_query or "").lower()

    # General GPT advisory / copywriting / language / educational intents
    gpt_advisory_signals = [
        "how to get more customer", "how can i get more customer", "how do i get more customer",
        "how to increase customer", "how to attract", "attract more customer", "bring more customer",
        "tips to increase sales", "ways to increase sales", "grow my customer",
        "write a ", "draft a message", "whatsapp message", "whatsapp greeting", "festival offer", "diwali",
        "speak kannada", "know kannada", "understand kannada", "talk in kannada", "reply in kannada",
        "what is ai", "what is artificial intelligence", "artificial intelligence",
        "ಕನ್ನಡ ಬರುತ್ತಾ", "ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡ", "ಕನ್ನಡ ಅರ್ಥ", "ಗ್ರಾಹಕರನ್ನು ಹೆಚ್ಚಿಸ", "ಗ್ರಾಹಕರನ್ನು ಆಕರ್ಷಿಸ",
        "ವ್ಯಾಪಾರ ಬೆಳೆಸ", "ಮಾರಾಟ ಹೆಚ್ಚಿಸ", "ಸಂದೇಶ ಬರೆಯಿರಿ", "ಎಐ ಅಂದರೆ",
        "ग्राहक कैसे बढ़ा", "बिक्री कैसे बढ़ा", "व्हाट्सएप संदेश", "एआई क्या है",
    ]
    if any(g in low for g in gpt_advisory_signals) or any(
        g in norm_low for g in ["whatsapp message", "whatsapp greeting", "what is gross margin", "get more customer", "attract customer"]
    ):
        return True

    if re.search(r"\bai\b", low) and any(k in low for k in ["what is", "how can", "kirana", "small shop", "small store", "simply", "explain"]) and not any(
        s in low for s in ["my profit", "my sales", "today", "my stock", "in my store"]
    ):
        return True

    # Never swallow store-specific data queries or mutating commands
    store_data_signals = [
        "my profit", "this month", "last month", "previous month", "today", "this week",
        "why did profit", "why did my profit", "profit decrease", "profit drop",
        "low stock", "out of stock", "running out", "reorder", "prepare a purchase",
        "prepare purchase", "purchase draft", "draft po", "create po", "adjust stock",
        "update price", "record expense", "record khata", "pending khata", "khata due",
        "khata balance", "owe", "receivable", "cash drawer", "till", "expiring", "expiry risk",
        "batch", "gstr", "audit", "anomal", "working capital", "highest margin", "supplier",
        "vendor", "simulate", "what if", "forecast", "predict", "briefing", "alert",
        "approval", "workflow", "automation", "remember that", "saved rules", "uploaded",
        "my store", "my shop", "my business", "our store", "in my store", "for my store",
        "ನನ್ನ ಅಂಗಡಿ", "ನನ್ನ ವ್ಯಾಪಾರ", "ಈ ತಿಂಗಳ", "ಕಳೆದ ತಿಂಗಳು", "ಇಂದಿನ", "ಇಂದು", "ಕಡಿಮೆ ಸ್ಟಾಕ್",
        "ಖಾತಾ", "ಬಾಕಿ", "ಡ್ರಾಫ್ಟ್", "ಅನುಮೋದನೆ", "ಆಟೋಮೇಷನ್", "ಸರಬರಾಜುದಾರ", "ಎಚ್ಚರಿಕೆ", "ಬ್ಯಾಚ್",
        "मेरी दुकान", "इस महीने", "पिछले महीने", "आज", "कम स्टॉक", "खाता", "बकाया", "ड्राफ्ट",
    ]
    if any(s in low for s in store_data_signals) or any(
        s in norm_low
        for s in [
            "profit decrease", "working capital", "highest margin", "prepare purchase draft",
            "create purchase order", "low stock", "pending approvals", "workflow automation",
            "khata due balance", "daily briefing", "expiring batch", "what if", "forecast",
        ]
    ):
        is_conceptual = any(
            c in low
            for c in [
                "what is ", "meaning of", "explain ", "define ", "how to reduce ",
                "ಅಂದರೆ ಏನು", "ಎಂದರೆ ಏನು", "ವಿವರಿಸಿ", "ಕಡಿಮೆ ಮಾಡುವುದು ಹೇಗೆ", "क्या होता है", "कैसे कम",
            ]
        )
        if not is_conceptual:
            return False

    gpt_math_concept_signals = [
        "what is gross margin", "what is working capital", "what is fefo", "what is fifo",
        "what is gst", "composition scheme", "how to reduce expiry", "ಅಂದರೆ ಏನು", "ಎಂದರೆ ಏನು",
        "ತಗೊಂಡು", "ಮಾರಿದರೆ", "calculate ", "how many %", "% gst", "% margin",
    ]
    if any(g in low for g in gpt_math_concept_signals):
        return True

    # Pure arithmetic e.g. "120 * 15"
    if re.match(r"^(?:calculate|calc|what is|=)?\s*[\d\s.+\-*/()]+[\?]?$", low.strip()) and any(op in low for op in "+-*/"):
        return True

    return False


def _detect_compound_tasks(normalized_query: str, has_doc: bool, mode: str) -> List[str]:
    q = normalized_query.lower()
    q_no_velocity = re.sub(
        r"\bsales\s+velocity\b|\bselling\s+price\b|\bpurchase\s+price\b|\bwholesale\s+price\b|\bunit\s+price\b",
        " ",
        q,
    )
    has_sales_verb = bool(re.search(r"\b(?:sell|selling|sold|sales|sale)\b", q_no_velocity)) or any(
        w in q_no_velocity for w in ["ಸೇಲ್", "ಸೇಲ್ಸ್", "ಮಾರಾಟ", "ಬಿಕ್ರಿ", "बिक्री"]
    )
    tasks: List[str] = []

    if has_doc or any(k in q for k in ["uploaded document", "analyze document", "analyze invoice", "quotation file", "csv upload", "spreadsheet"]):
        tasks.append("document")

    if any(k in q for k in ["remember that", "save preference", "set preference", "my preferred supplier", "note down preference"]):
        tasks.append("save_memory")

    if any(k in q for k in ["adjust stock", "reduce stock", "increase stock", "stock correction"]):
        tasks.append("propose_stock")
    if any(k in q for k in ["update price", "change price", "set selling price", "reprice"]):
        tasks.append("propose_price")
    if any(k in q for k in ["record expense", "log expense", "add expense"]):
        tasks.append("propose_expense")
    if any(k in q for k in ["record khata payment", "collect khata", "khata payment", "clear balance"]):
        tasks.append("propose_khata")

    has_what_if = any(k in q for k in ["what if", "what happens if", "simulate", "elasticity", "delay", "demand surge", "raise price", "increase price by", "cut price by"])
    if has_what_if:
        tasks.append("what_if")

    has_profit_drop = (
        ("profit" in q and any(w in q for w in ["decrease", "drop", "fell", "down", "lower", "why", "less", "compare", "previous month", "last month", "mom"]))
        or any(w in q for w in ["why did profit", "profit decreased", "profit drop", "profit comparison"])
    )
    if has_profit_drop:
        tasks.append("profit_drop")

    has_working_cap = any(k in q for k in ["working capital", "highest margin", "top margin", "best margin", "dead stock", "slow moving", "slow-moving", "tied up", "ageing", "aging"])
    if has_working_cap:
        tasks.append("working_capital")

    has_top_seller_q = (
        any(k in q for k in [
            "sold the most", "most sold", "top selling", "best selling", "highest selling",
            "which product sold", "top seller", "most sale", "fastest selling",
            "jasti sale", "jaasti sale", "ಹೆಚ್ಚು ಮಾರಾಟ", "ಜಾಸ್ತಿ ಮಾರಾಟ", "ಯಾವ ಪ್ರಾಡಕ್ಟ್",
        ])
        or (
            has_sales_verb
            and any(w in q for w in ["which product", "most", "top", "best", "highest", "jasti", "jaasti", "hechhu", "hechu", "ಹೆಚ್ಚು", "ಜಾಸ್ತಿ"])
        )
    )
    has_period_sales_only = (
        has_sales_verb
        and not has_profit_drop
        and not has_working_cap
        and not has_what_if
        and not any(w in q for w in ["profit", "p&l", "expense", "opex", "income", "ebitda", "margin", "ಲಾಭ", "ನಷ್ಟ", "ಖರ್ಚು", "मुनाफा", "खर्चा"])
    )
    if has_top_seller_q or has_period_sales_only:
        tasks.append("sales_summary")

    if "sales_summary" not in tasks and not has_profit_drop and (
        any(k in q_no_velocity for k in ["profit", "p&l", "revenue", "sales", "expense", "opex", "income", "ebitda"])
        or ("margin" in q and not has_working_cap)
    ):
        tasks.append("financial_pnl")

    has_prepare_po = any(
        k in q
        for k in [
            "prepare a purchase", "prepare purchase", "purchase draft", "draft purchase",
            "draft po", "create po", "create purchase order", "prepare po", "order them",
            "reorder draft", "place order", "restock draft",
        ]
    )
    has_reorder = has_prepare_po or any(k in q for k in ["low stock", "out of stock", "reorder", "running out", "replenish", "shortage"])
    if has_reorder:
        tasks.append("replenishment_po")

    has_supplier = any(k in q for k in ["supplier", "vendor", "distributor", "cheaper", "better purchasing price", "compare price", "lead time"])
    if has_supplier and not (has_what_if and not any(w in q for w in ["compare", "cheaper", "better", "best", "quote", "scorecard", "supplier price"])):
        if not (has_prepare_po and not any(w in q for w in ["compare", "cheaper", "better", "best", "quote", "scorecard", "which supplier", "supplier price"])):
            tasks.append("supplier")

    if any(k in q for k in ["daily briefing", "morning briefing", "how was business today", "today's briefing", "proactive alert", "business alerts", "any risks", "store alerts"]):
        tasks.append("briefing")

    if any(k in q for k in ["forecast", "predict", "projection", "stockout prediction", "expected revenue", "run out in 7"]):
        tasks.append("forecast")

    if any(k in q for k in ["gstr", "gst ", "tax return"]):
        tasks.append("gstr1")

    if any(k in q for k in ["audit", "anomal", "suspicious", "cancelled"]):
        tasks.append("audit")

    if "propose_khata" not in tasks and any(
        k in q for k in ["khata", "credit", "receivable", "due", "owe", "pending balance", "customer list", "check customer", "show customer"]
    ):
        tasks.append("khata")

    if any(k in q for k in ["cash drawer", "till", "cash shift", "register"]):
        tasks.append("cash_till")

    if any(k in q for k in ["expir", "batch", "shelf life"]):
        tasks.append("expiry")

    if not any(t in tasks for t in ("replenishment_po", "working_capital", "expiry", "propose_stock", "sales_summary", "supplier")) and any(
        k in q for k in ["stock", "inventory", "product", "sku", "catalog", "price of", "how many"]
    ):
        tasks.append("inventory_lookup")

    return tasks


def _classify_intent(clean_query: str, normalized_query: str, prev_ctx: Dict[str, Any], has_doc: bool, mode: str) -> Tuple[str, List[str]]:
    conv_intent = _detect_conversational_intent(clean_query)
    if conv_intent:
        return conv_intent, []

    if _is_general_gpt_question(clean_query, normalized_query):
        return "GENERAL_GPT_CHAT", []

    q = normalized_query.lower()

    # Hidden Queue & Store Tools features surfaced naturally inside chat
    if any(k in q for k in ["workflow", "workflows", "automation", "automations", "automate ", "schedule daily", "run workflow"]):
        return "MANAGE_WORKFLOWS", []

    if any(k in q for k in ["saved memor", "view all saved memories", "saved rules", "show rules", "list rules", "my rules", "show memories"]):
        return "MANAGE_MEMORIES", []

    if not has_doc and any(k in q for k in ["uploaded document", "uploaded file", "list files", "show documents", "list documents"]):
        return "MANAGE_DOCUMENTS", []

    if any(
        k in q
        for k in [
            "pending approval", "show approval", "approval queue", "review draft", "pending draft",
            "show draft", "my drafts", "list approval",
        ]
    ) and not any(w in q for w in ["prepare a purchase", "create purchase", "prepare po", "draft po", "new draft"]):
        return "MANAGE_APPROVALS", []

    # Explicit memory-save rule ("Remember that ...") takes priority even if it mentions "stock" or "supplier"
    if any(k in q for k in ["remember that", "save preference", "set preference", "note down preference"]):
        return "SAVE_MEMORY", []

    # Multi-turn follow-up resolution on yesterday / comparison when conversation context already holds a subject
    if (
        prev_ctx.get("last_intent") in ("SALES_SUMMARY", "FINANCIAL_PNL", "INVENTORY_LOOKUP")
        or prev_ctx.get("last_product_id")
    ) and any(
        p in q
        for p in [
            "yesterday", "prior day", "previous day", "compare to yesterday",
            "compare with yesterday", "how does that compare", "ನಿನ್ನೆ", "ನಿನ್ನೆಯ",
            "कल से", "कल की",
        ]
    ) and "profit" not in q and "supplier" not in q:
        return "SALES_SUMMARY", ["sales_summary"]

    tasks = _detect_compound_tasks(normalized_query, has_doc, mode)

    if len(tasks) >= 2:
        return "MULTI_TASK_ORCHESTRATION", tasks

    if "save_memory" in tasks:
        return "SAVE_MEMORY", tasks
    if "document" in tasks:
        return "DOCUMENT_ANALYSIS", tasks
    if "propose_stock" in tasks:
        return "PROPOSE_STOCK_ADJUSTMENT", tasks
    if "propose_price" in tasks:
        return "PROPOSE_PRICE_UPDATE", tasks
    if "propose_expense" in tasks:
        return "PROPOSE_EXPENSE", tasks
    if "propose_khata" in tasks:
        return "PROPOSE_KHATA_PAYMENT", tasks
    if "what_if" in tasks:
        return "WHAT_IF_SIMULATION", tasks
    if "profit_drop" in tasks:
        return "PROFIT_DROP_INVESTIGATION", tasks
    if "working_capital" in tasks:
        return "WORKING_CAPITAL_AND_MARGIN", tasks
    if "supplier" in tasks:
        return "SUPPLIER_COMPARISON", tasks
    if "briefing" in tasks:
        return "DAILY_BRIEFING_ALERTS", tasks
    if "forecast" in tasks:
        return "DEMAND_FORECAST", tasks
    if "gstr1" in tasks:
        return "GSTR1_REPORT", tasks
    if "audit" in tasks:
        return "AUDIT_ANOMALIES", tasks
    if "sales_summary" in tasks:
        return "SALES_SUMMARY", tasks
    if "financial_pnl" in tasks:
        return "FINANCIAL_PNL", tasks
    if "replenishment_po" in tasks:
        wants_po = any(
            k in q
            for k in [
                "prepare a purchase", "prepare purchase", "purchase draft", "draft purchase",
                "draft po", "create po", "create purchase order", "prepare po", "order them",
                "reorder draft", "place order", "restock draft",
            ]
        )
        if wants_po or mode == "AGENT":
            return "AUTONOMOUS_REORDER_PO", tasks
        return "REORDER_RISK_ANALYSIS", tasks
    if "khata" in tasks:
        return "KHATA_RECEIVABLES", tasks
    if "cash_till" in tasks:
        return "CASH_TILL", tasks
    if "expiry" in tasks:
        return "EXPIRY_RISK", tasks
    if "inventory_lookup" in tasks:
        return "INVENTORY_LOOKUP", tasks

    # Deep broad-business inquiry trigger when user switches to Deep mode
    if mode == "DEEP_ANALYSIS" and any(
        w in q
        for w in [
            "business", "store", "shop", "deep", "overview", "insight", "health", "performance",
            "everything", "full analysis", "ಅಂಗಡಿ", "ವ್ಯಾಪಾರ", "ಸಂಪೂರ್ಣ", "विश्लेषण",
        ]
    ):
        return "MULTI_TASK_ORCHESTRATION", [
            "financial_pnl", "profit_drop", "working_capital", "replenishment_po", "forecast", "khata", "briefing"
        ]

    # Follow-up context resolution
    if prev_ctx.get("last_intent") and any(p in q for p in ["those", "them", "these", "it", "same", "more details", "break down", "drill down"]):
        last = prev_ctx["last_intent"]
        if any(w in q for w in ["order", "po", "buy", "restock"]):
            return "AUTONOMOUS_REORDER_PO", ["replenishment_po"]
        if any(w in q for w in ["supplier", "vendor"]):
            return "SUPPLIER_COMPARISON", ["supplier"]
        return last, []

    if any(w in q for w in ["business", "store", "shop", "status", "how is", "how's", "overview", "ಅಂಗಡಿ", "ವ್ಯಾಪಾರ", "दुकान"]):
        return "GENERAL_BUSINESS_ASSIST", []

    return "GENERAL_GPT_CHAT", []


def run_ai_ultra_turn(
    db: Session,
    ctx: TenantContext,
    *,
    message: str,
    conversation_id: Optional[int] = None,
    mode: str = "QUICK_ASSIST",
    language: str = "auto",
    document_id: Optional[int] = None,
    on_event: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    on_text_chunk: Optional[Callable[[str], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> AIChatResponse:
    started = time.perf_counter()
    clean_query = message.strip()
    lang_info = detect_language(clean_query, requested_language=language)
    eff_lang = lang_info.language
    normalized_q = normalize_multilingual_query(clean_query, detected_lang=eff_lang)
    role = ctx.membership.role.value
    bid = ctx.business.id
    is_deep = mode in ("DEEP_ANALYSIS", "AGENT")

    # Determine parallel DB capability before mutating this session
    allow_parallel_db = _can_parallelize_db(db)

    conv = _get_or_create_conversation(db, ctx, conversation_id, mode, eff_lang, clean_query)
    try:
        prev_ctx = json.loads(conv.context_summary or "{}")
    except Exception:
        prev_ctx = {}

    user_msg = AIMessage(
        conversation_id=conv.id,
        business_id=bid,
        user_id=ctx.user.id,
        role="user",
        content=clean_query,
        mode=mode,
        language=eff_lang,
        tokens_used=max(2, len(clean_query.split())),
    )
    db.add(user_msg)
    db.flush()

    history_msgs = _load_recent_chat_history(db, conv.id, user_msg.id, limit=6)

    task = AITask(
        business_id=bid,
        user_id=ctx.user.id,
        conversation_id=conv.id,
        message_id=user_msg.id,
        mode=mode,
        objective=clean_query,
        status="RUNNING",
    )
    db.add(task)
    db.flush()
    trace = _TraceRecorder(db, task, bid, event_cb=on_event, cancel_event=cancel_event)

    # 1. Security Inspection
    sec = inspect_prompt_security(clean_query)
    if not sec.allowed:
        task.intent = f"BLOCKED_{sec.reason_code}"
        task.status = "BLOCKED"
        task.completed_at = utc_now()
        task.duration_ms = max(1, int((time.perf_counter() - started) * 1000))
        payload = AIMessagePayload(
            kpis=[AIKpiMetric(label=_L(eff_lang, "Governance Check", "ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆ", "सुरक्षा जाँच"), value="BLOCKED", tone="critical")],
            assumptions=[_L(eff_lang, "Trust & Governance Guard strictly prohibits raw SQL, cross-tenant queries, and secret disclosure.", "ಕಚ್ಚಾ SQL, ಪಾಸ್‌ವರ್ಡ್ ಮಾಹಿತಿ ಅಥವಾ ಇತರ ಅಂಗಡಿಗಳ ಡೇಟಾ ಪ್ರವೇಶಕ್ಕೆ ಅನುಮತಿ ಇಲ್ಲ.", "सीधा SQL, पासवर्ड या अन्य स्टोर का डेटा प्रतिबंधित है।")],
            agents_involved=[],
            tool_traces=[],
        )
        blocked_text = localize_security_block(eff_lang, sec.reason_code, sec.explanation or "Request blocked by security guard.")
        asst_msg = AIMessage(
            conversation_id=conv.id,
            business_id=bid,
            role="assistant",
            content=blocked_text,
            mode=mode,
            language=eff_lang,
            intent=task.intent,
            confidence=1.0,
            response_payload_json=json.dumps(payload.model_dump(), default=str),
            tokens_used=28,
            latency_ms=task.duration_ms,
        )
        db.add(asst_msg)
        db.flush()
        record_turn_evaluation(
            db,
            business_id=bid,
            user_id=ctx.user.id,
            task_id=task.id,
            query=clean_query,
            mode=mode,
            intent=task.intent,
            passed=True,
            groundedness_score=1.0,
            latency_ms=task.duration_ms,
            tokens_used=28,
            details={"blocked_reason": sec.reason_code},
        )
        db.commit()
        return AIChatResponse(
            conversation_id=conv.id,
            user_message=message_to_out(user_msg, db),
            assistant_message=message_to_out(asst_msg, db),
            detected_language=eff_lang,
            task_id=task.id,
            status="BLOCKED",
        )

    # 2. Classify Intent & Apply Memory Context
    memories = _load_active_memories(db, bid)
    memory_summary = {m.memory_key: m.memory_value for m in memories}
    intent, compound_tasks = _classify_intent(clean_query, normalized_q, prev_ctx, bool(document_id), mode)
    task.intent = intent

    kpis: List[AIKpiMetric] = []
    charts: List[AIChartSpec] = []
    tables: List[AITableSpec] = []
    evidence: List[AIEvidenceItem] = []
    assumptions: List[str] = []
    recommendations: List[str] = []
    actions: List[AIActionShortcut] = []
    follow_ups: List[str] = []
    approval_ids: List[int] = []
    data_quality: Optional[str] = "VERIFIED_LIVE_DB"
    verified_dict: Dict[str, Any] = {"active_memories": memory_summary}
    reply_md = ""
    new_ctx = dict(prev_ctx)
    new_ctx["last_intent"] = intent

    owner_first = (ctx.user.full_name or "").strip().split(" ")[0] or ("ಗೆಳೆಯ" if eff_lang == "kn" else "there")

    # --- EXECUTION HANDLERS BY INTENT ---

    if intent == "CONVERSATIONAL_GREETING":
        q_low = clean_query.lower()
        is_how_are_you = any(
            p in q_low
            for p in (
                "how are you", "how r u", "how are u", "how do you do",
                "how have you been", "how s it going", "hows it going",
                "hegidira", "hegiddira", "ಹೇಗಿದ್ದೀರಾ", "ಹೇಗಿದ್ದೀಯಾ", "ಚೆನ್ನಾಗಿದ್ದೀರಾ",
                "kaise ho", "kaise hain", "kya haal", "कैसे हो", "क्या हाल",
            )
        )
        if is_how_are_you:
            if eff_lang == "kn":
                reply_md = f"ಚೆನ್ನಾಗಿದ್ದೇನೆ {owner_first}! ಕೇಳಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. **{ctx.business.name}** ಬಗ್ಗೆ ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?"
                follow_ups = ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "ಇವತ್ತು ನನ್ನ ಅಂಗಡಿಯಲ್ಲಿ ಎಷ್ಟು ಸೇಲ್ ಆಗಿದೆ?"]
            elif eff_lang == "hi":
                reply_md = f"बिल्कुल बढ़िया हूँ {owner_first}, पूछने के लिए धन्यवाद! आज **{ctx.business.name}** में मैं आपकी क्या मदद करूँ?"
                follow_ups = ["इस महीने का मुनाफा बताओ", "कम स्टॉक चेक करके PO ड्राफ्ट बनाओ"]
            else:
                reply_md = f"Doing great, {owner_first} — thanks for asking! How can I help with **{ctx.business.name}** today?"
                follow_ups = ["How much profit did I make this month?", "Which product sold the most today?"]
        elif eff_lang == "kn":
            reply_md = f"ನಮಸ್ಕಾರ {owner_first}! 👋 **{ctx.business.name}** ಬಗ್ಗೆ ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ? ಲಾಭ, ಸ್ಟಾಕ್, ಖಾತಾ ಬಾಕಿ ಅಥವಾ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ — ಏನೇ ಇದ್ದರೂ ಕೇಳಿ."
            follow_ups = ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ"]
        elif eff_lang == "hi":
            reply_md = f"नमस्ते {owner_first}! 👋 **{ctx.business.name}** के लिए आज मैं आपकी क्या मदद कर सकता हूँ? मुनाफा, स्टॉक, खाता बकाया या ऑर्डर ड्राफ्ट के बारे में कुछ भी पूछें।"
            follow_ups = ["इस महीने का मुनाफा बताओ", "कम स्टॉक चेक करके PO ड्राफ्ट बनाओ"]
        else:
            reply_md = f"Hey {owner_first}! 👋 How can I help you with **{ctx.business.name}** today?"
            follow_ups = ["How much profit did I make this month?", "Check low stock & prepare a PO draft"]

    elif intent == "CONVERSATIONAL_ACK":
        reply_md = _L(
            eff_lang,
            "You're welcome! Let me know anytime you need anything else for your shop.",
            "ಧನ್ಯವಾದಗಳು! ವ್ಯಾಪಾರದ ಬಗ್ಗೆ ಬೇರೆ ಏನಾದರೂ ಕೇಳಬೇಕಿದ್ದರೆ ಯಾವಾಗ ಬೇಕಾದರೂ ಕೇಳಿ.",
            "आपका स्वागत है! जब भी दुकान से जुड़ा कुछ पूछना हो, ज़रूर बताइए।",
        )
        follow_ups = [
            _L(eff_lang, "Today's sales & profit", "ಇಂದಿನ ಮಾರಾಟ ಮತ್ತು ಲಾಭ ಎಷ್ಟು?", "आज की बिक्री और मुनाफा"),
            _L(eff_lang, "Any low stock items?", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ವಸ್ತುಗಳಿವೆಯೇ?", "कम स्टॉक वाले सामान"),
        ]

    elif intent == "CONVERSATIONAL_HELP":
        if eff_lang == "kn":
            reply_md = (
                f"ನಾನು **{ctx.business.name}** ಅಂಗಡಿಯ ನಿಮ್ಮ ಸ್ಮಾರ್ಟ್ AI ಸಹಾಯಕ.\n\n"
                "- **ಸಾಮಾನ್ಯ ChatGPT ಸಹಾಯ:** ವ್ಯಾಪಾರ ಸಲಹೆ, ಲಾಭದ ಲೆಕ್ಕಾಚಾರ, ಗ್ರಾಹಕರಿಗೆ ವಾಟ್ಸಾಪ್ ಸಂದೇಶ ಬರೆಯುವುದು.\n"
                "- **ಲೈವ್ ಅಂಗಡಿ ಡೇಟಾ (Normal / Deep):** ತಿಂಗಳ ಲಾಭ, ಲಾಭ ಇಳಿಕೆ ಕಾರಣ, ಕಡಿಮೆ ಸ್ಟಾಕ್, ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ, ಸರಬರಾಜುದಾರರ ಬೆಲೆ ಹೋಲಿಕೆ.\n"
                "- **ಕಾರ್ಯಗಳ ನಿರ್ವಹಣೆ:** ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್, ಅನುಮೋದನೆಗಳು, ಅಲರ್ಟ್‌ಗಳು, ಬಿಲ್ ಫೈಲ್ ಅಪ್‌ಲೋಡ್ ಮತ್ತು ಆಟೋಮೇಷನ್ ನಿಯಮಗಳು."
            )
            follow_ups = ["ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ"]
        elif eff_lang == "hi":
            reply_md = (
                f"मैं **{ctx.business.name}** के लिए आपका स्मार्ट AI सहायक हूँ।\n\n"
                "- **मुनाफा और बिक्री:** आज/महीने का मुनाफा, खर्चा और कम मार्जिन कारण समझें।\n"
                "- **स्टॉक और ऑर्डर (PO):** कम स्टॉक देखकर Purchase Order ड्राफ्ट बनवाएँ।\n"
                "- **खाता, सप्लायर और ऑटोमेशन:** उधार बकाया, सप्लायर रेट तुलना और रोज़मर्रा की रिपोर्ट देखें।"
            )
            follow_ups = ["इस महीने का मुनाफा बताओ", "कम स्टॉक चेक करके PO ड्राफ्ट बनाओ"]
        else:
            reply_md = (
                f"I'm your **SmartStock AI** assistant for **{ctx.business.name}**. You can chat normally in English, ಕನ್ನಡ, or हिन्दी:\n\n"
                "- **Quick or Deep Store Answers:** Ask about profit, sales, low stock, Khata dues, supplier quotes, forecasts, or alerts.\n"
                "- **Actions & Approvals:** Ask me to prepare PO drafts, adjust stock, inspect pending approvals, upload invoices/CSVs, or automate daily checks.\n"
                "- **Everyday Help:** Ask for pricing math, customer growth tips, or WhatsApp offer messages.\n\n"
                "Use **Normal** in the search bar for quick direct answers, or **Deep** for in-depth charts, tables, and multi-agent store analysis."
            )
            follow_ups = ["How much profit did I make this month?", "Show pending approvals & today's briefing"]

    elif intent == "GENERAL_GPT_CHAT":
        reply_md, follow_ups = build_general_gpt_reply(
            query=clean_query,
            normalized_query=normalized_q,
            lang=eff_lang,
            mode=mode,
            shop_name=ctx.business.name,
            owner_name=owner_first,
        )

    elif intent == "MANAGE_APPROVALS":
        q_ap = db.query(AIApproval).filter(AIApproval.business_id == bid).order_by(desc(AIApproval.created_at))
        pending_rows = [r for r in q_ap.limit(20).all() if r.status == "PENDING"]
        display_rows = pending_rows[:6] if pending_rows else q_ap.limit(3).all()
        approval_ids = [r.id for r in display_rows]
        verified_dict["pending_approvals_count"] = len(pending_rows)
        verified_dict["approvals"] = [approval_to_out(r).model_dump() for r in display_rows]
        trace.add_agent("ReportingAgent", f"Loaded {len(pending_rows)} pending approval draft(s) inline for review.")

        brief_note = ""
        if any(w in normalized_q.lower() for w in ["briefing", "alert", "summary", "ವರದಿ", "ಎಚ್ಚರಿಕೆ", "रिपोर्ट"]):
            ok_b, brief = trace.run_tool("ReportingAgent", "daily_briefing", "Check Alerts & Briefing", role, lambda: build_daily_briefing(db, ctx))
            if ok_b and brief:
                verified_dict["briefing"] = brief.model_dump()
                if eff_lang == "kn":
                    brief_note = (
                        f"\n\n**ಇಂದಿನ ವ್ಯಾಪಾರ ಮತ್ತು ಎಚ್ಚರಿಕೆ ಸಾರಾಂಶ ({len(brief.top_risks)} ಸಕ್ರಿಯ):** "
                        f"ಇಂದಿನ ಮಾರಾಟ **{brief.kpis[0].value if brief.kpis else '₹0.00'}** · "
                        f"ಈ ತಿಂಗಳ ಲಾಭ **{brief.kpis[1].value if len(brief.kpis) > 1 else '₹0.00'}**"
                    )
                    if brief.top_risks:
                        brief_note += "\n" + "\n".join(f"- **{translate_text(a.title, 'kn')}**" for a in brief.top_risks[:3])
                else:
                    brief_note = (
                        f"\n\n**Today's Store Pulse ({len(brief.top_risks)} active alert(s)):** "
                        f"Today's sales **{brief.kpis[0].value if brief.kpis else '₹0.00'}**, "
                        f"MTD profit **{brief.kpis[1].value if len(brief.kpis) > 1 else '₹0.00'}**."
                    )
                    if brief.top_risks:
                        brief_note += "\n" + "\n".join(f"- **{a.title}** ({a.severity})" for a in brief.top_risks[:3])

        if pending_rows:
            reply_md = _L(
                eff_lang,
                f"You have **{len(pending_rows)} pending approval draft(s)** waiting for review below. Click **Approve & Execute** to apply changes or **Reject** to cancel:{brief_note}",
                f"ಪರಿಶೀಲನೆಗೆ **{len(pending_rows)} ಬಾಕಿ ಇರುವ ಅನುಮೋದನೆ ಡ್ರಾಫ್ಟ್(ಗಳು)** ಇವೆ. ಕೆಳಗಿನ ಕಾರ್ಡ್‌ನಲ್ಲಿ **ಅನುಮೋದಿಸಿ ಮತ್ತು ಕಾರ್ಯಗತಗೊಳಿಸಿ** ಅಥವಾ **ತಿರಸ್ಕರಿಸಿ** ಒತ್ತಿ:{brief_note}",
                f"नीचे **{len(pending_rows)} बकाया मंज़ूरी ड्राफ्ट** समीक्षा के लिए तैयार हैं। बदलाव लागू करने के लिए **मंज़ूर करें** दबाएँ:{brief_note}",
            )
        elif display_rows:
            reply_md = _L(
                eff_lang,
                f"All drafts have been reviewed — zero pending approvals right now. Here are your most recent completed/rejected drafts:{brief_note}",
                f"ಸದ್ಯ ಯಾವುದೇ ಅನುಮೋದನೆ ಬಾಕಿ ಇಲ್ಲ. ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಡ್ರಾಫ್ಟ್ ದಾಖಲೆಗಳು ಕೆಳಗಿವೆ:{brief_note}",
                f"अभी कोई ड्राफ्ट लंबित नहीं है। आपके हालिया ड्राफ्ट नीचे हैं:{brief_note}",
            )
        else:
            reply_md = _L(
                eff_lang,
                f"No approval drafts exist yet. Ask me to prepare a Purchase Order draft, stock adjustment, or expense entry anytime.{brief_note}",
                f"ಇನ್ನೂ ಯಾವುದೇ ಅನುಮೋದನೆ ಡ್ರಾಫ್ಟ್‌ಗಳಿಲ್ಲ. ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ ಅಥವಾ ಸ್ಟಾಕ್ ತಿದ್ದುಪಡಿ ಕೇಳಿದಾಗ ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.{brief_note}",
                f"अभी कोई मंज़ूरी ड्राफ्ट नहीं है। जब आप Purchase Order ड्राफ्ट या स्टॉक सुधार कहेंगे तो वह यहाँ दिखेगा।{brief_note}",
            )
            actions = [AIActionShortcut(label=_L(eff_lang, "Prepare Low-Stock PO Draft", "ಕಡಿಮೆ ಸ್ಟಾಕ್ PO ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "कम स्टॉक PO ड्राफ्ट बनाएँ"), prompt="Prepare a purchase draft for low stock products")]
        follow_ups = [
            _L(eff_lang, "Check low stock & prepare PO draft", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ PO ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "कम स्टॉक चेक करके PO ड्राफ्ट बनाओ"),
            _L(eff_lang, "Show today's store alerts & briefing", "ಇಂದಿನ ಎಚ್ಚರಿಕೆ ಮತ್ತು ವರದಿ ತೋರಿಸಿ", "आज की रिपोर्ट और अलर्ट दिखाओ"),
        ]

    elif intent == "MANAGE_MEMORIES":
        trace.add_agent("ReportingAgent", f"Loaded {len(memories)} saved workspace rule(s).")
        if memories:
            lines = "\n".join(f"- **{m.memory_key}** (`{m.category}`): {m.memory_value}" for m in memories[:15])
            reply_md = _L(
                eff_lang,
                f"Here are your **{len(memories)}** saved store rules for **{ctx.business.name}**:\n\n{lines}\n\nTo add a new rule, just say *\"Remember that ...\"*.",
                f"**{ctx.business.name}** ಅಂಗಡಿಯಲ್ಲಿ ಉಳಿಸಲಾದ **{len(memories)}** ನಿಯಮಗಳು:\n\n{lines}\n\nಹೊಸ ನಿಯಮ ಸೇರಿಸಲು *\"ಇದನ್ನು ನೆನಪಿಟ್ಟುಕೊ...\"* ಎಂದು ಬರೆಯಿರಿ.",
                f"**{ctx.business.name}** के लिए सेव किए गए **{len(memories)}** नियम:\n\n{lines}",
            )
        else:
            reply_md = _L(
                eff_lang,
                "No store preferences saved yet. Tell me something like *\"Remember that I keep 7 days extra stock for dairy\"*.",
                "ಇನ್ನೂ ಯಾವುದೇ ಅಂಗಡಿ ನಿಯಮಗಳನ್ನು ಉಳಿಸಲಾಗಿಲ್ಲ. ಉದಾಹರಣೆಗೆ *\"ಹಾಲಿನ ಉತ್ಪನ್ನಗಳಿಗೆ 7 ದಿನಗಳ ಹೆಚ್ಚುವರಿ ಸ್ಟಾಕ್ ಇಡಬೇಕು ಎಂದು ನೆನಪಿಟ್ಟುಕೊ\"* ಎಂದು ಹೇಳಿ.",
                "अभी कोई स्टोर नियम सेव नहीं है। आप *\"याद रखो कि दूध का 7 दिन का अतिरिक्त स्टॉक रखना है\"* लिख सकते हैं।",
            )

    elif intent == "MANAGE_DOCUMENTS":
        docs = db.query(AIDocument).filter(AIDocument.business_id == bid).order_by(desc(AIDocument.created_at)).limit(10).all()
        trace.add_agent("DocumentIntelligenceAgent", f"Listed {len(docs)} uploaded document(s).")
        if docs:
            doc_lines = "\n".join(
                f"- `{d.filename}` ({d.document_type}) · {json.loads(d.extracted_json or '{}').get('items_count', 0)} items"
                for d in docs
            )
            reply_md = _L(
                eff_lang,
                f"Here are your **{len(docs)}** recently uploaded store files:\n\n{doc_lines}\n\nSay *\"Analyze uploaded document\"* or attach a new file with **+** below.",
                f"ಇತ್ತೀಚೆಗೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾದ **{len(docs)}** ಫೈಲ್‌ಗಳು:\n\n{doc_lines}\n\nಹೊಸ ಬಿಲ್ ಅಥವಾ CSV/XLSX ಸೇರಿಸಲು ಕೆಳಗಿನ **+** ಬಟನ್ ಒತ್ತಿ.",
                f"हाल ही में अपलोड की गई **{len(docs)}** फ़ाइलें:\n\n{doc_lines}",
            )
        else:
            reply_md = _L(
                eff_lang,
                "No documents uploaded yet. Click the **+** button in the search bar to attach a supplier bill, quote, CSV, XLSX, or photo.",
                "ಇನ್ನೂ ಯಾವುದೇ ಬಿಲ್ ಅಥವಾ ಫೈಲ್ ಅಪ್‌ಲೋಡ್ ಆಗಿಲ್ಲ. ಸರ್ಚ್ ಬಾರ್‌ನಲ್ಲಿರುವ **+** ಬಟನ್ ಒತ್ತಿ ಫೈಲ್ ಸೇರಿಸಿ.",
                "अभी कोई फ़ाइल अपलोड नहीं हुई है। सर्च बार में **+** बटन दबाकर बिल या CSV अपलोड करें।",
            )

    elif intent == "MANAGE_WORKFLOWS":
        wfs = db.query(AIWorkflow).filter(AIWorkflow.business_id == bid).order_by(desc(AIWorkflow.created_at)).all()
        low_q = clean_query.lower()
        wants_create = any(
            k in low_q
            for k in [
                "create ", "automate ", "every morning", "every day", "every week",
                "schedule ", "ಪ್ರತಿದಿನ", "ರಚಿಸಿ", "ಸೇರಿಸಿ", "ಆಟೋಮೇಷನ್ ಮಾಡಿ", "हर सुबह", "बनाओ",
            ]
        ) and not any(k in low_q for k in ["show", "list", "view", "ತೋರಿಸಿ", "ಪಟ್ಟಿ", "दिखाओ"])
        wants_run = any(k in low_q for k in ["run ", "execute ", "trigger ", "ನಡೆಸಿ", "चलाओ"]) and wfs
        if wants_create:
            if not is_tool_allowed(role, "ENABLE_WORKFLOW") and role != "MANAGER":
                trace.run_tool("ReportingAgent", "ENABLE_WORKFLOW", "Create Automation Workflow", role, lambda: None, is_mutating=True)
                verified_dict["rbac_restricted"] = True
                reply_md = localize_restriction_notice(eff_lang, role, "Creating Automation Workflows")
            else:
                rule_txt = re.sub(r"(?i)^(please\s+)?(create|add|setup|set up|make)\s+(an?\s+)?(automation|workflow)\s*[:,-]?\s*", "", clean_query).strip() or clean_query
                name_txt = rule_txt[:56]
                wf = create_ai_workflow(db, ctx, name=name_txt, natural_language_rule=rule_txt, trigger_type="SCHEDULED", requires_approval=True)
                trace.add_agent("ReportingAgent", f"Created workflow '{wf.name}'.")
                reply_md = _L(
                    eff_lang,
                    f"Automation saved: **{wf.name}**\n- Rule: *{wf.natural_language_rule}*\n- Safety: Asks for your approval before executing any changes.\n\nSay *\"Run workflow\"* anytime to trigger it immediately.",
                    f"ಹೊಸ ಆಟೋಮೇಷನ್ ಉಳಿಸಲಾಗಿದೆ: **{wf.name}**\n- ನಿಯಮ: *{wf.natural_language_rule}*\n- ಸುರಕ್ಷತೆ: ಯಾವುದೇ ಬದಲಾವಣೆ ಮಾಡುವ ಮೊದಲು ನಿಮ್ಮ ಅನುಮೋದನೆ ಕೇಳುತ್ತದೆ.",
                    f"नया ऑटोमेशन सेव हो गया: **{wf.name}**\n- नियम: *{wf.natural_language_rule}*",
                )
        elif wants_run:
            target_wf = next((w for w in wfs if w.is_active), wfs[0])
            res_w = execute_workflow(db, ctx, target_wf)
            trace.add_agent("ReportingAgent", f"Executed workflow '{target_wf.name}': {res_w['summary']}")
            if res_w.get("created_approval_ids"):
                approval_ids.extend(res_w["created_approval_ids"])
            reply_md = _L(
                eff_lang,
                f"Ran automation **{target_wf.name}**: {res_w['summary']}",
                f"**{target_wf.name}** ಆಟೋಮೇಷನ್ ಪೂರ್ಣಗೊಂಡಿದೆ: {translate_text(res_w['summary'], 'kn')}",
                f"ऑटोमेशन **{target_wf.name}** चलाया गया: {translate_text(res_w['summary'], 'hi')}",
            )
        else:
            trace.add_agent("ReportingAgent", f"Listed {len(wfs)} workflow automation(s).")
            if wfs:
                wf_lines = "\n".join(
                    f"- **{w.name}** ({'ACTIVE' if w.is_active else 'PAUSED'}, runs: {w.run_count}): *{w.natural_language_rule}*"
                    for w in wfs[:10]
                )
                reply_md = _L(
                    eff_lang,
                    f"Active & saved automations for **{ctx.business.name}**:\n\n{wf_lines}\n\nYou can say *\"Run workflow\"* or *\"Automate checking low stock every morning\"*.",
                    f"**{ctx.business.name}** ಅಂಗಡಿಯ ಆಟೋಮೇಷನ್ ನಿಯಮಗಳು:\n\n{wf_lines}\n\nನೀವು *\"Run workflow\"* ಅಥವಾ *\"ಪ್ರತಿದಿನ ಬೆಳಿಗ್ಗೆ ಕಡಿಮೆ ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಲು ಆಟೋಮೇಷನ್ ಮಾಡಿ\"* ಎಂದು ಹೇಳಬಹುದು.",
                    f"**{ctx.business.name}** के ऑटोमेशन नियम:\n\n{wf_lines}",
                )
            else:
                reply_md = _L(
                    eff_lang,
                    "No scheduled automations yet. Just tell me in plain language — for example: *\"Automate checking low stock every morning and prepare a PO draft\"*.",
                    "ಇನ್ನೂ ಯಾವುದೇ ಆಟೋಮೇಷನ್ ಇಲ್ಲ. ಉದಾಹರಣೆಗೆ: *\"ಪ್ರತಿದಿನ ಬೆಳಿಗ್ಗೆ ಕಡಿಮೆ ಸ್ಟಾಕ್ ಪರಿಶೀಲಿಸಿ PO ಡ್ರಾಫ್ಟ್ ಮಾಡಲು ಆಟೋಮೇಷನ್ ಮಾಡಿ\"* ಎಂದು ಹೇಳಿ.",
                    "अभी कोई ऑटोमेशन नहीं है। आप सीधे लिख सकते हैं: *\"हर सुबह कम स्टॉक चेक करके PO ड्राफ्ट बनाने का ऑटोमेशन बनाओ\"*।",
                )

    elif intent == "SAVE_MEMORY":
        cleaned_val = re.sub(
            r"(?i)^(please\s+)?(remember\s+that|save\s+preference\s*:?|set\s+preference\s*:?|ಇದನ್ನು\s*ನೆನಪಿಟ್ಟುಕೊ|ನೆನಪಿಟ್ಟುಕೊ|याद\s*रखो)\s*",
            "",
            clean_query,
        ).strip()
        if contains_secret_pattern(cleaned_val):
            reply_md = _L(
                eff_lang,
                "Refused: SmartStock AI Memory never stores passwords, tokens, or API keys.",
                "ತಿರಸ್ಕರಿಸಲಾಗಿದೆ: ಸ್ಮಾರ್ಟ್‌ಸ್ಟಾಕ್ AI ಮೆಮೊರಿಯಲ್ಲಿ ಪಾಸ್‌ವರ್ಡ್, ಟೋಕನ್ ಅಥವಾ API ಕೀಗಳನ್ನು ಎಂದಿಗೂ ಉಳಿಸುವುದಿಲ್ಲ.",
                "अस्वीकृत: SmartStock AI मेमोरी में पासवर्ड या API कुंजी कभी सेव नहीं की जाती।",
            )
            data_quality = "GOVERNANCE_BLOCK"
        elif not cleaned_val:
            reply_md = _L(
                eff_lang,
                "Tell me what rule you want me to remember (for example: *Remember that I prefer 14 days safety stock for dairy*).",
                "ನಾನು ಯಾವ ನಿಯಮವನ್ನು ನೆನಪಿಟ್ಟುಕೊಳ್ಳಬೇಕು ಎಂದು ತಿಳಿಸಿ (ಉದಾ: *ಹಾಲಿನ ಸರಕುಗಳಿಗೆ 14 ದಿನಗಳ ಸ್ಟಾಕ್ ಇಡಿ ಎಂದು ನೆನಪಿಟ್ಟುಕೊ*).",
                "कृपया वह नियम लिखें जो आप याद रखना चाहते हैं।",
            )
        else:
            mkey = f"rule_{utc_now().strftime('%Y%m%d%H%M%S')}"
            mem = AIMemory(
                business_id=bid,
                user_id=ctx.user.id,
                memory_key=mkey,
                memory_value=redact_secrets(cleaned_val),
                category="SUPPLIER" if "supplier" in normalized_q.lower() else ("INVENTORY_RULE" if "stock" in normalized_q.lower() else "PREFERENCE"),
                source="USER_EXPLICIT",
            )
            db.add(mem)
            db.flush()
            trace.add_agent("ReportingAgent", "Saved explicit business preference to tenant memory.")
            reply_md = _L(
                eff_lang,
                f"Got it — saved to **{ctx.business.name}** rules:\n\n> *{mem.memory_value}*\n\nI'll apply this automatically going forward.",
                f"ಸರಿ! **{ctx.business.name}** ನಿಯಮಗಳಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ:\n\n> *{mem.memory_value}*\n\nಮುಂದೆ ಎಲ್ಲಾ ಸಲಹೆಗಳಲ್ಲಿ ಇದನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಬಳಸುತ್ತೇನೆ.",
                f"ठीक है! **{ctx.business.name}** के नियमों में सेव किया गया:\n\n> *{mem.memory_value}*",
            )
            follow_ups = [_L(eff_lang, "Show all saved rules", "ಉಳಿಸಿದ ಎಲ್ಲಾ ನಿಯಮಗಳನ್ನು ತೋರಿಸಿ", "सभी सेव नियम दिखाओ")]

    elif intent == "SALES_SUMMARY":
        clean_q_low = clean_query.lower()
        norm_q_low = normalized_q.lower()
        is_compare = any(
            k in norm_q_low
            for k in ["yesterday", "compare", "prior day", "previous day", "ನಿನ್ನೆ", "ನಿನ್ನೆಯ", "कल से", "कल की"]
        )
        explicit_today = any(
            w in clean_q_low
            for w in ["today", "ivattu", "evattu", "ivattina", "ಇಂದು", "ಇವತ್ತು", "ಇವತ್ತಿನ", "ಇಂದಿನ", "aaj", "आज"]
        )
        explicit_week = ("week" in norm_q_low or "ವಾರ" in clean_q_low) and "next week" not in norm_q_low
        if is_compare or explicit_today:
            period = "today"
        elif "yesterday" in norm_q_low or "ನಿನ್ನೆ" in clean_q_low:
            period = "yesterday"
        elif explicit_week:
            period = "week"
        else:
            period = "month"

        explicit_prod = _match_product_from_text(db, bid, clean_query)
        target_pid = explicit_prod.id if explicit_prod else (prev_ctx.get("last_product_id") if is_compare else None)

        ok_s, ss = trace.run_tool(
            "SalesIntelligenceAgent",
            "sales_summary",
            "Sales & Top-Seller Analytics",
            role,
            lambda: tool_sales_summary(db, ctx, period=period, product_id=target_pid),
            args_preview={"period": period, "product_id": target_pid},
        )
        if not ok_s:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "POS Sales & Top-Seller Analytics", "ಮಾರಾಟ ಮತ್ತು ಅಗ್ರ ಉತ್ಪನ್ನಗಳ ವಿಶ್ಲೇಷಣೆ", "बिक्री और टॉप प्रोडक्ट रिपोर्ट"))
        else:
            verified_dict["sales_summary"] = ss
            t_info = ss["today"]
            y_info = ss["yesterday"]
            sel_info = ss["selected_period"]
            top_today = ss["today_top_by_qty"]
            top_overall = ss["overall_top_by_qty"]
            pc = ss.get("product_comparison")

            has_top_seller_q = any(
                k in norm_q_low
                for k in [
                    "sold the most", "most sold", "top selling", "best selling", "highest selling",
                    "which product", "top seller", "most sale", "fastest selling", "ಜಾಸ್ತಿ", "ಹೆಚ್ಚು", "ಯಾವ ಪ್ರಾಡಕ್ಟ್",
                ]
            ) or any(w in clean_q_low for w in ["which product", "most", "top", "best", "jasti", "jaasti", "hechhu", "hechu", "ಯಾವ", "ಹೆಚ್ಚು", "ಜಾಸ್ತಿ"])

            if pc:
                new_ctx["last_product_id"] = pc["product_id"]
                new_ctx["last_product_name"] = pc["product_name"]
            elif top_today:
                new_ctx["last_product_id"] = top_today[0]["product_id"]
                new_ctx["last_product_name"] = top_today[0]["product_name"]
            elif top_overall:
                new_ctx["last_product_id"] = top_overall[0]["product_id"]
                new_ctx["last_product_name"] = top_overall[0]["product_name"]

            trace.add_agent(
                "SalesIntelligenceAgent",
                f"Analyzed POS sales for period '{period}' ({sel_info['invoices_count']} bills, ₹{sel_info['net_sales']:,.2f}).",
            )

            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, f"Sales ({period})", f"ಮಾರಾಟ ({period})", f"बिक्री ({period})"), value=f"₹{sel_info['net_sales']:,.2f}", delta=f"{sel_info['invoices_count']} bills", tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Today Sales", "ಇಂದಿನ ಮಾರಾಟ", "आज की बिक्री"), value=f"₹{t_info['net_sales']:,.2f}", delta=f"vs ₹{y_info['net_sales']:,.0f} yest", tone="positive" if ss["today_vs_yesterday_sales_delta"] >= 0 else "warning"),
                    AIKpiMetric(label=_L(eff_lang, "Gross Profit", "ಒಟ್ಟು ಲಾಭ", "ग्रॉस मुनाफा"), value=f"₹{sel_info['gross_profit']:,.2f}", tone="positive" if sel_info["gross_profit"] > 0 else "neutral"),
                ]
                rank_rows = top_today if period == "today" and top_today else top_overall
                if rank_rows:
                    charts.append(
                        AIChartSpec(
                            chart_id="top_sellers_bar",
                            title=_L(eff_lang, "Top Selling Products (Units)", "ಹೆಚ್ಚು ಮಾರಾಟವಾದ ಉತ್ಪನ್ನಗಳು", "सबसे ज़्यादा बिकने वाले प्रोडक्ट्स"),
                            chart_type="bar",
                            points=[AIChartPoint(label=r["product_name"][:18], value=r["units_sold"], color="#6EE7B7") for r in rank_rows[:6]],
                        )
                    )
                    tables.append(
                        AITableSpec(
                            table_id="top_sellers_table",
                            title=_L(eff_lang, "Product Sales Leaderboard", "ಮಾರಾಟವಾದ ಉತ್ಪನ್ನಗಳ ಪಟ್ಟಿ", "उत्पाद बिक्री सूची"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Units", "ಪ್ರಮಾಣ", "मात्रा"), _L(eff_lang, "Revenue (₹)", "ಮಾರಾಟ (₹)", "बिक्री (₹)"), _L(eff_lang, "Profit (₹)", "ಲಾಭ (₹)", "मुनाफा (₹)")],
                            rows=[[r["product_name"], f"{r['units_sold']:g} {r.get('unit', 'unit')}", f"₹{r['revenue']:,.2f}", f"₹{r.get('gross_profit', r.get('profit', 0.0)):,.2f}"] for r in rank_rows[:8]],
                        )
                    )

            if is_compare and pc:
                qty_sign = "+" if pc["qty_delta"] >= 0 else ""
                rev_sign = "+" if pc["revenue_delta"] >= 0 else ""
                reply_md = _L(
                    eff_lang,
                    f"For **{pc['product_name']}**:\n\n"
                    f"- **Today ({ss['today_date']}):** **{pc['today_qty']:g} {pc['unit']}** sold (**₹{pc['today_revenue']:,.2f}**)\n"
                    f"- **Yesterday ({ss['yesterday_date']}):** **{pc['yesterday_qty']:g} {pc['unit']}** sold (**₹{pc['yesterday_revenue']:,.2f}**)\n"
                    f"- **Change:** **{qty_sign}{pc['qty_delta']:g} {pc['unit']}** ({rev_sign}₹{pc['revenue_delta']:,.2f}) · Overall store sales today **₹{t_info['net_sales']:,.2f}** vs yesterday **₹{y_info['net_sales']:,.2f}**.",
                    f"**{pc['product_name']}** ಹೋಲಿಕೆ ವಿವರ:\n\n"
                    f"- **ಇಂದು:** **{pc['today_qty']:g} {pc['unit']}** ಮಾರಾಟ (**₹{pc['today_revenue']:,.2f}**)\n"
                    f"- **ನಿನ್ನೆ:** **{pc['yesterday_qty']:g} {pc['unit']}** ಮಾರಾಟ (**₹{pc['yesterday_revenue']:,.2f}**)\n"
                    f"- **ವ್ಯತ್ಯಾಸ:** **{qty_sign}{pc['qty_delta']:g} {pc['unit']}** · ಒಟ್ಟು ಅಂಗಡಿ ಮಾರಾಟ ಇಂದು **₹{t_info['net_sales']:,.2f}** (ನಿನ್ನೆ ₹{y_info['net_sales']:,.2f}).",
                    f"**{pc['product_name']}** की तुलना:\n\n"
                    f"- **आज:** **{pc['today_qty']:g} {pc['unit']}** (**₹{pc['today_revenue']:,.2f}**)\n"
                    f"- **कल:** **{pc['yesterday_qty']:g} {pc['unit']}** (**₹{pc['yesterday_revenue']:,.2f}**)\n"
                    f"- **बदलाव:** **{qty_sign}{pc['qty_delta']:g} {pc['unit']}**।",
                )
                follow_ups = [
                    _L(eff_lang, "Is its stock enough for next week?", "ಮುಂದಿನ ವಾರಕ್ಕೆ ಇದರ ಸ್ಟಾಕ್ ಸಾಕಾಗುತ್ತದೆಯೇ?", "क्या इसका स्टॉक अगले हफ्ते के लिए काफी है?"),
                ]
            elif has_top_seller_q:
                if period == "today" and top_today:
                    t0 = top_today[0]
                    t0_u = t0.get("unit", "unit")
                    runner_up = f", followed by **{top_today[1]['product_name']}** ({top_today[1]['units_sold']:g} {top_today[1].get('unit', 'unit')})" if len(top_today) > 1 else ""
                    reply_md = _L(
                        eff_lang,
                        f"Today's top-selling product is **{t0['product_name']}** with **{t0['units_sold']:g} {t0_u}** sold (**₹{t0['revenue']:,.2f}**){runner_up}. Total sales today are **₹{t_info['net_sales']:,.2f}** across **{t_info['invoices_count']}** bill(s).",
                        f"ಇಂದು ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಮಾರಾಟವಾದ ವಸ್ತು **{t0['product_name']}** ಆಗಿದೆ — ಒಟ್ಟು **{t0['units_sold']:g}** ಪ್ರಮಾಣ (**₹{t0['revenue']:,.2f}**) ಮಾರಾಟವಾಗಿದೆ. ಇಂದಿನ ಒಟ್ಟು ಮಾರಾಟ **₹{t_info['net_sales']:,.2f}** (**{t_info['invoices_count']}** ಬಿಲ್‌ಗಳು).",
                        f"आज सबसे ज़्यादा बिकने वाला प्रोडक्ट **{t0['product_name']}** है — **{t0['units_sold']:g} {t0_u}** (**₹{t0['revenue']:,.2f}**)। आज की कुल बिक्री **₹{t_info['net_sales']:,.2f}** रही।",
                    )
                elif top_overall:
                    o0 = top_overall[0]
                    o0_u = o0.get("unit", "unit")
                    today_extra_en = f" Today specifically, **{top_today[0]['product_name']}** leads with **{top_today[0]['units_sold']:g} {top_today[0].get('unit', 'unit')}** (₹{top_today[0]['revenue']:,.2f})." if top_today else ""
                    today_extra_kn = f" ಇಂದಿನ ಮಾರಾಟದಲ್ಲಿ **{top_today[0]['product_name']}** (**{top_today[0]['units_sold']:g}**) ಮುಂದಿದೆ." if top_today else ""
                    today_extra_hi = f" आज की बिक्री में **{top_today[0]['product_name']}** ({top_today[0]['units_sold']:g}) सबसे आगे है।" if top_today else ""
                    reply_md = _L(
                        eff_lang,
                        f"Your top-selling product over the recent period is **{o0['product_name']}** with **{o0['units_sold']:g} {o0_u}** sold (**₹{o0['revenue']:,.2f}**).{today_extra_en}",
                        f"ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಮಾರಾಟವಾದ ವಸ್ತು **{o0['product_name']}** (**{o0['units_sold']:g}** ಪ್ರಮಾಣ, **₹{o0['revenue']:,.2f}**).{today_extra_kn}",
                        f"हाल की अवधि में सबसे ज़्यादा बिकने वाला प्रोडक्ट **{o0['product_name']}** है (**{o0['units_sold']:g} {o0_u}**, **₹{o0['revenue']:,.2f}**)।{today_extra_hi}",
                    )
                else:
                    reply_md = _L(
                        eff_lang,
                        f"No product sales invoices have been recorded for this period in **{ctx.business.name}** yet.",
                        f"ಈ ಅವಧಿಯಲ್ಲಿ **{ctx.business.name}** ಅಂಗಡಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಮಾರಾಟ ದಾಖಲಾಗಿಲ್ಲ.",
                        f"इस अवधि में **{ctx.business.name}** में अभी कोई बिक्री दर्ज नहीं हुई है।",
                    )
                follow_ups = [
                    _L(eff_lang, "How does that compare to yesterday?", "ನಿನ್ನೆಗೆ ಹೋಲಿಸಿದರೆ ಮಾರಾಟ ಹೇಗಿದೆ?", "कल की तुलना में बिक्री कैसी रही?"),
                    _L(eff_lang, "Is its stock enough for next week?", "ಮುಂದಿನ ವಾರಕ್ಕೆ ಸ್ಟಾಕ್ ಸಾಕಾಗುತ್ತದೆಯೇ?", "क्या इसका स्टॉक अगले हफ्ते के लिए पर्याप्त है?"),
                ]
            else:
                if period == "today":
                    top_note_en = f" Top item today: **{top_today[0]['product_name']}** ({top_today[0]['units_sold']:g} {top_today[0].get('unit', 'unit')})." if top_today else ""
                    top_note_kn = f" ಇಂದಿನ ಪ್ರಮುಖ ಮಾರಾಟ: **{top_today[0]['product_name']}** (**{top_today[0]['units_sold']:g}** ಪ್ರಮಾಣ)." if top_today else ""
                    top_note_hi = f" आज का मुख्य प्रोडक्ट: **{top_today[0]['product_name']}** ({top_today[0]['units_sold']:g})।" if top_today else ""
                    reply_md = _L(
                        eff_lang,
                        f"Today (`{t_info['date']}`), **{ctx.business.name}** recorded **₹{t_info['net_sales']:,.2f}** in net sales across **{t_info['invoices_count']}** bill(s) (yesterday: ₹{y_info['net_sales']:,.2f}).{top_note_en}",
                        f"ಇಂದು (`{t_info['date']}`) ನಿಮ್ಮ **{ctx.business.name}** ಅಂಗಡಿಯಲ್ಲಿ **{t_info['invoices_count']}** ಬಿಲ್‌ಗಳಿಂದ ಒಟ್ಟು **₹{t_info['net_sales']:,.2f}** ಮಾರಾಟವಾಗಿದೆ (ನಿನ್ನೆ ₹{y_info['net_sales']:,.2f}).{top_note_kn}",
                        f"आज (`{t_info['date']}`) **{ctx.business.name}** में **{t_info['invoices_count']}** बिल से कुल **₹{t_info['net_sales']:,.2f}** की बिक्री हुई (कल ₹{y_info['net_sales']:,.2f})।{top_note_hi}",
                    )
                elif period == "yesterday":
                    reply_md = _L(
                        eff_lang,
                        f"Yesterday (`{y_info['date']}`), **{ctx.business.name}** recorded **₹{y_info['net_sales']:,.2f}** in sales across **{y_info['invoices_count']}** bill(s).",
                        f"ನಿನ್ನೆ (`{y_info['date']}`) ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ **{y_info['invoices_count']}** ಬಿಲ್‌ಗಳಿಂದ **₹{y_info['net_sales']:,.2f}** ಮಾರಾಟವಾಗಿದೆ.",
                        f"कल (`{y_info['date']}`) कुल बिक्री **₹{y_info['net_sales']:,.2f}** (**{y_info['invoices_count']}** बिल) रही।",
                    )
                else:
                    reply_md = _L(
                        eff_lang,
                        f"Total net sales from `{sel_info['start_date']}` to `{sel_info['end_date']}` are **₹{sel_info['net_sales']:,.2f}** across **{sel_info['invoices_count']}** bill(s) (gross profit **₹{sel_info['gross_profit']:,.2f}**).",
                        f"`{sel_info['start_date']}` ರಿಂದ `{sel_info['end_date']}` ರವರೆಗೆ **{sel_info['invoices_count']}** ಬಿಲ್‌ಗಳಿಂದ ಒಟ್ಟು **₹{sel_info['net_sales']:,.2f}** ಮಾರಾಟವಾಗಿದೆ.",
                        f"`{sel_info['start_date']}` से `{sel_info['end_date']}` तक कुल बिक्री **₹{sel_info['net_sales']:,.2f}** (**{sel_info['invoices_count']}** बिल) रही।",
                    )
                follow_ups = [
                    _L(eff_lang, "Which product sold the most today?", "ಇಂದು ಯಾವ ಪ್ರಾಡಕ್ಟ್ ಹೆಚ್ಚು ಮಾರಾಟವಾಗಿದೆ?", "आज कौन सा प्रोडक्ट सबसे ज़्यादा बिका?"),
                    _L(eff_lang, "How much profit did I make this month?", "ಈ ತಿಂಗಳ ಲಾಭ ಎಷ್ಟು?", "इस महीने का मुनाफा बताओ"),
                ]

    elif intent == "PROFIT_DROP_INVESTIGATION":
        ok, pnl_cmp = trace.run_tool(
            "FinancialAnalysisAgent",
            "profit_drop_investigation",
            "Period-over-Period P&L Decomposition",
            role,
            lambda: tool_profit_drop_investigation(db, ctx),
        )
        if not ok:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Financial Profit & Margin Decomposition", "ಲಾಭ ಮತ್ತು ಮಾರ್ಜಿನ್ ವಿಶ್ಲೇಷಣೆ", "मुनाफा और मार्जिन विश्लेषण"))
        else:
            verified_dict["profit_comparison"] = pnl_cmp
            c = pnl_cmp["current"]
            p = pnl_cmp["previous"]
            d = pnl_cmp["deltas"]
            trace.add_agent("FinancialAnalysisAgent", f"Decomposed net sales, COGS, discounts, and operating expenses across {pnl_cmp['comparison_label']}.")
            trace.add_agent("SalesIntelligenceAgent", f"Identified {len(pnl_cmp['top_profit_draggers'])} SKU profit dragger(s) and {len(pnl_cmp['top_profit_gainers'])} gainer(s).")

            loc_drivers = [translate_text(drv, eff_lang) if eff_lang in ("kn", "hi") else drv for drv in pnl_cmp["drivers"]]
            driver_bullets = "\n".join(f"- {drv}" for drv in loc_drivers)

            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Current Operating Profit", "ಪ್ರಸ್ತುತ ನಿವ್ವಳ ಲಾಭ", "वर्तमान शुद्ध मुनाफा"), value=f"₹{c['operating_profit']:,.2f}", delta=f"{d['operating_profit_delta']:+,.2f}", tone="positive" if d["operating_profit_delta"] >= 0 else "critical"),
                    AIKpiMetric(label=_L(eff_lang, "Current Net Sales", "ಪ್ರಸ್ತುತ ನಿವ್ವಳ ಮಾರಾಟ", "वर्तमान कुल बिक्री"), value=f"₹{c['net_sales']:,.2f}", delta=f"{d['net_sales_delta']:+,.2f}", tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Gross Margin %", "ಒಟ್ಟು ಮಾರ್ಜಿನ್ %", "ग्रॉस मार्जिन %"), value=f"{c['gross_margin_percent']:.1f}%", delta=f"{d['margin_pct_delta']:+.1f} pp", tone="positive" if d["margin_pct_delta"] >= 0 else "warning"),
                    AIKpiMetric(label=_L(eff_lang, "Operating Expenses", "ಅಂಗಡಿ ವೆಚ್ಚಗಳು", "कुल खर्च"), value=f"₹{c['operating_expenses']:,.2f}", delta=f"{d['operating_expenses_delta']:+,.2f}", tone="warning" if d["operating_expenses_delta"] > 0 else "neutral"),
                ]
                charts.append(
                    AIChartSpec(
                        chart_id="pnl_period_compare",
                        title=_L(eff_lang, f"Profit & Revenue Comparison ({pnl_cmp['comparison_label']})", f"ಲಾಭ ಮತ್ತು ಮಾರಾಟ ಹೋಲಿಕೆ ({pnl_cmp['comparison_label']})", f"मुनाफा और बिक्री तुलना ({pnl_cmp['comparison_label']})"),
                        chart_type="bar",
                        unit_prefix="₹",
                        series_label=_L(eff_lang, "Current Period", "ಪ್ರಸ್ತುತ ಅವಧಿ", "वर्तमान अवधि"),
                        secondary_label=_L(eff_lang, "Previous Period", "ಹಿಂದಿನ ಅವಧಿ", "पिछली अवधि"),
                        points=[
                            AIChartPoint(label=_L(eff_lang, "Net Sales", "ಮಾರಾಟ", "बिक्री"), value=c["net_sales"], secondary_value=p["net_sales"], color="#7DD3FC"),
                            AIChartPoint(label=_L(eff_lang, "COGS", "ಸರಕು ವೆಚ್ಚ", "लागत"), value=c["cogs"], secondary_value=p["cogs"], color="#A78BFA"),
                            AIChartPoint(label=_L(eff_lang, "Gross Profit", "ಒಟ್ಟು ಲಾಭ", "ग्रॉस मुनाफा"), value=c["gross_profit"], secondary_value=p["gross_profit"], color="#6EE7B7"),
                            AIChartPoint(label=_L(eff_lang, "OpEx", "ಅಂಗಡಿ ವೆಚ್ಚ", "खर्च"), value=c["operating_expenses"], secondary_value=p["operating_expenses"], color="#FBBF24"),
                            AIChartPoint(label=_L(eff_lang, "Op. Profit", "ನಿವ್ವಳ ಲಾಭ", "शुद्ध मुनाफा"), value=c["operating_profit"], secondary_value=p["operating_profit"], color="#5EEAD4"),
                        ],
                    )
                )
                if pnl_cmp["expense_deltas"]:
                    tables.append(
                        AITableSpec(
                            table_id="expense_bridge",
                            title=_L(eff_lang, "Operating Expense Comparison by Category", "ವರ್ಗಾವಾರು ಅಂಗಡಿ ವೆಚ್ಚ ಹೋಲಿಕೆ", "खर्च श्रेणी तुलना"),
                            columns=[_L(eff_lang, "Category", "ವರ್ಗ", "श्रेणी"), _L(eff_lang, "Current (₹)", "ಪ್ರಸ್ತುತ (₹)", "वर्तमान (₹)"), _L(eff_lang, "Previous (₹)", "ಹಿಂದೆ (₹)", "पिछला (₹)"), _L(eff_lang, "Delta (₹)", "ವ್ಯತ್ಯಾಸ (₹)", "अंतर (₹)")],
                            rows=[[e["category"], f"₹{e['current']:,.2f}", f"₹{e['previous']:,.2f}", f"{e['delta']:+,.2f}"] for e in pnl_cmp["expense_deltas"]],
                        )
                    )
                if pnl_cmp["top_profit_draggers"]:
                    tables.append(
                        AITableSpec(
                            table_id="sku_draggers",
                            title=_L(eff_lang, "Top SKUs Pulling Profit Down", "ಲಾಭ ಕಡಿಮೆಯಾಗಲು ಕಾರಣವಾದ ಪ್ರಮುಖ ವಸ್ತುಗಳು", "मुनाफा घटाने वाले मुख्य प्रोडक्ट्स"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Curr Profit", "ಈಗಿನ ಲಾಭ", "वर्तमान मुनाफा"), _L(eff_lang, "Prev Profit", "ಹಿಂದಿನ ಲಾಭ", "पिछला मुनाफा"), _L(eff_lang, "Delta", "ವ್ಯತ್ಯಾಸ", "अंतर")],
                            rows=[[x["product_name"], f"₹{x['current_profit']:,.2f}", f"₹{x['previous_profit']:,.2f}", f"{x['profit_delta']:+,.2f}"] for x in pnl_cmp["top_profit_draggers"]],
                        )
                    )
                evidence = [
                    AIEvidenceItem(source=_L(eff_lang, "Invoices & Expenses", "ಬಿಲ್‌ಗಳು ಮತ್ತು ವೆಚ್ಚಗಳು", "बिल और खर्च"), label=pnl_cmp["comparison_label"], value=f"{c['invoices_count']} vs {p['invoices_count']} bills", record_count=c["invoices_count"] + p["invoices_count"]),
                    AIEvidenceItem(source=_L(eff_lang, "Margin Leakage", "ರಿಯಾಯಿತಿ ಮತ್ತು ವಾಪಸಾತಿ", "छूट और वापसी"), label=_L(eff_lang, "Discounts & Returns", "ರಿಯಾಯಿತಿ / ಹಿಂಪಡೆಯುವಿಕೆ", "छूट व वापसी"), value=f"₹{c['discounts']:,.2f} · ₹{c['returns']:,.2f}"),
                ]
                recommendations = [
                    _L(eff_lang, "Audit highest-delta expense categories before overhead compresses net margin further.", "ಹೆಚ್ಚಾಗಿರುವ ವೆಚ್ಚದ ವರ್ಗಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಅನಾವಶ್ಯಕ ಖರ್ಚನ್ನು ನಿಯಂತ್ರಿಸಿ.", "बढ़े हुए खर्च वाली श्रेणियों की समीक्षा करें।"),
                    _L(eff_lang, "Prioritize high-margin SKUs and review discounts on slower lines.", "ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ ಇರುವ ವಸ್ತುಗಳ ಮಾರಾಟಕ್ಕೆ ಆದ್ಯತೆ ನೀಡಿ ಮತ್ತು ಹೆಚ್ಚಿನ ರಿಯಾಯಿತಿ ತಡೆಯಿರಿ.", "अधिक मार्जिन वाले सामान पर ध्यान दें।"),
                ]
                reply_md = _L(
                    eff_lang,
                    f"### Root-Cause Profit Analysis ({pnl_cmp['comparison_label']})\n\n- **Operating Profit:** **₹{c['operating_profit']:,.2f}** (vs ₹{p['operating_profit']:,.2f} prior · **{d['operating_profit_delta']:+,.2f}**)\n- **Net Sales:** **₹{c['net_sales']:,.2f}** (COGS ₹{c['cogs']:,.2f} · Gross Margin **{c['gross_margin_percent']:.1f}%**)\n\n**Key Drivers Identified:**\n{driver_bullets}",
                    f"### ಲಾಭದ ಬದಲಾವಣೆಯ ಆಳವಾದ ವಿಶ್ಲೇಷಣೆ ({pnl_cmp['comparison_label']})\n\n- **ನಿವ್ವಳ ನಿರ್ವಹಣಾ ಲಾಭ:** **₹{c['operating_profit']:,.2f}** (ಹಿಂದೆ ₹{p['operating_profit']:,.2f} · ವ್ಯತ್ಯಾಸ **{d['operating_profit_delta']:+,.2f}**)\n- **ನಿವ್ವಳ ಮಾರಾಟ:** **₹{c['net_sales']:,.2f}** (ಸರಕು ವೆಚ್ಚ ₹{c['cogs']:,.2f} · ಒಟ್ಟು ಮಾರ್ಜಿನ್ **{c['gross_margin_percent']:.1f}%**)\n\n**ಪ್ರಮುಖ ಕಾರಣಗಳು:**\n{driver_bullets}",
                    f"### मुनाफे में बदलाव का विश्लेषण ({pnl_cmp['comparison_label']})\n\n- **शुद्ध मुनाफा:** **₹{c['operating_profit']:,.2f}** (पहले ₹{p['operating_profit']:,.2f} · बदलाव **{d['operating_profit_delta']:+,.2f}**)\n- **कुल बिक्री:** **₹{c['net_sales']:,.2f}** (मार्जिन **{c['gross_margin_percent']:.1f}%**)\n\n**मुख्य कारण:**\n{driver_bullets}",
                )
            else:
                reply_md = _L(
                    eff_lang,
                    f"Operating profit is **₹{c['operating_profit']:,.2f}** compared to **₹{p['operating_profit']:,.2f}** in the prior period (**{d['operating_profit_delta']:+,.2f}**), on net sales of **₹{c['net_sales']:,.2f}** ({c['gross_margin_percent']:.1f}% gross margin).\n\n{driver_bullets}",
                    f"ಪ್ರಸ್ತುತ ನಿವ್ವಳ ಲಾಭ **₹{c['operating_profit']:,.2f}** ಆಗಿದ್ದು, ಹಿಂದಿನ ಅವಧಿಗೆ (₹{p['operating_profit']:,.2f}) ಹೋಲಿಸಿದರೆ **{d['operating_profit_delta']:+,.2f}** ವ್ಯತ್ಯಾಸವಿದೆ (ನಿವ್ವಳ ಮಾರಾಟ **₹{c['net_sales']:,.2f}**, ಮಾರ್ಜಿನ್ **{c['gross_margin_percent']:.1f}%**).\n\n{driver_bullets}",
                    f"आपका शुद्ध मुनाफा **₹{c['operating_profit']:,.2f}** है (पिछली अवधि में ₹{p['operating_profit']:,.2f}, अंतर **{d['operating_profit_delta']:+,.2f}**), कुल बिक्री **₹{c['net_sales']:,.2f}** रही।\n\n{driver_bullets}",
                )
            follow_ups = [
                _L(eff_lang, "Which products generate the highest margins?", "ಅತಿ ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ ನೀಡುವ ವಸ್ತುಗಳು ಯಾವುವು?", "सबसे ज़्यादा मार्जिन वाले प्रोडक्ट्स कौन से हैं?"),
                _L(eff_lang, "Which products lock up working capital?", "ದುಡಿಯುವ ಬಂಡವಾಳ ಎಲ್ಲಿ ನಿಂತಿದೆ?", "स्टॉक और खाते में कितना पैसा फँसा है?"),
            ]

    elif intent == "FINANCIAL_PNL":
        days = 7 if ("week" in normalized_q.lower() or "ವಾರ" in clean_query) else (1 if ("today" in normalized_q.lower() or "ಇಂದು" in clean_query or "ಇಂದಿನ" in clean_query) else 30)
        ok, pnl = trace.run_tool("FinancialAnalysisAgent", "financial_pnl", "Financial P&L Summary", role, lambda: tool_financial_pnl(db, ctx, days=days))
        if not ok:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Financial Profit & Expense Reporting", "ಹಣಕಾಸು ಲಾಭ ಮತ್ತು ವೆಚ್ಚ ವರದಿ", "मुनाफा और खर्च रिपोर्टिंग"))
        else:
            verified_dict["financial_pnl"] = pnl
            trace.add_agent("FinancialAnalysisAgent", f"Computed verified P&L from {pnl['start_date']} to {pnl['end_date']}.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, f"Net Sales ({days}d)", f"ನಿವ್ವಳ ಮಾರಾಟ ({days} ದಿನ)", f"बिक्री ({days} दिन)"), value=f"₹{pnl['net_sales']:,.2f}", delta=f"{pnl['invoices_count']} bills", tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Gross Profit", "ಒಟ್ಟು ಲಾಭ", "ग्रॉस मुनाफा"), value=f"₹{pnl['gross_profit']:,.2f}", delta=f"{pnl['gross_margin_percent']:.1f}%", tone="positive" if pnl["gross_profit"] > 0 else "neutral"),
                    AIKpiMetric(label=_L(eff_lang, "Operating Expenses", "ಅಂಗಡಿ ವೆಚ್ಚ", "दुकान खर्च"), value=f"₹{pnl['operating_expenses']:,.2f}", tone="warning" if pnl["operating_expenses"] > 0 else "neutral"),
                    AIKpiMetric(label=_L(eff_lang, "Operating Profit", "ನಿವ್ವಳ ಲಾಭ", "शुद्ध मुनाफा"), value=f"₹{pnl['operating_profit']:,.2f}", delta=f"{pnl['net_margin_percent']:.1f}% net", tone="positive" if pnl["operating_profit"] >= 0 else "critical"),
                ]
                if pnl["daily_trend"]:
                    charts.append(
                        AIChartSpec(
                            chart_id="daily_sales_line",
                            title=_L(eff_lang, f"Daily Sales vs Gross Profit (Last {len(pnl['daily_trend'])}d)", f"ದೈನಂದಿನ ಮಾರಾಟ ಮತ್ತು ಲಾಭ (ಕಳೆದ {len(pnl['daily_trend'])} ದಿನ)", f"दैनिक बिक्री बनाम मुनाफा ({len(pnl['daily_trend'])} दिन)"),
                            chart_type="line",
                            unit_prefix="₹",
                            series_label=_L(eff_lang, "Net Sales", "ಮಾರಾಟ", "बिक्री"),
                            secondary_label=_L(eff_lang, "Gross Profit", "ಒಟ್ಟು ಲಾಭ", "मुनाफा"),
                            points=[AIChartPoint(label=pt["date"][5:], value=pt["sales"], secondary_value=pt["profit"]) for pt in pnl["daily_trend"][-14:]],
                        )
                    )
                if pnl["expense_breakdown"]:
                    tables.append(
                        AITableSpec(
                            table_id="pnl_expenses",
                            title=_L(eff_lang, "Operating Expense Breakdown", "ವೆಚ್ಚಗಳ ವಿವರ", "खर्च का विवरण"),
                            columns=[_L(eff_lang, "Category", "ವರ್ಗ", "श्रेणी"), _L(eff_lang, "Amount (₹)", "ಮೊತ್ತ (₹)", "राशि (₹)")],
                            rows=[[e["category"], f"₹{e['amount']:,.2f}"] for e in pnl["expense_breakdown"]],
                        )
                    )
                evidence = [
                    AIEvidenceItem(source=_L(eff_lang, "Invoices & COGS", "ಬಿಲ್‌ಗಳು ಮತ್ತು COGS", "बिल व लागत"), label=f"{pnl['start_date']} → {pnl['end_date']}", value=f"{pnl['invoices_count']} bills", record_count=pnl["invoices_count"]),
                    AIEvidenceItem(source=_L(eff_lang, "Stock Valuation", "ದಾಸ್ತಾನು ಮೌಲ್ಯ", "स्टॉक मूल्य"), label=_L(eff_lang, "Closing Value", "ಪ್ರಸ್ತುತ ಮೌಲ್ಯ", "कुल मूल्य"), value=f"₹{pnl['inventory_valuation']:,.2f}"),
                ]
                reply_md = _L(
                    eff_lang,
                    f"### Financial P&L Summary ({pnl['start_date']} to {pnl['end_date']})\n\n- **Gross Sales:** ₹{pnl['gross_sales']:,.2f} (Discounts ₹{pnl['discounts']:,.2f} · Returns ₹{pnl['returns']:,.2f})\n- **Net Sales:** **₹{pnl['net_sales']:,.2f}** across **{pnl['invoices_count']}** invoice(s) (Avg bill ₹{pnl['average_order_value']:,.2f})\n- **Cost of Goods Sold:** ₹{pnl['cogs']:,.2f}\n- **Gross Profit:** **₹{pnl['gross_profit']:,.2f}** ({pnl['gross_margin_percent']:.1f}%)\n- **Operating Expenses:** ₹{pnl['operating_expenses']:,.2f}\n- **Net Operating Profit:** **₹{pnl['operating_profit']:,.2f}**",
                    f"### ಹಣಕಾಸು ಲಾಭ ಮತ್ತು ವೆಚ್ಚ ವರದಿ ({pnl['start_date']} ರಿಂದ {pnl['end_date']})\n\n- **ಒಟ್ಟು ಮಾರಾಟ:** ₹{pnl['gross_sales']:,.2f} (ರಿಯಾಯಿತಿ ₹{pnl['discounts']:,.2f} · ವಾಪಸಾತಿ ₹{pnl['returns']:,.2f})\n- **ನಿವ್ವಳ ಮಾರಾಟ:** **₹{pnl['net_sales']:,.2f}** (**{pnl['invoices_count']}** ಬಿಲ್‌ಗಳು · ಸರಾಸರಿ ಬಿಲ್ ₹{pnl['average_order_value']:,.2f})\n- **ಮಾರಾಟವಾದ ಸರಕುಗಳ ವೆಚ್ಚ (COGS):** ₹{pnl['cogs']:,.2f}\n- **ಒಟ್ಟು ಲಾಭ (Gross Profit):** **₹{pnl['gross_profit']:,.2f}** ({pnl['gross_margin_percent']:.1f}%)\n- **ಅಂಗಡಿ ವೆಚ್ಚಗಳು:** ₹{pnl['operating_expenses']:,.2f}\n- **ನಿವ್ವಳ ಲಾಭ (Net Profit):** **₹{pnl['operating_profit']:,.2f}**",
                    f"### मुनाफा और खर्च रिपोर्ट ({pnl['start_date']} से {pnl['end_date']})\n\n- **कुल बिक्री:** **₹{pnl['net_sales']:,.2f}** (**{pnl['invoices_count']}** बिल · औसत बिल ₹{pnl['average_order_value']:,.2f})\n- **माल की लागत (COGS):** ₹{pnl['cogs']:,.2f}\n- **ग्रॉस मुनाफा:** **₹{pnl['gross_profit']:,.2f}** ({pnl['gross_margin_percent']:.1f}%)\n- **खर्च:** ₹{pnl['operating_expenses']:,.2f}\n- **शुद्ध मुनाफा:** **₹{pnl['operating_profit']:,.2f}**",
                )
            else:
                if pnl["invoices_count"] == 0 and pnl["operating_expenses"] == 0:
                    reply_md = _L(
                        eff_lang,
                        f"You haven't recorded any sales invoices or expenses over the last {days} day(s) in **{ctx.business.name}** yet (`₹0.00`). Once bills are created in POS, I'll track your live profit here automatically.",
                        f"ಕಳೆದ {days} ದಿನಗಳಲ್ಲಿ **{ctx.business.name}** ಅಂಗಡಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಮಾರಾಟ ಬಿಲ್ ಅಥವಾ ವೆಚ್ಚ ದಾಖಲಾಗಿಲ್ಲ (`₹0.00`). POS ನಲ್ಲಿ ಬಿಲ್ ಮಾಡಿದ ತಕ್ಷಣ ಲಾಭದ ಲೆಕ್ಕ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.",
                        f"पिछले {days} दिनों में **{ctx.business.name}** में अभी कोई बिल या खर्च दर्ज नहीं हुआ है (`₹0.00`)।",
                    )
                else:
                    reply_md = _L(
                        eff_lang,
                        f"Over the last **{days} day(s)** (`{pnl['start_date']}` to `{pnl['end_date']}`), net sales are **₹{pnl['net_sales']:,.2f}** across **{pnl['invoices_count']}** invoice(s), gross profit is **₹{pnl['gross_profit']:,.2f}** ({pnl['gross_margin_percent']:.1f}% margin), expenses are **₹{pnl['operating_expenses']:,.2f}**, leaving a net operating profit of **₹{pnl['operating_profit']:,.2f}**.",
                        f"ಕಳೆದ **{days} ದಿನಗಳಲ್ಲಿ** (`{pnl['start_date']}` – `{pnl['end_date']}`), **{pnl['invoices_count']}** ಬಿಲ್‌ಗಳಿಂದ ಒಟ್ಟು **₹{pnl['net_sales']:,.2f}** ನಿವ್ವಳ ಮಾರಾಟವಾಗಿದೆ.\n\n- **ಒಟ್ಟು ಲಾಭ:** ₹{pnl['gross_profit']:,.2f} ({pnl['gross_margin_percent']:.1f}% ಮಾರ್ಜಿನ್)\n- **ಅಂಗಡಿ ವೆಚ್ಚಗಳು:** ₹{pnl['operating_expenses']:,.2f}\n- **ನಿವ್ವಳ ಲಾಭ:** **₹{pnl['operating_profit']:,.2f}**",
                        f"पिछले **{days} दिनों** में **{pnl['invoices_count']}** बिल से कुल बिक्री **₹{pnl['net_sales']:,.2f}** रही। ग्रॉस मुनाफा **₹{pnl['gross_profit']:,.2f}** ({pnl['gross_margin_percent']:.1f}%) और खर्च **₹{pnl['operating_expenses']:,.2f}** के बाद शुद्ध मुनाफा **₹{pnl['operating_profit']:,.2f}** है।",
                    )
            follow_ups = [
                _L(eff_lang, "Why did profit change vs last month?", "ಕಳೆದ ತಿಂಗಳಿಗೆ ಹೋಲಿಸಿದರೆ ಲಾಭ ಯಾಕೆ ಬದಲಾಗಿದೆ?", "पिछले महीने की तुलना में मुनाफा क्यों बदला?"),
                _L(eff_lang, "Which products generate top margins?", "ಅತಿ ಹೆಚ್ಚು ಲಾಭ ತರುವ ವಸ್ತುಗಳು ಯಾವುವು?", "सबसे ज़्यादा मार्जिन वाले प्रोडक्ट्स कौन से हैं?"),
            ]

    elif intent == "WORKING_CAPITAL_AND_MARGIN":
        ok, wc = trace.run_tool("BusinessStrategyAgent", "working_capital_analysis", "Margins & Working Capital Audit", role, lambda: tool_margin_and_working_capital(db, ctx))
        if not ok:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Margin & Working Capital Valuation", "ಮಾರ್ಜಿನ್ ಮತ್ತು ದುಡಿಯುವ ಬಂಡವಾಳ ವಿಶ್ಲೇಷಣೆ", "मार्जिन और कार्यशील पूंजी"))
        else:
            verified_dict["working_capital"] = wc
            trace.add_agent("FinancialAnalysisAgent", f"Ranked {len(wc['highest_margin_catalog_skus'])} SKUs by margin %.")
            trace.add_agent("InventoryIntelligenceAgent", f"Audited stock ageing totaling ₹{wc['total_inventory_valuation']:,.2f}.")
            trace.add_agent("BusinessStrategyAgent", f"Evaluated ₹{wc['dead_stock_value']:,.2f} dead stock & ₹{wc['khata_receivables']:,.2f} Khata dues.")

            top_margin_sku = wc["highest_margin_catalog_skus"][0] if wc["highest_margin_catalog_skus"] else None
            top_lockup_sku = wc["highest_capital_lockup_skus"][0] if wc["highest_capital_lockup_skus"] else None

            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Working Capital Tied", "ಒಟ್ಟು ಬಂಡವಾಳ", "फँसी हुई पूंजी"), value=f"₹{wc['total_working_capital_tied']:,.2f}", delta=_L(eff_lang, "Stock + Khata", "ಸ್ಟಾಕ್ + ಖಾತಾ", "स्टॉक + खाता"), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Inventory Valuation", "ದಾಸ್ತಾನು ಮೌಲ್ಯ", "स्टॉक मूल्य"), value=f"₹{wc['total_inventory_valuation']:,.2f}", tone="neutral"),
                    AIKpiMetric(label=_L(eff_lang, "Dead Stock (90+ Days)", "ನಿಷ್ಕ್ರಿಯ ಸ್ಟಾಕ್ (90+ ದಿನ)", "रुका हुआ स्टॉक"), value=f"₹{wc['dead_stock_value']:,.2f}", tone="warning" if wc["dead_stock_value"] > 0 else "positive"),
                    AIKpiMetric(label=_L(eff_lang, "Top Catalog Margin", "ಗರಿಷ್ಠ ಮಾರ್ಜಿನ್", "शीर्ष मार्जिन"), value=f"{top_margin_sku['margin_percent']:.1f}%" if top_margin_sku else "0%", delta=top_margin_sku["product_name"][:20] if top_margin_sku else None, tone="positive"),
                ]
                if wc["ageing_cohorts"]:
                    charts.append(
                        AIChartSpec(
                            chart_id="wc_ageing_donut",
                            title=_L(eff_lang, "Inventory Capital by Stock Ageing", "ಸ್ಟಾಕ್ ವಯಸ್ಸಿನ ಆಧಾರದಲ್ಲಿ ಬಂಡವಾಳ ಹಂಚಿಕೆ", "स्टॉक की अवधि के अनुसार पूंजी"),
                            chart_type="donut",
                            unit_prefix="₹",
                            points=[AIChartPoint(label=c["cohort_name"], value=c["total_tied_up_capital"]) for c in wc["ageing_cohorts"]],
                        )
                    )
                if wc["highest_margin_catalog_skus"]:
                    charts.append(
                        AIChartSpec(
                            chart_id="top_margins_bar",
                            title=_L(eff_lang, "Top Products by Unit Margin %", "ಅತಿ ಹೆಚ್ಚು ಮಾರ್ಜಿನ್ % ನೀಡುವ ಉತ್ಪನ್ನಗಳು", "सबसे अधिक मार्जिन % वाले प्रोडक्ट्स"),
                            chart_type="bar",
                            unit_suffix="%",
                            points=[AIChartPoint(label=x["product_name"][:18], value=x["margin_percent"], color="#6EE7B7") for x in wc["highest_margin_catalog_skus"][:6]],
                        )
                    )
                tables.append(
                    AITableSpec(
                        table_id="capital_lockup_table",
                        title=_L(eff_lang, "Top Capital Lockup & High Margin SKUs", "ಬಂಡವಾಳ ಮತ್ತು ಮಾರ್ಜಿನ್ ವಿವರ", "प्रमुख पूंजी व मार्जिन विवरण"),
                        columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Margin %", "ಮಾರ್ಜಿನ್ %", "मार्जिन %"), _L(eff_lang, "Stock Qty", "ಪ್ರಮಾಣ", "मात्रा"), _L(eff_lang, "Capital Tied (₹)", "ಬಂಡವಾಳ (₹)", "पूंजी (₹)")],
                        rows=[[x["product_name"], f"{x['margin_percent']:.1f}%", f"{x['current_stock']:.1f}", f"₹{x['stock_capital']:,.2f}"] for x in wc["highest_capital_lockup_skus"][:8]],
                    )
                )
                recommendations = [
                    _L(eff_lang, f"Highest capital sits in **{top_lockup_sku['product_name']}** (₹{top_lockup_sku['stock_capital']:,.2f}) — pause bulk reorders until turnover rises.", f"**{top_lockup_sku['product_name']}** ನಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಬಂಡವಾಳ (₹{top_lockup_sku['stock_capital']:,.2f}) ನಿಂತಿದೆ — ಮಾರಾಟ ವೇಗವಾಗುವವರೆಗೆ ಹೆಚ್ಚುವರಿ ಆರ್ಡರ್ ತಡೆಯಿರಿ.", f"**{top_lockup_sku['product_name']}** में सबसे ज़्यादा पूंजी (₹{top_lockup_sku['stock_capital']:,.2f}) लगी है।") if top_lockup_sku else "",
                    _L(eff_lang, "Feature top >20% margin winners prominently near checkout.", "20%+ ಮಾರ್ಜಿನ್ ಇರುವ ವಸ್ತುಗಳನ್ನು ಕೌಂಟರ್ ಬಳಿ ಗ್ರಾಹಕರಿಗೆ ಕಾಣುವಂತೆ ಇಡಿ.", "20%+ मार्जिन वाले आइटम काउंटर के पास रखें।"),
                ]
                recommendations = [r for r in recommendations if r]

            if top_margin_sku:
                top_3 = ", ".join(f"**{x['product_name']}** ({x['margin_percent']:.1f}%)" for x in wc["highest_margin_catalog_skus"][:3])
                reply_md = _L(
                    eff_lang,
                    f"Total working capital tied up is **₹{wc['total_working_capital_tied']:,.2f}** (Inventory ₹{wc['total_inventory_valuation']:,.2f} + Khata ₹{wc['khata_receivables']:,.2f}), with **₹{wc['dead_stock_value']:,.2f}** in 90+ day dormant stock.\n\nTop margin products: {top_3}. Highest capital lockup is **{top_lockup_sku['product_name']}** (₹{top_lockup_sku['stock_capital']:,.2f})." if top_lockup_sku else "",
                    f"ಒಟ್ಟು ದುಡಿಯುವ ಬಂಡವಾಳ **₹{wc['total_working_capital_tied']:,.2f}** (ದಾಸ್ತಾನು ಮೌಲ್ಯ ₹{wc['total_inventory_valuation']:,.2f} + ಗ್ರಾಹಕರ ಖಾತಾ ₹{wc['khata_receivables']:,.2f}). ಇದರಲ್ಲಿ **₹{wc['dead_stock_value']:,.2f}** 90+ ದಿನಗಳಿಂದ ಮಾರಾಟವಾಗದ ಹಳೆಯ ಸ್ಟಾಕ್ ಆಗಿದೆ.\n\n- **ಗರಿಷ್ಠ ಮಾರ್ಜಿನ್ ವಸ್ತುಗಳು:** {top_3}"
                    + (f"\n- **ಹೆಚ್ಚು ಬಂಡವಾಳ ನಿಂತ ವಸ್ತು:** **{top_lockup_sku['product_name']}** (₹{top_lockup_sku['stock_capital']:,.2f})" if top_lockup_sku else ""),
                    f"कुल कार्यशील पूंजी **₹{wc['total_working_capital_tied']:,.2f}** है (स्टॉक ₹{wc['total_inventory_valuation']:,.2f} + खाता बकाया ₹{wc['khata_receivables']:,.2f})।\n\nशीर्ष मार्जिन प्रोडक्ट्स: {top_3}।",
                )
            else:
                reply_md = _L(eff_lang, "No active products found yet to analyze margins.", "ಮಾರ್ಜಿನ್ ವಿಶ್ಲೇಷಣೆಗೆ ಇನ್ನೂ ಸಕ್ರಿಯ ಉತ್ಪನ್ನಗಳಿಲ್ಲ.", "मार्जिन विश्लेषण के लिए कोई सक्रिय प्रोडक्ट नहीं मिला।")
            follow_ups = [_L(eff_lang, "Prepare a purchase draft for low stock", "ಕಡಿಮೆ ಸ್ಟಾಕ್‌ಗೆ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "कम स्टॉक के लिए PO ड्राफ्ट बनाओ")]

    elif intent == "SUPPLIER_COMPARISON":
        prod_match = _match_product_from_text(db, bid, clean_query)
        ok, sup = trace.run_tool(
            "SupplierIntelligenceAgent",
            "supplier_price_comparison",
            "Supplier Cost & Lead Time Benchmark",
            role,
            lambda: tool_supplier_price_comparison(db, ctx, product_query=prod_match.name if prod_match else None),
        )
        if not ok:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Supplier Purchasing Price Comparison", "ಸರಬರಾಜುದಾರರ ಬೆಲೆ ಹೋಲಿಕೆ", "सप्लायर रेट तुलना"))
        else:
            verified_dict["supplier_comparison"] = sup
            trace.add_agent("SupplierIntelligenceAgent", f"Evaluated {sup['suppliers_count']} supplier(s) & PO unit cost records.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Active Suppliers", "ಸಕ್ರಿಯ ಸರಬರಾಜುದಾರರು", "सक्रिय सप्लायर"), value=str(sup["suppliers_count"]), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Multi-Vendor Benchmarks", "ಬಹು-ವ್ಯಾಪಾರಿ ಹೋಲಿಕೆ", "तुलनात्मक कोट्स"), value=str(len([c for c in sup["product_price_comparisons"] if len(c["quotes"]) > 1])), tone="positive" if sup["has_multi_supplier_quotes"] else "neutral"),
                ]
                if sup["suppliers"]:
                    tables.append(
                        AITableSpec(
                            table_id="supplier_scorecard",
                            title=_L(eff_lang, "Supplier Scorecard (Lead Time, Terms & Spend)", "ಸರಬರಾಜುದಾರರ ವಿವರ ಮತ್ತು ಖರೀದಿ ಮೊತ್ತ", "सप्लायर स्कोरकार्ड"),
                            columns=[_L(eff_lang, "Supplier", "ಸರಬರಾಜುದಾರ", "सप्लायर"), _L(eff_lang, "Lead Time", "ಸಮಯ", "लीड टाइम"), _L(eff_lang, "Terms", "ನಿಯಮ", "शर्तें"), _L(eff_lang, "SKUs", "ವಸ್ತುಗಳು", "आइटम"), _L(eff_lang, "PO Spend (₹)", "ಒಟ್ಟು ಖರೀದಿ (₹)", "कुल खरीद (₹)")],
                            rows=[[s["supplier_name"], f"{s['lead_time_days']}d", f"{s['payment_terms_days']}d", str(s["skus_assigned"]), f"₹{s['total_spend']:,.2f}"] for s in sup["suppliers"][:10]],
                        )
                    )
                if sup["product_price_comparisons"]:
                    comp_rows = []
                    for c in sup["product_price_comparisons"][:10]:
                        q_summary = " | ".join(f"{q['supplier_name']}: ₹{q['avg_unit_cost']:.2f}" for q in c["quotes"][:3])
                        comp_rows.append([c["product_name"], c["best_supplier"], f"₹{c['best_avg_unit_cost']:.2f}", q_summary])
                    tables.append(
                        AITableSpec(
                            table_id="supplier_price_diff",
                            title=_L(eff_lang, "Historical Unit Cost Comparison by Product", "ಉತ್ಪನ್ನವಾರು ಸರಬರಾಜುದಾರರ ದರ ಹೋಲಿಕೆ", "प्रोडक्ट के अनुसार रेट तुलना"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Lowest Cost Vendor", "ಕಡಿಮೆ ದರದ ವ್ಯಾಪಾರಿ", "सबसे सस्ता सप्लायर"), _L(eff_lang, "Best Avg Cost", "ಉತ್ತಮ ದರ", "सर्वोत्तम रेट"), _L(eff_lang, "All Vendor Quotes", "ಎಲ್ಲಾ ದರಗಳು", "सभी कोट्स")],
                            rows=comp_rows,
                        )
                    )

            if sup["has_multi_supplier_quotes"]:
                best_diff = sup["product_price_comparisons"][0]
                reply_md = _L(
                    eff_lang,
                    f"Across your historical Purchase Orders, **{best_diff['product_name']}** has the best pricing from **{best_diff['best_supplier']}** at **₹{best_diff['best_avg_unit_cost']:,.2f}/{best_diff['unit']}** — saving **₹{best_diff['unit_spread_savings']:,.2f}/unit** compared with higher quotes.",
                    f"ನಿಮ್ಮ ಹಿಂದಿನ ಖರೀದಿ ಆದೇಶಗಳ ಪ್ರಕಾರ **{best_diff['product_name']}** ಗೆ **{best_diff['best_supplier']}** ಅತ್ಯುತ್ತಮ ದರ ನೀಡಿದ್ದಾರೆ (**₹{best_diff['best_avg_unit_cost']:,.2f}/{best_diff['unit']}** — ಪ್ರತಿ ಯೂನಿಟ್‌ಗೆ **₹{best_diff['unit_spread_savings']:,.2f}** ಉಳಿತಾಯ).",
                    f"आपके पिछले ऑर्डर्स के अनुसार **{best_diff['product_name']}** के लिए **{best_diff['best_supplier']}** सबसे सस्ते रेट **₹{best_diff['best_avg_unit_cost']:,.2f}/{best_diff['unit']}** पर देते हैं (प्रति यूनिट **₹{best_diff['unit_spread_savings']:,.2f}** बचत)।",
                )
            elif sup["suppliers"]:
                fastest = min(sup["suppliers"], key=lambda s: s["lead_time_days"])
                reply_md = _L(
                    eff_lang,
                    f"You have **{sup['suppliers_count']}** supplier(s) registered. **{fastest['supplier_name']}** has the fastest lead time ({fastest['lead_time_days']} days). Most items currently only have quotes from one supplier — upload another quote to compare prices side-by-side.",
                    f"ನಿಮ್ಮಲ್ಲಿ **{sup['suppliers_count']}** ಸರಬರಾಜುದಾರರಿದ್ದಾರೆ. **{fastest['supplier_name']}** ಅತ್ಯಂತ ವೇಗದ ಸರಬರಾಜು ಸಮಯ ({fastest['lead_time_days']} ದಿನ) ಹೊಂದಿದ್ದಾರೆ. ಬೆಲೆ ಹೋಲಿಕೆಗೆ ಹೆಚ್ಚಿನ ವ್ಯಾಪಾರಿಗಳ ಬಿಲ್/ದರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
                    f"अभी **{sup['suppliers_count']}** सप्लायर पंजीकृत हैं, जिनमें **{fastest['supplier_name']}** सबसे तेज़ ({fastest['lead_time_days']} दिन) डिलीवरी देते हैं।",
                )
            else:
                reply_md = _L(eff_lang, "No suppliers registered yet. Add suppliers in Suppliers & Vendors.", "ಇನ್ನೂ ಯಾವುದೇ ಸರಬರಾಜುದಾರರನ್ನು ಸೇರಿಸಲಾಗಿಲ್ಲ.", "अभी कोई सप्लायर दर्ज नहीं है।")
            follow_ups = [_L(eff_lang, "Prepare a purchase draft for low stock", "ಕಡಿಮೆ ಸ್ಟಾಕ್‌ಗೆ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "कम स्टॉक के लिए PO ड्राफ्ट बनाओ")]

    elif intent in ("AUTONOMOUS_REORDER_PO", "REORDER_RISK_ANALYSIS"):
        s1 = _run_parallel_stage1(
            db,
            ctx,
            trace,
            role,
            [
                ("inv", "InventoryIntelligenceAgent", "inventory_lookup", "Inventory Stock Inspection", lambda d, c: tool_inventory_lookup(d, c), {}),
                ("pred", "ForecastingAgent", "demand_forecasting", "Sales Velocity & Stockout Forecast", lambda d, c: get_comprehensive_predictive_snapshot(d, c.business.id), {}),
                ("reorders", "PurchaseManagementAgent", "reorder_recommendations", "Calculate Target Order Quantities", lambda d, c: calculate_reorder_recommendations(d, c.business.id, all_items=True), {}),
                ("sup", "SupplierIntelligenceAgent", "supplier_price_comparison", "Check Available Suppliers & Lead Times", lambda d, c: tool_supplier_price_comparison(d, c), {}),
            ],
            allow_parallel=allow_parallel_db,
        )
        ok_inv, inv = s1.get("inv", (False, None))
        ok_fc, pred = s1.get("pred", (False, None))
        ok_rec, reorders = s1.get("reorders", (False, None))
        ok_sup, sup = s1.get("sup", (False, None))

        if not (ok_inv and ok_rec):
            verified_dict["rbac_restricted"] = True
            if (intent == "AUTONOMOUS_REORDER_PO" or mode == "AGENT") and not is_tool_allowed(role, "CREATE_PURCHASE_ORDER"):
                trace.run_tool("PurchaseManagementAgent", "CREATE_PURCHASE_ORDER", "Create Purchase Draft", role, lambda: None, is_mutating=True)
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Replenishment Planning & PO Drafting", "ಮರುಖರೀದಿ ಮತ್ತು PO ಡ್ರಾಫ್ಟ್ ತಯಾರಿ", "खरीद ड्राफ्ट तैयार करना"))
        else:
            needs_reorder = [r for r in reorders if r.needs_reorder]
            matched_prod = _match_product_from_text(db, bid, clean_query)
            if matched_prod and not any(w in clean_query.lower() for w in ["all", "products that", "running out", "low stock", "ಕಡಿಮೆ", "ಎಲ್ಲಾ"]):
                target_items = [r for r in reorders if r.product_id == matched_prod.id] or needs_reorder
            else:
                target_items = needs_reorder

            default_sup = db.query(Supplier).filter(Supplier.business_id == bid).first()
            resolved_plan: List[Tuple[Any, Optional[int], str, float, float]] = []
            for r in target_items:
                best_sid, best_sname, best_cost = _select_best_supplier_and_cost(
                    r,
                    sup if ok_sup else None,
                    default_sup.id if default_sup else None,
                    default_sup.name if default_sup else "",
                )
                line_est = round(float(r.recommended_order_qty) * best_cost, 2)
                resolved_plan.append((r, best_sid, best_sname, best_cost, line_est))

            est_total_po = round(sum(x[4] for x in resolved_plan), 2)
            verified_dict["inventory_lookup"] = inv
            if pred:
                verified_dict["demand_forecasting"] = pred
            if ok_sup and sup:
                verified_dict["supplier_comparison"] = sup
            verified_dict["reorder_recommendations"] = [
                {
                    **r.model_dump(),
                    "selected_supplier_id": sid,
                    "selected_supplier_name": sname,
                    "selected_unit_cost": ucost,
                    "selected_estimated_cost": line_cost,
                }
                for r, sid, sname, ucost, line_cost in resolved_plan
            ]
            verified_dict["est_total_po"] = est_total_po

            trace.add_agent("InventoryIntelligenceAgent", f"Scanned {inv['total_skus']} SKUs: {inv['out_of_stock_count']} out-of-stock, {inv['low_stock_count']} at/below threshold.")
            trace.add_agent("SalesIntelligenceAgent", "Analyzed 30-day active operating-span POS velocity per SKU.")
            if pred:
                trace.add_agent("ForecastingAgent", f"Identified {pred['stockout_within_7d_count']} SKU(s) projected to stock out within 7 days.")
            trace.add_agent("PurchaseManagementAgent", f"Calculated MOQ-snapped reorder quantities for {len(target_items)} candidate SKU(s).")
            trace.add_agent("SupplierIntelligenceAgent", f"Mapped candidates across {sup['suppliers_count'] if sup else 0} active supplier(s) & best historical quotes.")

            if is_deep and target_items:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Low-Stock SKUs", "ಕಡಿಮೆ ಸ್ಟಾಕ್ ವಸ್ತುಗಳು", "कम स्टॉक आइटम"), value=str(len(target_items)), delta=f"{inv['out_of_stock_count']} zero stock", tone="warning"),
                    AIKpiMetric(label=_L(eff_lang, "<7d Stockout Risk", "<7 ದಿನದಲ್ಲಿ ಖಾಲಿ", "7 दिन में खत्म होने वाले"), value=str(pred["stockout_within_7d_count"] if pred else 0), tone="critical" if (pred and pred["stockout_within_7d_count"] > 0) else "positive"),
                    AIKpiMetric(label=_L(eff_lang, "Est. Order Total", "ಅಂದಾಜು ಖರೀದಿ ವೆಚ್ಚ", "अनुमानित लागत"), value=f"₹{est_total_po:,.2f}", tone="info"),
                ]
                charts.append(
                    AIChartSpec(
                        chart_id="reorder_qty_bar",
                        title=_L(eff_lang, "Recommended Order Quantities", "ಶಿಫಾರಸು ಮಾಡಿದ ಆರ್ಡರ್ ಪ್ರಮಾಣ", "अनुशंसित ऑर्डर मात्रा"),
                        chart_type="bar",
                        series_label=_L(eff_lang, "Order Qty", "ಆರ್ಡರ್ ಪ್ರಮಾಣ", "ऑर्डर मात्रा"),
                        secondary_label=_L(eff_lang, "Current Stock", "ಪ್ರಸ್ತುತ ಸ್ಟಾಕ್", "मौजूदा स्टॉक"),
                        points=[AIChartPoint(label=r.product_name[:16], value=r.recommended_order_qty, secondary_value=r.current_stock, color="#FB7185" if r.urgency_level == "CRITICAL" else "#FBBF24") for r in target_items[:7]],
                    )
                )
                tables.append(
                    AITableSpec(
                        table_id="reorder_plan_table",
                        title=_L(eff_lang, "Replenishment Plan & Supplier Mapping", "ಮರುಖರೀದಿ ಯೋಜನೆ ಮತ್ತು ಸರಬರಾಜುದಾರರು", "रीस्टॉक योजना"),
                        columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Stock", "ಸ್ಟಾಕ್", "स्टॉक"), _L(eff_lang, "Velocity/d", "ದಿನದ ಮಾರಾಟ", "दैनिक बिक्री"), _L(eff_lang, "Order Qty", "ಆರ್ಡರ್", "ऑर्डर"), _L(eff_lang, "Est. Cost", "ವೆಚ್ಚ", "लागत"), _L(eff_lang, "Supplier", "ಸರಬರಾಜುದಾರ", "सप्लायर")],
                        rows=[[r.product_name, f"{r.current_stock:g} {r.unit}", f"{r.avg_daily_demand:.1f}/d", f"{r.recommended_order_qty:g} {r.unit}", f"₹{line_cost:,.2f}", sname] for r, _, sname, _, line_cost in resolved_plan[:12]],
                    )
                )

            should_draft = intent == "AUTONOMOUS_REORDER_PO" or mode == "AGENT"
            created_drafts: List[AIApproval] = []
            chosen_supplier_names: List[str] = []
            if should_draft and target_items:
                if not is_tool_allowed(role, "CREATE_PURCHASE_ORDER"):
                    verified_dict["rbac_restricted"] = True
                    trace.run_tool("PurchaseManagementAgent", "CREATE_PURCHASE_ORDER", "Create Purchase Draft", role, lambda: None, is_mutating=True)
                    reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Preparing & Creating Purchase Orders", "ಖರೀದಿ ಆದೇಶ ತಯಾರಿ", "Purchase Order बनाना"))
                else:
                    grouped: Dict[int, List[Dict[str, Any]]] = {}
                    for r, best_sid, best_sname, best_cost, _ in resolved_plan[:15]:
                        if best_sid:
                            if best_sname:
                                chosen_supplier_names.append(best_sname)
                            grouped.setdefault(best_sid, []).append({
                                "product_id": r.product_id,
                                "quantity_ordered": r.recommended_order_qty,
                                "unit_cost": best_cost,
                                "tax_rate_percent": 0.0,
                            })
                    for sid, po_items in grouped.items():
                        ok_d, appr = trace.run_tool(
                            "PurchaseManagementAgent",
                            "CREATE_PURCHASE_ORDER",
                            f"Prepare PO Draft (Supplier #{sid})",
                            role,
                            lambda s=sid, it=po_items: build_purchase_order_approval_draft(
                                db, ctx, supplier_id=s, items=it,
                                notes="Prepared by SmartStock AI",
                                conversation_id=conv.id, task_id=task.id,
                                language=eff_lang,
                            ),
                            args_preview={"supplier_id": sid, "items_count": len(po_items)},
                            is_mutating=True,
                        )
                        if ok_d and appr:
                            created_drafts.append(appr)
                            approval_ids.append(appr.id)

            if created_drafts:
                verified_dict["approvals"] = [approval_to_out(a).model_dump() for a in created_drafts]

            if not reply_md:
                if created_drafts:
                    top_names = ", ".join(r.product_name for r in target_items[:4])
                    sup_names = ", ".join(dict.fromkeys(chosen_supplier_names[:3]))
                    sup_note_en = f" via **{sup_names}**" if sup_names else ""
                    sup_note_kn = f" (**{sup_names}** ಮೂಲಕ)" if sup_names else ""
                    sup_note_hi = f" (**{sup_names}** द्वारा)" if sup_names else ""
                    reply_md = _L(
                        eff_lang,
                        f"I checked **{len(target_items)}** low-stock item(s) ({top_names}{'...' if len(target_items) > 4 else ''}) and prepared **{len(created_drafts)} Purchase Order draft(s)**{sup_note_en} totaling **₹{est_total_po:,.2f}**.\n\nReview the card below and click **Approve & Execute** whenever you're ready — nothing changes until you confirm.",
                        f"**{len(target_items)}** ಕಡಿಮೆ ಸ್ಟಾಕ್ ವಸ್ತುಗಳನ್ನು ({top_names}{'...' if len(target_items) > 4 else ''}) ಪರಿಶೀಲಿಸಿ{sup_note_kn} ಒಟ್ಟು **₹{est_total_po:,.2f}** ಮೌಲ್ಯದ **{len(created_drafts)} ಖರೀದಿ ಆರ್ಡರ್ (PO) ಡ್ರಾಫ್ಟ್** ಸಿದ್ಧಪಡಿಸಿದ್ದೇನೆ.\n\nಕೆಳಗಿನ ಕಾರ್ಡ್‌ನಲ್ಲಿ ವಿವರ ನೋಡಿ **ಅನುಮೋದಿಸಿ ಮತ್ತು ಕಾರ್ಯಗತಗೊಳಿಸಿ** ಒತ್ತಿದ ನಂತರವೇ ಆರ್ಡರ್ ದೃಢವಾಗುತ್ತದೆ.",
                        f"मैंने **{len(target_items)}** कम स्टॉक आइटम ({top_names}){sup_note_hi} देखकर कुल **₹{est_total_po:,.2f}** का **{len(created_drafts)} परचेज़ ऑर्डर ड्राफ्ट** तैयार कर दिया है। नीचे देखकर **मंज़ूर करें** दबाएँ।",
                    )
                elif target_items and should_draft:
                    reply_md = _L(
                        eff_lang,
                        f"Found **{len(target_items)}** low-stock item(s), but there's no Supplier added yet to assign a PO draft. Add a supplier first and ask again!",
                        f"**{len(target_items)}** ಕಡಿಮೆ ಸ್ಟಾಕ್ ವಸ್ತುಗಳಿವೆ, ಆದರೆ ಇನ್ನೂ ಸರಬರಾಜುದಾರರನ್ನು (Supplier) ಸೇರಿಸಿಲ್ಲ. ಮೊದಲು Suppliers ವಿಭಾಗದಲ್ಲಿ ಒಬ್ಬ ಸರಬರಾಜುದಾರರನ್ನು ಸೇರಿಸಿ.",
                        f"**{len(target_items)}** कम स्टॉक आइटम हैं, लेकिन अभी कोई सप्लायर पंजीकृत नहीं है।",
                    )
                    actions.append(AIActionShortcut(label=_L(eff_lang, "Add Supplier", "ಸರಬರಾಜುದಾರರನ್ನು ಸೇರಿಸಿ", "सप्लायर जोड़ें"), target_tab="suppliers"))
                elif target_items:
                    if eff_lang == "kn":
                        item_list = "\n".join(
                            f"- **{r.product_name}**: ಬಾಕಿ {r.current_stock:g} {r.unit} → **{r.recommended_order_qty:g} {r.unit}** ಆರ್ಡರ್ ಸಲಹೆ (~₹{line_cost:,.2f})"
                            for r, _, _, _, line_cost in resolved_plan[:5]
                        )
                    elif eff_lang == "hi":
                        item_list = "\n".join(
                            f"- **{r.product_name}**: बचा {r.current_stock:g} {r.unit} → **{r.recommended_order_qty:g} {r.unit}** ऑर्डर सुझाव (~₹{line_cost:,.2f})"
                            for r, _, _, _, line_cost in resolved_plan[:5]
                        )
                    else:
                        item_list = "\n".join(
                            f"- **{r.product_name}**: {r.current_stock:g} {r.unit} left → suggest ordering **{r.recommended_order_qty:g} {r.unit}** (~₹{line_cost:,.2f})"
                            for r, _, _, _, line_cost in resolved_plan[:5]
                        )
                    reply_md = _L(
                        eff_lang,
                        f"**{len(target_items)}** item(s) are low on stock (est. restock **₹{est_total_po:,.2f}**):\n\n{item_list}\n\nWant me to prepare a supplier PO draft for these?",
                        f"ಸದ್ಯ **{len(target_items)}** ವಸ್ತುಗಳು ಕಡಿಮೆ ಸ್ಟಾಕ್‌ನಲ್ಲಿವೆ (ಅಂದಾಜು ವೆಚ್ಚ **₹{est_total_po:,.2f}**):\n\n{item_list}\n\nಇವುಗಳಿಗೆ ಖರೀದಿ ಆರ್ಡರ್ (PO) ಡ್ರಾಫ್ಟ್ ತಯಾರಿಸಲೇ?",
                        f"अभी **{len(target_items)}** सामान कम स्टॉक पर हैं (अनुमानित लागत **₹{est_total_po:,.2f}**):\n\n{item_list}\n\nक्या मैं इनका PO ड्राफ्ट बना दूँ?",
                    )
                    actions.append(AIActionShortcut(label=_L(eff_lang, "Prepare Purchase Draft", "ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧಪಡಿಸಿ", "PO ड्राफ्ट बनाएँ"), prompt="Prepare a purchase draft for low stock products"))
                else:
                    reply_md = _L(
                        eff_lang,
                        f"Good news — all **{inv['total_skus']}** products in your store currently have healthy stock levels.",
                        f"ಒಳ್ಳೆಯ ಸುದ್ದಿ — ನಿಮ್ಮ ಅಂಗಡಿಯ ಎಲ್ಲಾ **{inv['total_skus']}** ವಸ್ತುಗಳು ಸದ್ಯ ಆರೋಗ್ಯಕರ ಸ್ಟಾಕ್ ಮಟ್ಟದಲ್ಲಿವೆ.",
                        f"अच्छी खबर — आपके सभी **{inv['total_skus']}** प्रोडक्ट्स का स्टॉक पर्याप्त है।",
                    )
            new_ctx["last_product_ids"] = [r.product_id for r in target_items[:10]]
            if target_items:
                new_ctx["last_product_id"] = target_items[0].product_id
                new_ctx["last_product_name"] = target_items[0].product_name
            follow_ups = [
                _L(eff_lang, "Compare supplier purchasing prices", "ಸರಬರಾಜುದಾರರ ಬೆಲೆಗಳನ್ನು ಹೋಲಿಸಿ", "सप्लायर रेट तुलना दिखाओ"),
                _L(eff_lang, "Simulate a 5-day supplier delay", "ಸರಬರಾಜು 5 ದಿನ ತಡವಾದರೆ ಏನಾಗುತ್ತದೆ?", "सप्लायर 5 दिन लेट हो तो क्या होगा?"),
            ]

    elif intent == "PROPOSE_STOCK_ADJUSTMENT":
        prod = _match_product_from_text(db, bid, clean_query)
        nums = re.findall(r"([+-]?\d+(?:\.\d+)?)", clean_query)
        qty_delta = float(nums[-1]) if nums else None
        if qty_delta is not None and any(w in clean_query.lower() for w in ["reduce", "deduct", "remove", "damage", "minus", "ಕಡಿಮೆ", "ಕಳೆ"]):
            qty_delta = -abs(qty_delta)
        if not prod or qty_delta is None or qty_delta == 0:
            reply_md = _L(eff_lang, "Specify product name and quantity (e.g., *Adjust stock of Milk 1L by -2 reason damaged*).", "ದಯವಿಟ್ಟು ಉತ್ಪನ್ನದ ಹೆಸರು ಮತ್ತು ಪ್ರಮಾಣ ತಿಳಿಸಿ (ಉದಾ: *Milk 1L ಸ್ಟಾಕ್ -2 ಸರಿಪಡಿಸಿ*).", "कृपया प्रोडक्ट का नाम और मात्रा बताएँ।")
        elif not is_tool_allowed(role, "ADJUST_STOCK"):
            verified_dict["rbac_restricted"] = True
            trace.run_tool("InventoryIntelligenceAgent", "ADJUST_STOCK", "Propose Stock Adjustment", role, lambda: None, is_mutating=True)
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Adjusting Inventory Stock", "ಸ್ಟಾಕ್ ತಿದ್ದುಪಡಿ", "स्टॉक सुधार"))
        else:
            reason_m = re.search(r"(?i)(?:reason|because|for)\s+(.+)$", clean_query)
            reason = reason_m.group(1).strip() if reason_m else "AI-assisted inventory adjustment"
            ok_a, appr = trace.run_tool(
                "InventoryIntelligenceAgent", "ADJUST_STOCK", f"Draft Stock Adjustment: {prod.name}", role,
                lambda: build_stock_adjustment_draft(db, ctx, product_id=prod.id, quantity_delta=qty_delta, reason=reason, conversation_id=conv.id, task_id=task.id, language=eff_lang),
                is_mutating=True,
            )
            if ok_a and appr:
                approval_ids.append(appr.id)
                verified_dict["stock_adjustment"] = {"product_name": prod.name, "current_stock": float(prod.current_stock), "qty_delta": qty_delta, "new_stock": round(float(prod.current_stock) + qty_delta, 2)}
                verified_dict["approvals"] = [approval_to_out(appr).model_dump()]
                trace.add_agent("InventoryIntelligenceAgent", f"Prepared stock adjustment preview for {prod.name}: {qty_delta:+.2f} {prod.unit}.")
                reply_md = _L(
                    eff_lang,
                    f"Prepared a stock adjustment draft for **{prod.name}** (`{prod.current_stock} → {prod.current_stock + qty_delta:.2f} {prod.unit}`). Approve below to apply.",
                    f"**{prod.name}** ಸ್ಟಾಕ್ ತಿದ್ದುಪಡಿ ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ (`{prod.current_stock} → {prod.current_stock + qty_delta:.2f} {prod.unit}`). ದೃಢೀಕರಿಸಲು ಕೆಳಗೆ ಅನುಮೋದಿಸಿ.",
                    f"**{prod.name}** के लिए स्टॉक सुधार ड्राफ्ट तैयार है (`{prod.current_stock} → {prod.current_stock + qty_delta:.2f} {prod.unit}`)। नीचे से मंज़ूर करें।",
                )

    elif intent == "PROPOSE_PRICE_UPDATE":
        prod = _match_product_from_text(db, bid, clean_query)
        nums = re.findall(r"(?:to|₹|rs\.?|ಕ್ಕೆ)\s*(\d+(?:\.\d+)?)", clean_query, flags=re.IGNORECASE)
        new_price = float(nums[-1]) if nums else None
        if not prod or new_price is None:
            reply_md = _L(eff_lang, "Specify the product and target selling price (e.g., *Update price of Basmati Rice 1kg to 125*).", "ಉತ್ಪನ್ನದ ಹೆಸರು ಮತ್ತು ಹೊಸ ಮಾರಾಟ ಬೆಲೆ ತಿಳಿಸಿ.", "कृपया प्रोडक्ट और नया विक्रय मूल्य लिखें।")
        elif not is_tool_allowed(role, "UPDATE_PRODUCT_PRICE"):
            verified_dict["rbac_restricted"] = True
            trace.run_tool("FinancialAnalysisAgent", "UPDATE_PRODUCT_PRICE", "Propose Price Change", role, lambda: None, is_mutating=True)
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Updating Product Prices", "ಬೆಲೆ ಬದಲಾವಣೆ", "कीमत अपडेट"))
        else:
            ok_p, appr = trace.run_tool(
                "BusinessStrategyAgent", "UPDATE_PRODUCT_PRICE", f"Draft Price Update: {prod.name}", role,
                lambda: build_price_update_draft(db, ctx, product_id=prod.id, new_selling_price=new_price, conversation_id=conv.id, task_id=task.id, language=eff_lang),
                is_mutating=True,
            )
            if ok_p and appr:
                approval_ids.append(appr.id)
                verified_dict["price_update"] = {"product_name": prod.name, "old_price": float(prod.selling_price), "new_price": new_price}
                verified_dict["approvals"] = [approval_to_out(appr).model_dump()]
                trace.add_agent("BusinessStrategyAgent", f"Prepared price change preview for {prod.name}.")
                reply_md = _L(
                    eff_lang,
                    f"Prepared a selling price update for **{prod.name}** (₹{prod.selling_price:,.2f} → ₹{new_price:,.2f}). Approve below to apply.",
                    f"**{prod.name}** ಮಾರಾಟ ಬೆಲೆ ಬದಲಾವಣೆ ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ (₹{prod.selling_price:,.2f} → ₹{new_price:,.2f}). ಕೆಳಗೆ ಅನುಮೋದಿಸಿ.",
                    f"**{prod.name}** की नई कीमत का ड्राफ्ट तैयार है (₹{prod.selling_price:,.2f} → ₹{new_price:,.2f})।",
                )

    elif intent == "PROPOSE_EXPENSE":
        amt_m = re.search(r"(\d+(?:\.\d+)?)", clean_query)
        amount = float(amt_m.group(1)) if amt_m else None
        if amount is None or amount <= 0:
            reply_md = _L(eff_lang, "Specify expense description and amount (e.g., *Record expense Packaging Bags 450*).", "ಖರ್ಚಿನ ವಿವರ ಮತ್ತು ಮೊತ್ತ ತಿಳಿಸಿ (ಉದಾ: *ವಿದ್ಯುತ್ ಬಿಲ್ 450 ಖರ್ಚು ಸೇರಿಸಿ*).", "खर्च का विवरण और राशि बताएँ।")
        elif not is_tool_allowed(role, "RECORD_EXPENSE"):
            verified_dict["rbac_restricted"] = True
            trace.run_tool("FinancialAnalysisAgent", "RECORD_EXPENSE", "Propose Operating Expense", role, lambda: None, is_mutating=True)
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Recording Operating Expenses", "ವೆಚ್ಚ ದಾಖಲಿಸುವುದು", "खर्च दर्ज करना"))
        else:
            title_clean = re.sub(r"(?i)^(record|log|add)\s+expense\s*", "", clean_query)
            title_clean = re.sub(r"(?:rs\.?|inr|₹)?\s*\d+(?:\.\d+)?", "", title_clean).strip(" :-") or "Store Operating Expense"
            cat = "ELECTRICITY" if "electric" in clean_query.lower() or "power" in clean_query.lower() else ("PACKAGING" if "packag" in clean_query.lower() else ("TRANSPORT" if "transport" in clean_query.lower() else "OTHER"))
            ok_e, appr = trace.run_tool(
                "FinancialAnalysisAgent", "RECORD_EXPENSE", f"Draft Expense Entry: {title_clean}", role,
                lambda: build_expense_approval_draft(db, ctx, title=title_clean, amount=amount, category=cat, conversation_id=conv.id, task_id=task.id, language=eff_lang),
                is_mutating=True,
            )
            if ok_e and appr:
                approval_ids.append(appr.id)
                verified_dict["expense_draft"] = {"title": title_clean, "amount": amount, "category": cat}
                verified_dict["approvals"] = [approval_to_out(appr).model_dump()]
                trace.add_agent("FinancialAnalysisAgent", f"Prepared ₹{amount:,.2f} expense draft ({cat}).")
                reply_md = _L(
                    eff_lang,
                    f"Prepared expense draft for **{title_clean}** (**₹{amount:,.2f}** under `{cat}`). Review and approve below.",
                    f"**{title_clean}** ವೆಚ್ಚ ಡ್ರಾಫ್ಟ್ (**₹{amount:,.2f}**) ಸಿದ್ಧವಾಗಿದೆ. ದಾಖಲಿಸಲು ಕೆಳಗೆ ಅನುಮೋದಿಸಿ.",
                    f"**{title_clean}** का खर्च ड्राफ्ट (**₹{amount:,.2f}**) तैयार है। नीचे से मंज़ूर करें।",
                )

    elif intent == "PROPOSE_KHATA_PAYMENT":
        cust = _match_customer_from_text(db, bid, clean_query)
        nums = re.findall(r"(\d+(?:\.\d+)?)", clean_query)
        amount = float(nums[-1]) if nums else None
        if not cust or amount is None:
            reply_md = _L(eff_lang, "Specify customer name and payment amount (e.g., *Record khata payment from Ramesh 500*).", "ಗ್ರಾಹಕರ ಹೆಸರು ಮತ್ತು ಪಾವತಿ ಮೊತ್ತ ತಿಳಿಸಿ.", "ग्राहक का नाम और भुगतान राशि बताएँ।")
        elif not is_tool_allowed(role, "RECORD_KHATA_PAYMENT"):
            verified_dict["rbac_restricted"] = True
            trace.run_tool("CustomerIntelligenceAgent", "RECORD_KHATA_PAYMENT", "Propose Khata Receipt", role, lambda: None, is_mutating=True)
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Recording Khata Payments", "ಖಾತಾ ಪಾವತಿ ದಾಖಲಿಸುವುದು", "खाता भुगतान दर्ज करना"))
        else:
            ok_k, appr = trace.run_tool(
                "CustomerIntelligenceAgent", "RECORD_KHATA_PAYMENT", f"Draft Khata Payment: {cust.name}", role,
                lambda: build_khata_payment_draft(db, ctx, customer_id=cust.id, amount=amount, conversation_id=conv.id, task_id=task.id, language=eff_lang),
                is_mutating=True,
            )
            if ok_k and appr:
                approval_ids.append(appr.id)
                verified_dict["khata_payment_draft"] = {"customer_name": cust.name, "amount": amount}
                verified_dict["approvals"] = [approval_to_out(appr).model_dump()]
                trace.add_agent("CustomerIntelligenceAgent", f"Prepared ₹{amount:,.2f} Khata settlement draft for {cust.name}.")
                reply_md = _L(
                    eff_lang,
                    f"Prepared Khata payment draft for **{cust.name}** (**₹{amount:,.2f}**). Approve below to update balance.",
                    f"**{cust.name}** ರವರ **₹{amount:,.2f}** ಖಾತಾ ಪಾವತಿ ಡ್ರಾಫ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ. ಬಾಕಿ ನವೀಕರಿಸಲು ಕೆಳಗೆ ಅನುಮೋದಿಸಿ.",
                    f"**{cust.name}** के लिए **₹{amount:,.2f}** खाता भुगतान ड्राफ्ट तैयार है।",
                )

    elif intent == "DOCUMENT_ANALYSIS":
        doc = None
        if document_id:
            doc = db.query(AIDocument).filter(AIDocument.id == document_id, AIDocument.business_id == bid).first()
        if not doc:
            doc = db.query(AIDocument).filter(AIDocument.business_id == bid).order_by(desc(AIDocument.created_at)).first()
        if not doc:
            reply_md = _L(eff_lang, "No uploaded document found yet. Click **+** in the search bar to upload a bill, quote, CSV, or XLSX file.", "ಇನ್ನೂ ಯಾವುದೇ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಆಗಿಲ್ಲ. ಸರ್ಚ್ ಬಾರ್‌ನಲ್ಲಿರುವ **+** ಬಟನ್ ಮೂಲಕ ಬಿಲ್ ಅಥವಾ CSV ಫೈಲ್ ಸೇರಿಸಿ.", "अभी कोई दस्तावेज़ अपलोड नहीं हुआ है।")
        else:
            extracted = json.loads(doc.extracted_json or "{}")
            verified_dict["document"] = {"filename": doc.filename, "document_type": doc.document_type, "extracted": extracted}
            trace.add_agent("DocumentIntelligenceAgent", f"Analyzed '{doc.filename}' ({doc.document_type}): {extracted.get('items_count', 0)} lines parsed.")
            lines = extracted.get("line_items", [])
            if is_deep and lines:
                tables.append(
                    AITableSpec(
                        table_id="doc_items_table",
                        title=_L(eff_lang, f"Extracted Items — {doc.filename}", f"ಫೈಲ್ ವಿವರಗಳು — {doc.filename}", f"निकाले गए आइटम — {doc.filename}"),
                        columns=[_L(eff_lang, "Line Item", "ವಸ್ತು", "आइटम"), _L(eff_lang, "Qty", "ಪ್ರಮಾಣ", "मात्रा"), _L(eff_lang, "Unit Cost", "ದರ", "दर"), _L(eff_lang, "Matched SKU", "ಹೊಂದಾಣಿಕೆ", "मैच"), _L(eff_lang, "Cost Delta", "ಬೆಲೆ ಬದಲಾವಣೆ", "अंतर")],
                        rows=[[l.get("item_name", ""), str(l.get("quantity", 0)), f"₹{float(l.get('unit_cost', 0)):,.2f}", l.get("matched_product_name") or "Unmatched", f"{l['cost_change_percent']:+.1f}%" if l.get("cost_change_percent") is not None else "—"] for l in lines[:15]],
                    )
                )
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Line Items", "ಒಟ್ಟು ಸಾಲುಗಳು", "कुल आइटम"), value=str(extracted.get("items_count", 0)), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Catalog Matches", "ಹೊಂದಾಣಿಕೆ ವಸ್ತುಗಳು", "कैटलॉग मैच"), value=str(extracted.get("matched_items_count", 0)), tone="positive" if extracted.get("matched_items_count", 0) > 0 else "warning"),
                    AIKpiMetric(label=_L(eff_lang, "Computed Subtotal", "ಒಟ್ಟು ಮೊತ್ತ", "कुल राशि"), value=f"₹{extracted.get('math_check', {}).get('computed_subtotal', 0):,.2f}", tone="neutral"),
                ]
            if is_tool_allowed(role, "IMPORT_DOCUMENT_ITEMS") and extracted.get("matched_items_count", 0) > 0:
                appr = build_document_import_draft(db, ctx, document=doc, extracted=extracted, conversation_id=conv.id, task_id=task.id, language=eff_lang)
                if appr:
                    approval_ids.append(appr.id)
                    verified_dict["approvals"] = [approval_to_out(appr).model_dump()]
            warnings = extracted.get("warnings", [])
            warn_md = "\n\n**Notes:**\n" + "\n".join(f"- {w}" for w in warnings) if warnings else ""
            reply_md = _L(
                eff_lang,
                f"Analyzed **`{doc.filename}`** (`{doc.document_type}`): extracted **{extracted.get('items_count', 0)}** line item(s), with **{extracted.get('matched_items_count', 0)}** matched to your catalog." + warn_md,
                f"**`{doc.filename}`** ಪರಿಶೀಲಿಸಲಾಗಿದೆ: ಒಟ್ಟು **{extracted.get('items_count', 0)}** ವಸ್ತುಗಳು ಸಿಕ್ಕಿವೆ (**{extracted.get('matched_items_count', 0)}** ನಿಮ್ಮ ಅಂಗಡಿ ಪಟ್ಟಿಗೆ ಹೊಂದಾಣಿಕೆಯಾಗಿವೆ).",
                f"**`{doc.filename}`** की जाँच पूरी हुई: कुल **{extracted.get('items_count', 0)}** आइटम मिले (**{extracted.get('matched_items_count', 0)}** कैटलॉग से मैच हुए)।",
            )
            if approval_ids:
                reply_md += _L(eff_lang, "\n\nAn **Import Approval Draft** is ready below.", "\n\nಸ್ಟಾಕ್ ಸೇರಿಸಲು **ಅನುಮೋದನೆ ಡ್ರಾಫ್ಟ್** ಕೆಳಗಿದೆ.", "\n\nस्टॉक जोड़ने के लिए **मंज़ूरी ड्राफ्ट** नीचे तैयार है।")

    elif intent == "WHAT_IF_SIMULATION":
        q_low = clean_query.lower()
        nums = re.findall(r"([+-]?\d+(?:\.\d+)?)", clean_query)
        val = float(nums[0]) if nums else 10.0
        if any(w in q_low for w in ["delay", "late", "supplier", "ತಡ", "ಸರಬರಾಜು"]):
            kind = "SUPPLIER_DELAY"
        elif any(w in q_low for w in ["demand", "festival", "surge", "drop", "slump", "ಹಬ್ಬ", "ಬೇಡಿಕೆ"]):
            kind = "DEMAND_SHOCK"
            if any(w in q_low for w in ["drop", "decrease", "slump", "fall", "down", "ಕಡಿಮೆ"]):
                val = -abs(val)
        else:
            kind = "PRICE_ELASTICITY"
            if any(w in q_low for w in ["cut", "reduce", "decrease", "discount", "lower", "ಕಡಿಮೆ"]):
                val = -abs(val)
        matched_prod = _match_product_from_text(db, bid, clean_query)
        ok_s, sim = trace.run_tool(
            "BusinessStrategyAgent", "what_if_simulation", f"Run {kind} Scenario", role,
            lambda: tool_what_if_scenario(db, ctx, kind, val, product_id=matched_prod.id if matched_prod else None),
        )
        if not ok_s:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "What-If Financial & Pricing Simulation", "ಸನ್ನಿವೇಶ ಸಿಮ್ಯುಲೇಶನ್", "व्हाट-इफ सिमुलेशन"))
        else:
            verified_dict["simulation"] = sim
            data_quality = "HYPOTHETICAL_SIMULATION"
            trace.add_agent("BusinessStrategyAgent", f"Simulated {kind} ({val}) with explicit elasticity/velocity assumptions.")
            trace.add_agent("ForecastingAgent", "Evaluated baseline daily burn rate against hypothetical shift.")
            assumptions = [sim.get("assumptions", f"Scenario parameter: {val}"), sim.get("non_guarantee_disclaimer", "Simulated estimate only.")]
            if kind == "SUPPLIER_DELAY":
                if is_deep:
                    kpis = [
                        AIKpiMetric(label=_L(eff_lang, "At-Risk SKUs", "ಅಪಾಯದಲ್ಲಿರುವ ವಸ್ತುಗಳು", "प्रभावित आइटम"), value=str(sim["stockout_products_count"]), tone="critical" if sim["stockout_products_count"] > 0 else "positive", data_type="HYPOTHETICAL_SIMULATION"),
                        AIKpiMetric(label=_L(eff_lang, "Potential Lost Sales", "ಸಂಭಾವ್ಯ ಮಾರಾಟ ನಷ್ಟ", "संभावित नुकसान"), value=f"₹{sim['total_potential_lost_revenue']:,.2f}", tone="warning", data_type="HYPOTHETICAL_SIMULATION"),
                    ]
                reply_md = _L(
                    eff_lang,
                    f"If supplier deliveries are delayed by **+{int(val)} day(s)**: **{sim['stockout_products_count']}** item(s) risk running out, exposing up to **₹{sim['total_potential_lost_revenue']:,.2f}** in estimated sales.\n\n{sim['recommendation']}",
                    f"ಸರಬರಾಜು **+{int(val)} ದಿನ** ತಡವಾದರೆ **{sim['stockout_products_count']}** ವಸ್ತುಗಳು ಖಾಲಿಯಾಗುವ ಅಪಾಯವಿದೆ (ಅಂದಾಜು **₹{sim['total_potential_lost_revenue']:,.2f}** ಮಾರಾಟ ನಷ್ಟವಾಗಬಹುದು).\n\n{translate_text(sim['recommendation'], 'kn')}",
                    f"यदि सप्लाई **+{int(val)} दिन** लेट होती है, तो **{sim['stockout_products_count']}** प्रोडक्ट्स खत्म हो सकते हैं (अनुमानित बिक्री असर **₹{sim['total_potential_lost_revenue']:,.2f}**)।",
                )
            elif kind == "DEMAND_SHOCK":
                if is_deep:
                    kpis = [
                        AIKpiMetric(label=_L(eff_lang, "Critical SKUs", "ತುರ್ತು ವಸ್ತುಗಳು", "गंभीर आइटम"), value=str(sim["critical_lines_count"]), tone="warning", data_type="HYPOTHETICAL_SIMULATION"),
                        AIKpiMetric(label=_L(eff_lang, "Reorder Capital", "ಅಗತ್ಯ ಬಂಡವಾಳ", "ज़रूरी पूंजी"), value=f"₹{sim['total_capital_needed_for_reorder']:,.2f}", tone="info", data_type="HYPOTHETICAL_SIMULATION"),
                        AIKpiMetric(label=_L(eff_lang, "Est. Monthly Profit Δ", "ತಿಂಗಳ ಲಾಭದ ಅಂದಾಜು", "मुनाफा असर"), value=f"{sim['projected_additional_profit']:+,.2f}", tone="positive" if sim["projected_additional_profit"] >= 0 else "warning", data_type="HYPOTHETICAL_SIMULATION"),
                    ]
                reply_md = _L(
                    eff_lang,
                    f"Under a **{val:+.1f}% demand shift**, **{sim['critical_lines_count']}** SKU(s) would require priority replenishment (~₹{sim['total_capital_needed_for_reorder']:,.2f}) with an estimated monthly profit impact of **{sim['projected_additional_profit']:+,.2f}** *(simulated)*.",
                    f"**{val:+.1f}% ಬೇಡಿಕೆ ಬದಲಾವಣೆ**ಯಾದರೆ **{sim['critical_lines_count']}** ವಸ್ತುಗಳಿಗೆ ತಕ್ಷಣ ಮರುಖರೀದಿ ಬೇಕಾಗುತ್ತದೆ (~₹{sim['total_capital_needed_for_reorder']:,.2f}). ಅಂದಾಜು ತಿಂಗಳ ಲಾಭದ ಬದಲಾವಣೆ **{sim['projected_additional_profit']:+,.2f}** *(ಅಂದಾಜು ಲೆಕ್ಕ)*.",
                    f"**{val:+.1f}% मांग बदलाव** पर **{sim['critical_lines_count']}** आइटम जल्दी रीस्टॉक करने होंगे (~₹{sim['total_capital_needed_for_reorder']:,.2f})।",
                )
            else:
                if is_deep:
                    kpis = [
                        AIKpiMetric(label=_L(eff_lang, "Baseline Monthly Profit", "ಪ್ರಸ್ತುತ ತಿಂಗಳ ಲಾಭ", "वर्तमान मुनाफा"), value=f"₹{sim['total_baseline_monthly_profit']:,.2f}", tone="neutral"),
                        AIKpiMetric(label=_L(eff_lang, "Simulated Monthly Profit", "ಅಂದಾಜು ತಿಂಗಳ ಲಾಭ", "अनुमानित मुनाफा"), value=f"₹{sim['total_simulated_monthly_profit']:,.2f}", delta=f"{sim['monthly_profit_delta']:+,.2f}", tone="positive" if sim["monthly_profit_delta"] >= 0 else "critical", data_type="HYPOTHETICAL_SIMULATION"),
                    ]
                    charts.append(
                        AIChartSpec(
                            chart_id="price_elasticity_compare",
                            title=_L(eff_lang, f"Baseline vs Simulated P&L ({val:+.1f}%)", f"ಬೆಲೆ ಬದಲಾವಣೆ ಅಂದಾಜು ({val:+.1f}%)", f"कीमत बदलाव अनुमान ({val:+.1f}%)"),
                            chart_type="bar",
                            unit_prefix="₹",
                            data_type="HYPOTHETICAL_SIMULATION",
                            series_label=_L(eff_lang, "Baseline", "ಪ್ರಸ್ತುತ", "वर्तमान"),
                            secondary_label=_L(eff_lang, "Simulated", "ಅಂದಾಜು", "अनुमानित"),
                            points=[
                                AIChartPoint(label=_L(eff_lang, "Monthly Revenue", "ಮಾಸಿಕ ಮಾರಾಟ", "मासिक बिक्री"), value=sim["total_baseline_monthly_revenue"], secondary_value=sim["total_simulated_monthly_revenue"]),
                                AIChartPoint(label=_L(eff_lang, "Monthly Profit", "ಮಾಸಿಕ ಲಾಭ", "मासिक मुनाफा"), value=sim["total_baseline_monthly_profit"], secondary_value=sim["total_simulated_monthly_profit"]),
                            ],
                        )
                    )
                reply_md = _L(
                    eff_lang,
                    f"Simulating a **{val:+.1f}% price change**: estimated monthly profit changes by **{sim['monthly_profit_delta']:+,.2f}** (₹{sim['total_baseline_monthly_profit']:,.2f} → **₹{sim['total_simulated_monthly_profit']:,.2f}**).\n\n{sim['recommendation']} *(Simulated estimate assuming elasticity {sim['elasticity_coefficient']}.)*",
                    f"ಬೆಲೆಯನ್ನು **{val:+.1f}% ಬದಲಾಯಿಸಿದರೆ** ಅಂದಾಜು ಮಾಸಿಕ ಲಾಭ **{sim['monthly_profit_delta']:+,.2f}** ರಷ್ಟು ಬದಲಾಗಬಹುದು (₹{sim['total_baseline_monthly_profit']:,.2f} → **₹{sim['total_simulated_monthly_profit']:,.2f}**). *(ಇದು ಅಂದಾಜು ಲೆಕ್ಕಾಚಾರವಾಗಿದೆ)*.",
                    f"**{val:+.1f}% कीमत बदलाव** पर मासिक मुनाफे में अनुमानित अंतर **{sim['monthly_profit_delta']:+,.2f}** हो सकता है।",
                )

    elif intent == "DEMAND_FORECAST":
        ok_f, pred = trace.run_tool("ForecastingAgent", "demand_forecasting", "Store & SKU Statistical Forecasting", role, lambda: get_comprehensive_predictive_snapshot(db, bid))
        if not ok_f:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Predictive Revenue & Demand Forecasting", "ಬೇಡಿಕೆ ಮತ್ತು ಮಾರಾಟ ಮುನ್ಸೂಚನೆ", "बिक्री और मांग पूर्वानुमान"))
        else:
            verified_dict["demand_forecasting"] = pred
            rev7 = pred["revenue_forecast_7d"]
            rev30 = pred["revenue_forecast_30d"]
            data_quality = rev7.get("confidence_level", "BASELINE")
            assumptions = list(rev7.get("assumptions", []))
            trace.add_agent("ForecastingAgent", f"Evaluated revenue trend ({rev7['method']}) and {pred['stockout_within_7d_count']} <7d stockout SKU(s).")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "7-Day Forecast", "7 ದಿನದ ಅಂದಾಜು ಮಾರಾಟ", "7 दिन का अनुमान"), value=f"₹{rev7['projected_revenue']:,.2f}", delta=f"₹{rev7['lower_bound']:,.0f}-₹{rev7['upper_bound']:,.0f}", tone="info", data_type="FORECAST"),
                    AIKpiMetric(label=_L(eff_lang, "30-Day Forecast", "30 ದಿನದ ಅಂದಾಜು ಮಾರಾಟ", "30 दिन का अनुमान"), value=f"₹{rev30['projected_revenue']:,.2f}", delta=rev7["confidence_level"], tone="neutral", data_type="FORECAST"),
                    AIKpiMetric(label=_L(eff_lang, "<7d Stockout Risks", "<7 ದಿನದಲ್ಲಿ ಖಾಲಿ", "7 दिन में स्टॉकआउट"), value=str(pred["stockout_within_7d_count"]), tone="critical" if pred["stockout_within_7d_count"] > 0 else "positive"),
                ]
                if rev7.get("daily_series"):
                    charts.append(
                        AIChartSpec(
                            chart_id="rev_forecast_7d",
                            title=_L(eff_lang, "Projected Daily Revenue (Next 7 Days — Estimate)", "ಮುಂದಿನ 7 ದಿನಗಳ ಅಂದಾಜು ಮಾರಾಟ", "अगले 7 दिनों की अनुमानित बिक्री"),
                            chart_type="line",
                            unit_prefix="₹",
                            data_type="FORECAST",
                            series_label=_L(eff_lang, "Expected Sales", "ಅಂದಾಜು ಮಾರಾಟ", "अनुमानित बिक्री"),
                            secondary_label=_L(eff_lang, "Upper Bound", "ಗರಿಷ್ಠ ಅಂದಾಜು", "ऊपरी सीमा"),
                            points=[AIChartPoint(label=pt["day"], value=pt["projected_sales"], secondary_value=pt["upper_bound"]) for pt in rev7["daily_series"]],
                        )
                    )
                if pred["stockouts_within_7d"]:
                    tables.append(
                        AITableSpec(
                            table_id="stockouts_7d_table",
                            title=_L(eff_lang, "SKUs Projected to Stock Out Within 7 Days", "7 ದಿನಗಳಲ್ಲಿ ಖಾಲಿಯಾಗಬಹುದಾದ ವಸ್ತುಗಳು", "7 दिनों में खत्म होने वाले आइटम"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Stock", "ಸ್ಟಾಕ್", "स्टॉक"), _L(eff_lang, "Daily Burn", "ದಿನದ ಮಾರಾಟ", "दैनिक बिक्री"), _L(eff_lang, "Days Left", "ಬಾಕಿ ದಿನ", "बचे दिन"), _L(eff_lang, "Order Qty", "ಆರ್ಡರ್ ಪ್ರಮಾಣ", "ऑर्डर मात्रा")],
                            rows=[[s["product_name"], f"{s['current_stock']:g} {s['unit']}", f"{s['daily_demand']:.1f}/d", f"{s['days_left']:.1f}d", f"{s['recommended_order_qty']:g}"] for s in pred["stockouts_within_7d"][:8]],
                        )
                    )
            reply_md = _L(
                eff_lang,
                f"Over the next **7 days**, projected sales are **₹{rev7['projected_revenue']:,.2f}** (estimate range ₹{rev7['lower_bound']:,.0f}–₹{rev7['upper_bound']:,.0f}; 30-day projection **₹{rev30['projected_revenue']:,.2f}**). **{pred['stockout_within_7d_count']}** product(s) may run out within 7 days *(Forecast: {rev7['confidence_level']} confidence)*.",
                f"ಮುಂದಿನ **7 ದಿನಗಳಲ್ಲಿ** ಅಂದಾಜು ಮಾರಾಟ **₹{rev7['projected_revenue']:,.2f}** (ವ್ಯಾಪ್ತಿ ₹{rev7['lower_bound']:,.0f} – ₹{rev7['upper_bound']:,.0f}; 30 ದಿನಗಳ ಅಂದಾಜು **₹{rev30['projected_revenue']:,.2f}**). **{pred['stockout_within_7d_count']}** ವಸ್ತುಗಳು 7 ದಿನಗಳಲ್ಲಿ ಖಾಲಿಯಾಗಬಹುದು.",
                f"अगले **7 दिनों** में अनुमानित बिक्री **₹{rev7['projected_revenue']:,.2f}** है (30 दिनों का अनुमान **₹{rev30['projected_revenue']:,.2f}**)। **{pred['stockout_within_7d_count']}** प्रोडक्ट्स 7 दिनों में खत्म हो सकते हैं।",
            )
            follow_ups = [_L(eff_lang, "Prepare purchase draft for <7d stockout items", "7 ದಿನದಲ್ಲಿ ಖಾಲಿಯಾಗುವ ವಸ್ತುಗಳಿಗೆ PO ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "7 दिन में खत्म होने वाले सामान का PO ड्राफ्ट बनाओ")]

    elif intent == "DAILY_BRIEFING_ALERTS":
        ok_b, brief = trace.run_tool("ReportingAgent", "daily_briefing", "Compile Daily Intelligence Briefing & Proactive Risks", role, lambda: build_daily_briefing(db, ctx, commit=False))
        if not ok_b:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Executive Daily Business Briefing", "ದೈನಂದಿನ ವ್ಯಾಪಾರ ವರದಿ", "दैनिक बिज़नेस रिपोर्ट"))
        else:
            verified_dict["briefing"] = brief.model_dump()
            trace.add_agent("ReportingAgent", f"Ran proactive health scanner and surfaced {len(brief.top_risks)} risk alert(s).")
            if is_deep:
                kpis = brief.kpis
                actions = brief.recommended_actions
                if brief.top_risks:
                    tables.append(
                        AITableSpec(
                            table_id="briefing_risks",
                            title=_L(eff_lang, "Active Proactive Risk Alerts", "ಸಕ್ರಿಯ ಅಂಗಡಿ ಎಚ್ಚರಿಕೆಗಳು", "सक्रिय स्टोर अलर्ट"),
                            columns=[_L(eff_lang, "Severity", "ತೀವ್ರತೆ", "गंभीरता"), _L(eff_lang, "Risk Title", "ಎಚ್ಚರಿಕೆ", "चेतावनी"), _L(eff_lang, "What Happened", "ವಿವರ", "विवरण"), _L(eff_lang, "Recommended Action", "ಸಲಹೆ", "सुझाव")],
                            rows=[[a.severity, translate_text(a.title, eff_lang), translate_text(a.what_happened, eff_lang), translate_text(a.recommended_action, eff_lang)] for a in brief.top_risks],
                        )
                    )
            if eff_lang == "kn":
                risk_lines = "\n".join(f"- **{translate_text(a.title, 'kn')}** ({a.severity}): {translate_text(a.recommended_action, 'kn')}" for a in brief.top_risks[:4])
                reply_md = (
                    f"**{ctx.business.name} — ಇಂದಿನ ವ್ಯಾಪಾರ ಸಾರಾಂಶ:**\n\n"
                    f"- ಇಂದಿನ ಮಾರಾಟ: **{brief.kpis[0].value if brief.kpis else '₹0.00'}** · ಈ ತಿಂಗಳ ಲಾಭ: **{brief.kpis[1].value if len(brief.kpis) > 1 else '₹0.00'}**\n"
                    f"- ದಾಸ್ತಾನು ಮೌಲ್ಯ: **{brief.kpis[2].value if len(brief.kpis) > 2 else '₹0.00'}** · ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ: **{brief.kpis[3].value if len(brief.kpis) > 3 else '₹0.00'}**\n\n"
                    + (f"**ಗಮನಿಸಬೇಕಾದ ಎಚ್ಚರಿಕೆಗಳು ({len(brief.top_risks)}):**\n{risk_lines}" if brief.top_risks else "ಸದ್ಯ ಅಂಗಡಿಯಲ್ಲಿ ಯಾವುದೇ ತುರ್ತು ಅಪಾಯಗಳಿಲ್ಲ!")
                )
            elif eff_lang == "hi":
                risk_lines = "\n".join(f"- **{translate_text(a.title, 'hi')}** ({a.severity})" for a in brief.top_risks[:4])
                reply_md = (
                    f"**{ctx.business.name} — आज की रिपोर्ट:**\n\n"
                    f"- आज की बिक्री: **{brief.kpis[0].value if brief.kpis else '₹0.00'}** · इस महीने का मुनाफा: **{brief.kpis[1].value if len(brief.kpis) > 1 else '₹0.00'}**\n"
                    + (f"\n**मुख्य अलर्ट ({len(brief.top_risks)}):**\n{risk_lines}" if brief.top_risks else "\nअभी कोई गंभीर चेतावनी नहीं है!")
                )
            else:
                if is_deep:
                    reply_md = brief.summary_markdown
                else:
                    risk_lines = "\n".join(f"- **{a.title}** ({a.severity}) — {a.recommended_action}" for a in brief.top_risks[:4])
                    reply_md = (
                        f"Here's today's pulse for **{ctx.business.name}**: today's sales **{brief.kpis[0].value if brief.kpis else '₹0.00'}**, MTD profit **{brief.kpis[1].value if len(brief.kpis) > 1 else '₹0.00'}**, Khata due **{brief.kpis[3].value if len(brief.kpis) > 3 else '₹0.00'}**.\n\n"
                        + (f"**Active alerts ({len(brief.top_risks)}):**\n{risk_lines}" if brief.top_risks else "Everything looks healthy with no urgent store alerts.")
                    )
            follow_ups = [_L(eff_lang, "Prepare a replenishment PO draft", "ಕಡಿಮೆ ಸ್ಟಾಕ್‌ಗೆ PO ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "कम स्टॉक के लिए PO ड्राफ्ट बनाओ")]

    elif intent == "KHATA_RECEIVABLES":
        ok_k, khata = trace.run_tool("CustomerIntelligenceAgent", "khata_receivables", "Inspect Customer Khata Ledger", role, lambda: tool_khata_receivables(db, ctx))
        if not ok_k:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Customer Khata Receivables", "ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ", "ग्राहक खाता बकाया"))
        elif ok_k:
            verified_dict["khata"] = khata
            trace.add_agent("CustomerIntelligenceAgent", f"Scanned {khata['total_customers']} customer(s); ₹{khata['total_receivable']:,.2f} total due.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Total Khata Due", "ಒಟ್ಟು ಖಾತಾ ಬಾಕಿ", "कुल खाता बकाया"), value=f"₹{khata['total_receivable']:,.2f}", tone="warning" if khata["total_receivable"] > 0 else "positive"),
                    AIKpiMetric(label=_L(eff_lang, "Customers With Balance", "ಬಾಕಿ ಇರುವ ಗ್ರಾಹಕರು", "बकाया ग्राहक"), value=str(khata["debtors_count"]), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Pending Credit Bills", "ಬಾಕಿ ಉದ್ರಿ ಬಿಲ್‌ಗಳು", "बकाया उधार बिल"), value=str(len(khata["pending_credit_invoices"])), tone="neutral"),
                ]
                if khata["top_debtors"]:
                    tables.append(
                        AITableSpec(
                            table_id="khata_table",
                            title=_L(eff_lang, "Top Pending Customer Khata Balances", "ಪ್ರಮುಖ ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ ಪಟ್ಟಿ", "प्रमुख बकाया खाता सूची"),
                            columns=[_L(eff_lang, "Customer", "ಗ್ರಾಹಕ", "ग्राहक"), _L(eff_lang, "Phone", "ಮೊಬೈಲ್", "फ़ोन"), _L(eff_lang, "Outstanding (₹)", "ಬಾಕಿ (₹)", "बकाया (₹)")],
                            rows=[[d["name"], d["phone"] or "—", f"₹{d['outstanding_balance']:,.2f}"] for d in khata["top_debtors"]],
                        )
                    )
            if khata["top_debtors"]:
                top_list = "\n".join(f"- **{d['name']}** ({d['phone'] or '—'}): **₹{d['outstanding_balance']:,.2f}**" for d in khata["top_debtors"][:5])
                reply_md = _L(
                    eff_lang,
                    f"Total pending Customer Khata receivable is **₹{khata['total_receivable']:,.2f}** across **{khata['debtors_count']}** account(s):\n\n{top_list}",
                    f"ಗ್ರಾಹಕರಿಂದ ಬರಬೇಕಾದ ಒಟ್ಟು ಖಾತಾ ಬಾಕಿ **₹{khata['total_receivable']:,.2f}** (**{khata['debtors_count']}** ಗ್ರಾಹಕರು):\n\n{top_list}",
                    f"ग्राहकों से कुल बकाया खाता राशि **₹{khata['total_receivable']:,.2f}** है (**{khata['debtors_count']}** ग्राहक):\n\n{top_list}",
                )
            else:
                reply_md = _L(eff_lang, "Zero pending Customer Khata dues right now.", "ಸದ್ಯ ಯಾವುದೇ ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ ಇಲ್ಲ.", "अभी किसी ग्राहक पर कोई खाता बकाया नहीं है।")
            actions = [AIActionShortcut(label=_L(eff_lang, "Open Customers & Khata", "ಗ್ರಾಹಕರ ಖಾತಾ ತೆರೆಯಿರಿ", "ग्राहक खाता खोलें"), target_tab="customers")]

    elif intent == "CASH_TILL":
        ok_c, till = trace.run_tool("FinancialAnalysisAgent", "cash_till_status", "Inspect Live Cash Register Shift", role, lambda: tool_cash_till_status(db, ctx))
        if not ok_c:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Cash Register Drawer Inspection", "ನಗದು ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ ಪರಿಶೀಲನೆ", "कैश ड्रॉअर जाँच"))
        elif ok_c:
            verified_dict["cash_till"] = till
            trace.add_agent("FinancialAnalysisAgent", "Verified current user's cash drawer shift totals.")
            if till["has_open_shift"] and till["open_shift"]:
                s = till["open_shift"]
                if is_deep:
                    kpis = [
                        AIKpiMetric(label=_L(eff_lang, "Shift Status", "ಶಿಫ್ಟ್ ಸ್ಥಿತಿ", "शिफ्ट स्थिति"), value="OPEN", tone="positive"),
                        AIKpiMetric(label=_L(eff_lang, "Expected Cash", "ನಿರೀಕ್ಷಿತ ನಗದು", "अपेक्षित कैश"), value=f"₹{s['expected_cash']:,.2f}", tone="info"),
                        AIKpiMetric(label=_L(eff_lang, "Cash Sales", "ನಗದು ಮಾರಾಟ", "नकद बिक्री"), value=f"₹{s['cash_sales']:,.2f}", tone="neutral"),
                    ]
                reply_md = _L(
                    eff_lang,
                    f"Your cash drawer shift (#{s['shift_id']}) is **OPEN** since {s['opened_at']} (float ₹{s['opening_float']:,.2f}). Expected drawer cash right now is **₹{s['expected_cash']:,.2f}** (cash sales ₹{s['cash_sales']:,.2f}).",
                    f"ನಿಮ್ಮ ನಗದು ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ (#{s['shift_id']}) **ತೆರೆದಿದೆ** (ಆರಂಭಿಕ ನಗದು ₹{s['opening_float']:,.2f}). ಸದ್ಯ ಡ್ರಾಯರ್‌ನಲ್ಲಿ ಇರಬೇಕಾದ ನಗದು **₹{s['expected_cash']:,.2f}**.",
                    f"आपका कैश ड्रॉअर शिफ्ट (#{s['shift_id']}) **खुला** है। अपेक्षित नकद राशि **₹{s['expected_cash']:,.2f}** है।",
                )
            else:
                reply_md = _L(eff_lang, "Your cash drawer shift is currently **CLOSED**.", "ನಗದು ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ (Shift) ಸದ್ಯ **ಮುಚ್ಚಲಾಗಿದೆ**.", "कैश ड्रॉअर शिफ्ट अभी **बंद** है।")

    elif intent == "EXPIRY_RISK":
        ok_x, exp = trace.run_tool("InventoryIntelligenceAgent", "expiring_batches", "Scan Product Batches for Expiry Risk", role, lambda: tool_expiring_batches(db, ctx, days_ahead=30))
        if not ok_x:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Expiring Batch Inspection", "ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್ ಪರಿಶೀಲನೆ", "एक्सपायरी बैच जाँच"))
        elif ok_x:
            verified_dict["expiry"] = exp
            trace.add_agent("InventoryIntelligenceAgent", f"Scanned FEFO batches expiring in 30d: {exp['expiring_batches_count']} found.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Expiring Batches (30d)", "ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್‌ಗಳು", "एक्सपायर होने वाले बैच"), value=str(exp["expiring_batches_count"]), tone="warning" if exp["expiring_batches_count"] > 0 else "positive"),
                    AIKpiMetric(label=_L(eff_lang, "At-Risk Stock Value", "ಅಪಾಯದಲ್ಲಿರುವ ಮೌಲ್ಯ", "जोखिम वाला मूल्य"), value=f"₹{exp['total_at_risk_value']:,.2f}", tone="critical" if exp["total_at_risk_value"] > 0 else "neutral"),
                ]
                if exp["batches"]:
                    tables.append(
                        AITableSpec(
                            table_id="expiry_table",
                            title=_L(eff_lang, "Expiring / Expired Inventory Batches", "ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್ ಪಟ್ಟಿ", "एक्सपायरी बैच सूची"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Batch #", "ಬ್ಯಾಚ್", "बैच"), _L(eff_lang, "Qty", "ಪ್ರಮಾಣ", "मात्रा"), _L(eff_lang, "Expiry Date", "ಅವಧಿ ದಿನಾಂಕ", "तारीख"), _L(eff_lang, "Days Left", "ಬಾಕಿ ದಿನ", "बचे दिन")],
                            rows=[[b["product_name"], b["batch_number"], f"{b['quantity']:g} {b['unit']}", b["expiry_date"], f"{b['days_remaining']}d"] for b in exp["batches"]],
                        )
                    )
            if exp["batches"]:
                b_list = "\n".join(f"- **{b['product_name']}** (`{b['batch_number']}`): {b['quantity']:g} {b['unit']}, expires {b['expiry_date']} ({b['days_remaining']}d)" for b in exp["batches"][:5])
                reply_md = _L(
                    eff_lang,
                    f"Found **{exp['expiring_batches_count']}** batch(es) expiring within 30 days (**₹{exp['total_at_risk_value']:,.2f}** stock value):\n\n{b_list}",
                    f"ಮುಂದಿನ 30 ದಿನಗಳಲ್ಲಿ ಅವಧಿ ಮುಗಿಯಲಿರುವ **{exp['expiring_batches_count']}** ಬ್ಯಾಚ್‌ಗಳಿವೆ (**₹{exp['total_at_risk_value']:,.2f}** ಮೌಲ್ಯ):\n\n{b_list}",
                    f"अगले 30 दिनों में **{exp['expiring_batches_count']}** बैच एक्सपायर हो रहे हैं (**₹{exp['total_at_risk_value']:,.2f}**):\n\n{b_list}",
                )
            else:
                reply_md = _L(eff_lang, "No batches expiring in the next 30 days.", "ಮುಂದಿನ 30 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಬ್ಯಾಚ್‌ಗಳ ಅವಧಿ ಮುಗಿಯುತ್ತಿಲ್ಲ.", "अगले 30 दिनों में कोई बैच एक्सपायर नहीं हो रहा है।")

    elif intent == "AUDIT_ANOMALIES":
        ok_a, aud = trace.run_tool("ReportingAgent", "audit_anomalies", "Inspect Security Audit Trail & Anomalies", role, lambda: tool_audit_and_anomalies(db, ctx))
        if not ok_a:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Audit Logs & Financial Anomaly Review", "ಆಡಿಟ್ ಮತ್ತು ಅಸಹಜ ವಹಿವಾಟು ಪರಿಶೀಲನೆ", "ऑडिट व अनियमितता रिपोर्ट"))
        else:
            verified_dict["audit_anomalies"] = aud
            trace.add_agent("ReportingAgent", f"Audited {len(aud['pending_system_anomalies'])} anomaly alerts and recent audit trail.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "System Anomalies", "ಅಸಹಜ ಎಚ್ಚರಿಕೆಗಳು", "सिस्टम अनियमितताएँ"), value=str(len(aud["pending_system_anomalies"])), tone="warning"),
                    AIKpiMetric(label=_L(eff_lang, "Active AI Alerts", "AI ಎಚ್ಚರಿಕೆಗಳು", "सक्रिय AI अलर्ट"), value=str(len(aud["active_ai_alerts"])), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Audit Events", "ಆಡಿಟ್ ದಾಖಲೆಗಳು", "ऑडिट रिकॉर्ड"), value=str(len(aud["recent_audit_events"])), tone="neutral"),
                ]
                if aud["recent_audit_events"]:
                    tables.append(
                        AITableSpec(
                            table_id="audit_events_table",
                            title=_L(eff_lang, "Recent Immutable Audit Log Events", "ಇತ್ತೀಚಿನ ಆಡಿಟ್ ದಾಖಲೆಗಳು", "हाल के ऑडिट लॉग"),
                            columns=[_L(eff_lang, "Action", "ಕ್ರಿಯೆ", "कार्य"), _L(eff_lang, "Entity", "ವಿಭಾಗ", "इकाई"), "ID", _L(eff_lang, "Timestamp", "ಸಮಯ", "समय")],
                            rows=[[e["action"], e["entity_type"] or "—", e["entity_id"] or "—", e["created_at"]] for e in aud["recent_audit_events"][:8]],
                        )
                    )
            reply_md = _L(
                eff_lang,
                f"Currently tracking **{len(aud['pending_system_anomalies'])}** system anomaly alert(s), **{len(aud['active_ai_alerts'])}** active AI alert(s), and **{len(aud['recent_audit_events'])}** recent audit events.",
                f"ಸದ್ಯ **{len(aud['pending_system_anomalies'])}** ಅಸಹಜ ವಹಿವಾಟು ಎಚ್ಚರಿಕೆಗಳು, **{len(aud['active_ai_alerts'])}** AI ಅಲರ್ಟ್‌ಗಳು ಮತ್ತು **{len(aud['recent_audit_events'])}** ಇತ್ತೀಚಿನ ಆಡಿಟ್ ದಾಖಲೆಗಳಿವೆ.",
                f"अभी **{len(aud['pending_system_anomalies'])}** अनियमितता अलर्ट और **{len(aud['active_ai_alerts'])}** AI चेतावनी दर्ज हैं।",
            )

    elif intent == "GSTR1_REPORT":
        ok_g, gst = trace.run_tool("FinancialAnalysisAgent", "gstr1_summary", "Compile GSTR-1 Tax Statement Summary", role, lambda: tool_gstr1_summary(db, ctx))
        if not ok_g:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "GST Tax Filing & GSTR-1 Reports", "ಜಿಎಸ್‌ಟಿ ಮತ್ತು GSTR-1 ವರದಿ", "जीएसटी और GSTR-1 रिपोर्ट"))
        else:
            verified_dict["gstr1_summary"] = gst
            s = gst["summary"]
            trace.add_agent("FinancialAnalysisAgent", f"Compiled GSTR-1 summary for {s['net_invoices']} net invoices.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Taxable Value", "ತೆರಿಗೆ ಅರ್ಹ ಮೌಲ್ಯ", "कर योग्य राशि"), value=f"₹{s['total_taxable_value']:,.2f}", tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Total GST Collected", "ಒಟ್ಟು GST ತೆರಿಗೆ", "कुल GST"), value=f"₹{s['total_tax']:,.2f}", delta=f"CGST ₹{s['total_cgst']:,.0f} + SGST ₹{s['total_sgst']:,.0f}", tone="positive"),
                    AIKpiMetric(label=_L(eff_lang, "Grand Total Billed", "ಒಟ್ಟು ಬಿಲ್ ಮೊತ್ತ", "कुल बिल राशि"), value=f"₹{s['grand_total']:,.2f}", tone="neutral"),
                ]
            reply_md = _L(
                eff_lang,
                f"GSTR-1 summary (`{s['start_date']}` to `{s['end_date']}`): **{s['net_invoices']}** net bill(s), taxable value **₹{s['total_taxable_value']:,.2f}**, total GST **₹{s['total_tax']:,.2f}** (B2B bills: **{gst['b2b_count']}**).",
                f"GSTR-1 ತೆರಿಗೆ ಸಾರಾಂಶ (`{s['start_date']}` – `{s['end_date']}`): ಒಟ್ಟು **{s['net_invoices']}** ಬಿಲ್‌ಗಳು, ತೆರಿಗೆ ಅರ್ಹ ಮೌಲ್ಯ **₹{s['total_taxable_value']:,.2f}**, ಒಟ್ಟು GST ತೆರಿಗೆ **₹{s['total_tax']:,.2f}**.",
                f"GSTR-1 सारांश (`{s['start_date']}` से `{s['end_date']}`): **{s['net_invoices']}** बिल, कुल GST **₹{s['total_tax']:,.2f}**।",
            )

    elif intent == "INVENTORY_LOOKUP":
        pronouns = {"it", "its", "that", "this", "those", "them", "ಅದರ", "ಇದರ", "ಅದು", "ಇದು", "adara", "idara", "adu", "उसका", "इसकी", "उसकी", "यह", "वह"}
        q_tokens_low = set(re.findall(r"[\w\u0C80-\u0CFF\u0900-\u097F]+", clean_query.lower()))
        explicit_prod = _match_product_from_text(db, bid, clean_query)
        target_prod = explicit_prod
        if target_prod is None and prev_ctx.get("last_product_id") and (q_tokens_low & pronouns):
            target_prod = db.query(Product).filter(Product.id == prev_ctx["last_product_id"], Product.business_id == bid).first()
        lookup_text = target_prod.name if target_prod else clean_query

        ok_i, inv = trace.run_tool(
            "InventoryIntelligenceAgent",
            "inventory_lookup",
            "Search Product Catalog & Stock Levels",
            role,
            lambda: tool_inventory_lookup(db, ctx, query_text=lookup_text),
            args_preview={"query": lookup_text[:80]},
        )
        if not ok_i:
            verified_dict["rbac_restricted"] = True
            reply_md = localize_restriction_notice(eff_lang, role, _L(eff_lang, "Inventory & Stock Lookup", "ದಾಸ್ತಾನು ಪರಿಶೀಲನೆ", "स्टॉक जाँच"))
        else:
            verified_dict["inventory_lookup"] = inv
            trace.add_agent("InventoryIntelligenceAgent", f"Inspected {len(inv['items'])} matched product(s) out of {inv['total_skus']} total SKUs.")
            if is_deep:
                kpis = [
                    AIKpiMetric(label=_L(eff_lang, "Total Active SKUs", "ಒಟ್ಟು ಸಕ್ರಿಯ ವಸ್ತುಗಳು", "कुल सक्रिय आइटम"), value=str(inv["total_skus"]), tone="info"),
                    AIKpiMetric(label=_L(eff_lang, "Low / Out of Stock", "ಕಡಿಮೆ / ಖಾಲಿ ಸ್ಟಾಕ್", "कम / खत्म स्टॉक"), value=f"{inv['low_stock_count']} / {inv['out_of_stock_count']}", tone="warning" if inv["low_stock_count"] > 0 else "positive"),
                ]
                if is_tool_allowed(role, "financial_pnl"):
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Catalog Valuation", "ಒಟ್ಟು ದಾಸ್ತಾನು ಮೌಲ್ಯ", "स्टॉक मूल्य"), value=f"₹{inv['total_inventory_valuation']:,.2f}", tone="neutral"))
                if inv["items"]:
                    tables.append(
                        AITableSpec(
                            table_id="inv_lookup_table",
                            title=_L(eff_lang, "Inventory Lookup Results", "ಸ್ಟಾಕ್ ಪರಿಶೀಲನೆ ಪಟ್ಟಿ", "स्टॉक विवरण"),
                            columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Stock", "ಸ್ಟಾಕ್", "स्टॉक"), _L(eff_lang, "Sell Price", "ಮಾರಾಟ ಬೆಲೆ", "बिक्री मूल्य"), _L(eff_lang, "Days Left", "ಬಾಕಿ ದಿನ", "बचे दिन"), _L(eff_lang, "Urgency", "ಸ್ಥಿತಿ", "स्थिति")],
                            rows=[[it["name"], f"{it['current_stock']:g} {it['unit']}", f"₹{it['selling_price']:,.2f}", f"{it['days_left']}d" if it["days_left"] is not None else "—", it["urgency"]] for it in inv["items"][:10]],
                        )
                    )

            if not inv["items"]:
                # Grounded empty result: never emit currency symbols or fabricated SKU metrics
                reply_md = _L(
                    eff_lang,
                    f"No matching product was found in your catalog ({inv['total_skus']} active SKU(s) checked). Double-check the product name or open **Products & Categories** to add it.",
                    f"ನಿಮ್ಮ ಅಂಗಡಿ ಪಟ್ಟಿಯಲ್ಲಿ ({inv['total_skus']} ವಸ್ತುಗಳಲ್ಲಿ) ಇದಕ್ಕೆ ಹೊಂದಾಣಿಕೆಯಾಗುವ ಯಾವುದೇ ಉತ್ಪನ್ನ ಕಂಡುಬಂದಿಲ್ಲ.",
                    f"आपके स्टोर कैटलॉग ({inv['total_skus']} आइटम) में ऐसा कोई मिलता-जुलता प्रोडक्ट नहीं मिला।",
                )
            else:
                it0 = inv["items"][0]
                new_ctx["last_product_id"] = it0["product_id"]
                new_ctx["last_product_name"] = it0["name"]
                norm_low = normalized_q.lower()
                is_runway_q = any(w in norm_low for w in ["enough", "next week", "runway", "last a week", "ಸಾಕಾಗುತ್ತದೆಯೇ", "ಮುಂದಿನ ವಾರ"])

                if is_runway_q:
                    daily = float(it0.get("daily_demand") or 0.0)
                    weekly_need = round(daily * 7.0, 2)
                    curr = float(it0["current_stock"])
                    d_left = it0.get("days_left")
                    enough = bool(curr > 0 and (d_left is None or float(d_left) >= 7.0) and (weekly_need <= 0 or curr >= weekly_need))
                    rec_qty = float(it0.get("recommended_order_qty") or 0.0)
                    verified_dict["inventory_lookup"]["runway_check"] = {
                        "product_name": it0["name"],
                        "current_stock": curr,
                        "daily_demand": daily,
                        "weekly_need": weekly_need,
                        "days_left": d_left,
                        "enough": enough,
                        "recommended_order_qty": rec_qty,
                    }
                    days_txt_en = f"~{d_left:.1f} day(s)" if d_left is not None else "limited runway"
                    days_txt_kn = f"{float(d_left):.1f}" if d_left is not None else "0.0"
                    if enough:
                        reply_md = _L(
                            eff_lang,
                            f"Yes — **{it0['name']}** has **{curr:g} {it0['unit']}** in stock, which covers next week's estimated demand (~{weekly_need:g} {it0['unit']} at {daily:.1f} {it0['unit']}/day).",
                            f"ಹೌದು — **{it0['name']}** ಸದ್ಯ **{curr:g} {it0['unit']}** ಸ್ಟಾಕ್ ಇದೆ; ಇದು ಮುಂದಿನ ವಾರದ ಬೇಡಿಕೆಗೆ (~{weekly_need:g}) ಸಾಕಾಗುತ್ತದೆ.",
                            f"हाँ — **{it0['name']}** का स्टॉक **{curr:g} {it0['unit']}** है जो अगले हफ्ते के लिए पर्याप्त है।",
                        )
                    else:
                        order_note_en = f" I recommend ordering **{rec_qty:g} {it0['unit']}** soon." if rec_qty > 0 else " Consider restocking soon."
                        order_note_kn = f" ಬೇಗನೆ **{rec_qty:g} {it0['unit']}** ಮರುಖರೀದಿ ಮಾಡುವುದು ಉತ್ತಮ." if rec_qty > 0 else ""
                        reply_md = _L(
                            eff_lang,
                            f"No — **{it0['name']}** only has **{curr:g} {it0['unit']}** left ({days_txt_en} at ~{daily:.1f} {it0['unit']}/day vs ~{weekly_need:g} {it0['unit']} needed next week).{order_note_en}",
                            f"ಇಲ್ಲ — **{it0['name']}** ಸದ್ಯ ಕೇವಲ **{curr:g} {it0['unit']}** ಮಾತ್ರ ಉಳಿದಿದೆ (ವಾರದ ಅಂದಾಜು ಬೇಡಿಕೆ ~{weekly_need:g}; ಸುಮಾರು {days_txt_kn} ದಿನ ಮಾತ್ರ ಸಾಕಾಗುತ್ತದೆ).{order_note_kn}",
                            f"नहीं — **{it0['name']}** का स्टॉक केवल **{curr:g} {it0['unit']}** बचा है जबकि अगले हफ्ते लगभग ~{weekly_need:g} की मांग हो सकती है।",
                        )
                    follow_ups = [
                        _L(eff_lang, f"Prepare a purchase draft for {it0['name']}", f"{it0['name']} ಗೆ ಖರೀದಿ ಆರ್ಡರ್ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", f"{it0['name']} का PO ड्राफ्ट बनाओ"),
                    ]
                else:
                    if eff_lang == "kn":
                        def _kn_status(u: str, qty: float) -> str:
                            if qty <= 0 or u == "OUT_OF_STOCK":
                                return "ಖಾಲಿಯಾಗಿದೆ"
                            if u in ("CRITICAL", "LOW", "REORDER"):
                                return "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಇದೆ"
                            return "ಲಭ್ಯವಿದೆ"
                        top_items = "\n".join(
                            f"- **{it['name']}**: **{it['current_stock']:g} {it['unit']}** ({_kn_status(it['urgency'], it['current_stock'])}, ಬೆಲೆ ₹{it['selling_price']:,.2f})"
                            for it in inv["items"][:6]
                        )
                    elif eff_lang == "hi":
                        top_items = "\n".join(
                            f"- **{it['name']}**: **{it['current_stock']:g} {it['unit']}** (कीमत ₹{it['selling_price']:,.2f})"
                            for it in inv["items"][:6]
                        )
                    else:
                        top_items = "\n".join(f"- **{it['name']}**: {it['current_stock']:g} {it['unit']} · ₹{it['selling_price']:,.2f}" for it in inv["items"][:6])
                    reply_md = _L(
                        eff_lang,
                        f"Tracking **{inv['total_skus']}** active SKU(s) (**{inv['low_stock_count']}** low on stock):\n\n{top_items}",
                        f"ಅಂಗಡಿಯಲ್ಲಿ ಒಟ್ಟು **{inv['total_skus']}** ವಸ್ತುಗಳಿವೆ (**{inv['low_stock_count']}** ಕಡಿಮೆ ಸ್ಟಾಕ್):\n\n{top_items}",
                        f"स्टोर में **{inv['total_skus']}** सक्रिय प्रोडक्ट्स हैं (**{inv['low_stock_count']}** कम स्टॉक):\n\n{top_items}",
                    )

    elif intent == "MULTI_TASK_ORCHESTRATION":
        sections: List[str] = []
        denied_sections: List[str] = []
        pred_cache: Optional[Dict[str, Any]] = None
        sup_cache: Optional[Dict[str, Any]] = None
        inv_cache: Optional[Dict[str, Any]] = None

        clean_q_low = clean_query.lower()
        norm_q_low = normalized_q.lower()
        days = 7 if ("week" in norm_q_low and "next week" not in norm_q_low or "ವಾರ" in clean_query) else (1 if ("today" in clean_q_low or "ಇಂದು" in clean_query or "ಇಂದಿನ" in clean_query or "ಇವತ್ತು" in clean_query or "ivattu" in clean_q_low) else 30)
        is_compare = any(k in norm_q_low for k in ["yesterday", "compare", "prior day", "ನಿನ್ನೆ", "ನಿನ್ನೆಯ", "कल से"])
        s_period = "today" if (is_compare or any(w in clean_q_low for w in ["today", "ivattu", "evattu", "ಇಂದು", "ಇವತ್ತು", "ಇವತ್ತಿನ", "aaj", "आज"])) else ("week" if ("week" in norm_q_low and "next week" not in norm_q_low) else "month")
        s_explicit_prod = _match_product_from_text(db, bid, clean_query)
        s_target_pid = s_explicit_prod.id if s_explicit_prod else (prev_ctx.get("last_product_id") if is_compare else None)

        # Stage 1: Execute independent read-only specialist tools in parallel (when WAL/Postgres permits)
        stage1_specs: List[Tuple[str, str, str, str, Callable[[Session, TenantContext], Any], Dict[str, Any]]] = []
        if "profit_drop" in compound_tasks:
            stage1_specs.append(("profit_drop", "FinancialAnalysisAgent", "profit_drop_investigation", "Period-over-Period P&L Decomposition", lambda d, c: tool_profit_drop_investigation(d, c), {}))
        elif "financial_pnl" in compound_tasks:
            stage1_specs.append(("financial_pnl", "FinancialAnalysisAgent", "financial_pnl", "Financial P&L Summary", lambda d, c, dy=days: tool_financial_pnl(d, c, days=dy), {"days": days}))

        if "sales_summary" in compound_tasks:
            stage1_specs.append(("sales_summary", "SalesIntelligenceAgent", "sales_summary", "Sales & Top-Seller Analytics", lambda d, c, per=s_period, pd_id=s_target_pid: tool_sales_summary(d, c, period=per, product_id=pd_id), {"period": s_period, "product_id": s_target_pid}))

        if "working_capital" in compound_tasks:
            stage1_specs.append(("working_capital", "BusinessStrategyAgent", "working_capital_analysis", "Margins & Working Capital Audit", lambda d, c: tool_margin_and_working_capital(d, c), {}))

        if "replenishment_po" in compound_tasks:
            stage1_specs.extend([
                ("inventory_lookup", "InventoryIntelligenceAgent", "inventory_lookup", "Inventory Stock Inspection", lambda d, c: tool_inventory_lookup(d, c), {}),
                ("demand_forecasting", "ForecastingAgent", "demand_forecasting", "Sales Velocity & Stockout Forecast", lambda d, c: get_comprehensive_predictive_snapshot(d, c.business.id), {}),
                ("reorder_recommendations", "PurchaseManagementAgent", "reorder_recommendations", "Calculate Reorder Quantities", lambda d, c: calculate_reorder_recommendations(d, c.business.id, all_items=True), {}),
                ("supplier_price_comparison", "SupplierIntelligenceAgent", "supplier_price_comparison", "Check Suppliers & Lead Times", lambda d, c: tool_supplier_price_comparison(d, c), {}),
            ])
        else:
            if "supplier" in compound_tasks:
                stage1_specs.append(("supplier_price_comparison", "SupplierIntelligenceAgent", "supplier_price_comparison", "Supplier Cost Benchmark", lambda d, c: tool_supplier_price_comparison(d, c), {}))
            if "forecast" in compound_tasks:
                stage1_specs.append(("demand_forecasting", "ForecastingAgent", "demand_forecasting", "Forecasting", lambda d, c: get_comprehensive_predictive_snapshot(d, c.business.id), {}))
            if "inventory_lookup" in compound_tasks:
                stage1_specs.append(("inventory_lookup", "InventoryIntelligenceAgent", "inventory_lookup", "Catalog Lookup", lambda d, c, qt=clean_query: tool_inventory_lookup(d, c, query_text=qt), {"query": clean_query[:80]}))

        if "khata" in compound_tasks:
            stage1_specs.append(("khata", "CustomerIntelligenceAgent", "khata_receivables", "Inspect Customer Khata Ledger", lambda d, c: tool_khata_receivables(d, c), {}))
        if "expiry" in compound_tasks:
            stage1_specs.append(("expiry", "InventoryIntelligenceAgent", "expiring_batches", "Scan Batches", lambda d, c: tool_expiring_batches(d, c, days_ahead=30), {}))
        if "cash_till" in compound_tasks:
            stage1_specs.append(("cash_till", "FinancialAnalysisAgent", "cash_till_status", "Cash Register", lambda d, c: tool_cash_till_status(d, c), {}))
        if "gstr1" in compound_tasks:
            stage1_specs.append(("gstr1", "FinancialAnalysisAgent", "gstr1_summary", "GSTR-1 Summary", lambda d, c: tool_gstr1_summary(d, c), {}))
        if "audit" in compound_tasks:
            stage1_specs.append(("audit", "ReportingAgent", "audit_anomalies", "Audit Trail", lambda d, c: tool_audit_and_anomalies(d, c), {}))

        s1 = _run_parallel_stage1(db, ctx, trace, role, stage1_specs, allow_parallel=allow_parallel_db)

        if "document" in compound_tasks:
            doc = db.query(AIDocument).filter(AIDocument.id == document_id, AIDocument.business_id == bid).first() if document_id else db.query(AIDocument).filter(AIDocument.business_id == bid).order_by(desc(AIDocument.created_at)).first()
            if doc:
                extracted = json.loads(doc.extracted_json or "{}")
                verified_dict["document"] = {"filename": doc.filename, "document_type": doc.document_type, "extracted": extracted}
                trace.add_agent("DocumentIntelligenceAgent", f"Parsed '{doc.filename}' ({extracted.get('items_count', 0)} line items).")
                sections.append(_L(
                    eff_lang,
                    f"**Document (`{doc.filename}`):** Parsed **{extracted.get('items_count', 0)}** item(s) ({extracted.get('matched_items_count', 0)} matched).",
                    f"**ದಾಖಲೆ (`{doc.filename}`):** **{extracted.get('items_count', 0)}** ವಸ್ತುಗಳು ({extracted.get('matched_items_count', 0)} ಹೊಂದಾಣಿಕೆ).",
                    f"**दस्तावेज़ (`{doc.filename}`):** **{extracted.get('items_count', 0)}** आइटम।",
                ))
                lines = extracted.get("line_items", [])
                if is_deep and lines:
                    tables.append(
                        AITableSpec(
                            table_id="multi_doc_items",
                            title=f"{_L(eff_lang, 'Extracted Items', 'ಫೈಲ್ ವಿವರ', 'आइटम')} — {doc.filename}",
                            columns=[_L(eff_lang, "Line Item", "ವಸ್ತು", "आइटम"), _L(eff_lang, "Qty", "ಪ್ರಮಾಣ", "मात्रा"), _L(eff_lang, "Unit Cost", "ದರ", "दर"), _L(eff_lang, "Matched SKU", "ಹೊಂದಾಣಿಕೆ", "मैच")],
                            rows=[[l.get("item_name", ""), str(l.get("quantity", 0)), f"₹{float(l.get('unit_cost', 0)):,.2f}", l.get("matched_product_name") or "Unmatched"] for l in lines[:8]],
                        )
                    )
                if ("import" in clean_query.lower() or mode == "AGENT") and is_tool_allowed(role, "IMPORT_DOCUMENT_ITEMS") and extracted.get("matched_items_count", 0) > 0:
                    appr = build_document_import_draft(db, ctx, document=doc, extracted=extracted, conversation_id=conv.id, task_id=task.id)
                    if appr:
                        approval_ids.append(appr.id)
                        verified_dict.setdefault("approvals", []).append(approval_to_out(appr).model_dump())

        if "profit_drop" in compound_tasks:
            ok, pnl_cmp = s1.get("profit_drop", (False, None))
            if not ok:
                denied_sections.append(_L(eff_lang, "Financial Profit & Margin Analysis", "ಲಾಭ ಮತ್ತು ಮಾರ್ಜಿನ್ ವಿಶ್ಲೇಷಣೆ", "मुनाफा विश्लेषण"))
            else:
                verified_dict["profit_comparison"] = pnl_cmp
                c, p, d = pnl_cmp["current"], pnl_cmp["previous"], pnl_cmp["deltas"]
                trace.add_agent("FinancialAnalysisAgent", f"Analyzed P&L across {pnl_cmp['comparison_label']}.")
                if is_deep:
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Operating Profit", "ನಿವ್ವಳ ಲಾಭ", "शुद्ध मुनाफा"), value=f"₹{c['operating_profit']:,.2f}", delta=f"{d['operating_profit_delta']:+,.2f}", tone="positive" if d["operating_profit_delta"] >= 0 else "critical"))
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Net Sales", "ನಿವ್ವಳ ಮಾರಾಟ", "कुल बिक्री"), value=f"₹{c['net_sales']:,.2f}", delta=f"{c['gross_margin_percent']:.1f}%", tone="info"))
                    charts.append(
                        AIChartSpec(
                            chart_id="multi_pnl_compare",
                            title=_L(eff_lang, f"Revenue & Profit ({pnl_cmp['comparison_label']})", f"ಮಾರಾಟ ಮತ್ತು ಲಾಭ ({pnl_cmp['comparison_label']})", f"बिक्री और मुनाफा ({pnl_cmp['comparison_label']})"),
                            chart_type="bar",
                            unit_prefix="₹",
                            series_label=_L(eff_lang, "Current", "ಈಗಿನ", "वर्तमान"),
                            secondary_label=_L(eff_lang, "Previous", "ಹಿಂದಿನ", "पिछला"),
                            points=[
                                AIChartPoint(label=_L(eff_lang, "Net Sales", "ಮಾರಾಟ", "बिक्री"), value=c["net_sales"], secondary_value=p["net_sales"], color="#7DD3FC"),
                                AIChartPoint(label=_L(eff_lang, "OpEx", "ವೆಚ್ಚ", "खर्च"), value=c["operating_expenses"], secondary_value=p["operating_expenses"], color="#FBBF24"),
                                AIChartPoint(label=_L(eff_lang, "Op. Profit", "ಲಾಭ", "मुनाफा"), value=c["operating_profit"], secondary_value=p["operating_profit"], color="#5EEAD4"),
                            ],
                        )
                    )
                top_drv = translate_text(pnl_cmp["drivers"][0], eff_lang) if pnl_cmp["drivers"] else ""
                sections.append(_L(
                    eff_lang,
                    f"**Profit Change:** Operating profit is **₹{c['operating_profit']:,.2f}** (**{d['operating_profit_delta']:+,.2f}** vs prior ₹{p['operating_profit']:,.2f}; {top_drv})",
                    f"**ಲಾಭದ ಬದಲಾವಣೆ:** ನಿವ್ವಳ ಲಾಭ **₹{c['operating_profit']:,.2f}** (ಹಿಂದೆ ₹{p['operating_profit']:,.2f} · **{d['operating_profit_delta']:+,.2f}**; {top_drv})",
                    f"**मुनाफा बदलाव:** शुद्ध मुनाफा **₹{c['operating_profit']:,.2f}** (**{d['operating_profit_delta']:+,.2f}**)।",
                ))
        elif "financial_pnl" in compound_tasks:
            ok, pnl = s1.get("financial_pnl", (False, None))
            if not ok:
                denied_sections.append(_L(eff_lang, "Sales & Operating Profit Summary", "ಮಾರಾಟ ಮತ್ತು ಲಾಭದ ವರದಿ", "बिक्री व मुनाफा"))
            else:
                verified_dict["financial_pnl"] = pnl
                trace.add_agent("FinancialAnalysisAgent", f"Computed P&L across {pnl['start_date']} to {pnl['end_date']}.")
                if is_deep:
                    kpis.append(AIKpiMetric(label=_L(eff_lang, f"Net Sales ({days}d)", f"ಮಾರಾಟ ({days}ದಿನ)", f"बिक्री ({days}दिन)"), value=f"₹{pnl['net_sales']:,.2f}", delta=f"{pnl['invoices_count']} bills", tone="info"))
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Operating Profit", "ನಿವ್ವಳ ಲಾಭ", "शुद्ध मुनाफा"), value=f"₹{pnl['operating_profit']:,.2f}", delta=f"{pnl['gross_margin_percent']:.1f}%", tone="positive" if pnl["operating_profit"] >= 0 else "critical"))
                    if pnl["daily_trend"]:
                        charts.append(
                            AIChartSpec(
                                chart_id="multi_daily_sales",
                                title=_L(eff_lang, f"Daily Sales vs Gross Profit ({len(pnl['daily_trend'])}d)", f"ದೈನಂದಿನ ಮಾರಾಟ ಮತ್ತು ಲಾಭ ({len(pnl['daily_trend'])} ದಿನ)", f"दैनिक बिक्री और मुनाफा ({len(pnl['daily_trend'])} दिन)"),
                                chart_type="line",
                                unit_prefix="₹",
                                series_label=_L(eff_lang, "Net Sales", "ಮಾರಾಟ", "बिक्री"),
                                secondary_label=_L(eff_lang, "Gross Profit", "ಒಟ್ಟು ಲಾಭ", "मुनाफा"),
                                points=[AIChartPoint(label=pt["date"][5:], value=pt["sales"], secondary_value=pt["profit"]) for pt in pnl["daily_trend"][-14:]],
                            )
                        )
                sections.append(_L(
                    eff_lang,
                    f"**Sales & Profit ({days}d):** Net sales **₹{pnl['net_sales']:,.2f}** ({pnl['invoices_count']} bill(s)), gross profit **₹{pnl['gross_profit']:,.2f}**, expenses ₹{pnl['operating_expenses']:,.2f}, net profit **₹{pnl['operating_profit']:,.2f}**.",
                    f"**ಮಾರಾಟ ಮತ್ತು ಲಾಭ ({days} ದಿನ):** ನಿವ್ವಳ ಮಾರಾಟ **₹{pnl['net_sales']:,.2f}** ({pnl['invoices_count']} ಬಿಲ್), ಒಟ್ಟು ಲಾಭ **₹{pnl['gross_profit']:,.2f}**, ವೆಚ್ಚ ₹{pnl['operating_expenses']:,.2f}, ನಿವ್ವಳ ಲಾಭ **₹{pnl['operating_profit']:,.2f}**.",
                    f"**बिक्री व मुनाफा ({days} दिन):** कुल बिक्री **₹{pnl['net_sales']:,.2f}** ({pnl['invoices_count']} बिल), शुद्ध मुनाफा **₹{pnl['operating_profit']:,.2f}**।",
                ))

        if "sales_summary" in compound_tasks:
            ok_s, ss = s1.get("sales_summary", (False, None))
            if not ok_s:
                denied_sections.append(_L(eff_lang, "POS Sales Summary", "ಮಾರಾಟ ವರದಿ", "बिक्री सारांश"))
            else:
                verified_dict["sales_summary"] = ss
                t_info = ss["today"]
                top_t = ss["today_top_by_qty"]
                top_o = ss["overall_top_by_qty"]
                trace.add_agent("SalesIntelligenceAgent", f"Summarized POS sales (today ₹{t_info['net_sales']:,.2f}, {t_info['invoices_count']} bills).")
                lead = top_t[0] if (s_period == "today" and top_t) else (top_o[0] if top_o else None)
                lead_txt = f"; top seller **{lead['product_name']}** ({lead['units_sold']:g} {lead.get('unit', 'unit')})" if lead else ""
                lead_txt_kn = f"; ಅಗ್ರ ವಸ್ತು **{lead['product_name']}**" if lead else ""
                sections.append(_L(
                    eff_lang,
                    f"**POS Sales:** Today **₹{t_info['net_sales']:,.2f}** ({t_info['invoices_count']} bill(s)){lead_txt}.",
                    f"**ಮಾರಾಟ ವಿವರ:** ಇಂದು **₹{t_info['net_sales']:,.2f}** ({t_info['invoices_count']} ಬಿಲ್){lead_txt_kn}.",
                    f"**बिक्री:** आज **₹{t_info['net_sales']:,.2f}** ({t_info['invoices_count']} बिल)।",
                ))

        if "working_capital" in compound_tasks:
            ok_wc, wc = s1.get("working_capital", (False, None))
            if not ok_wc:
                denied_sections.append(_L(eff_lang, "Working Capital & Unit Margin Audit", "ದುಡಿಯುವ ಬಂಡವಾಳ", "कार्यशील पूंजी"))
            else:
                verified_dict["working_capital"] = wc
                trace.add_agent("BusinessStrategyAgent", f"Evaluated ₹{wc['total_working_capital_tied']:,.2f} working capital.")
                top_m = wc["highest_margin_catalog_skus"][0] if wc["highest_margin_catalog_skus"] else None
                if is_deep:
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Working Capital Tied", "ದುಡಿಯುವ ಬಂಡವಾಳ", "फँसी पूंजी"), value=f"₹{wc['total_working_capital_tied']:,.2f}", tone="neutral"))
                sections.append(_L(
                    eff_lang,
                    f"**Margins & Working Capital:** Total tied capital **₹{wc['total_working_capital_tied']:,.2f}** (dead stock ₹{wc['dead_stock_value']:,.2f})" + (f"; top margin **{top_m['product_name']}** ({top_m['margin_percent']:.1f}%)." if top_m else "."),
                    f"**ಮಾರ್ಜಿನ್ ಮತ್ತು ಬಂಡವಾಳ:** ಒಟ್ಟು ಬಂಡವಾಳ **₹{wc['total_working_capital_tied']:,.2f}** (ನಿಷ್ಕ್ರಿಯ ಸ್ಟಾಕ್ ₹{wc['dead_stock_value']:,.2f})" + (f"; ಗರಿಷ್ಠ ಮಾರ್ಜಿನ್ **{top_m['product_name']}** ({top_m['margin_percent']:.1f}%)." if top_m else "."),
                    f"**मार्जिन व पूंजी:** कुल पूंजी **₹{wc['total_working_capital_tied']:,.2f}**।",
                ))

        if "replenishment_po" in compound_tasks:
            ok_inv, inv = s1.get("inventory_lookup", (False, None))
            ok_fc, pred = s1.get("demand_forecasting", (False, None))
            ok_rec, reorders = s1.get("reorder_recommendations", (False, None))
            ok_sup, sup = s1.get("supplier_price_comparison", (False, None))
            if ok_inv:
                inv_cache = inv
                verified_dict["inventory_lookup"] = inv
            if ok_fc and pred:
                pred_cache = pred
                verified_dict["demand_forecasting"] = pred
            if ok_sup and sup:
                sup_cache = sup
                verified_dict["supplier_comparison"] = sup

            wants_po = any(
                k in norm_q_low
                for k in [
                    "prepare a purchase", "prepare purchase", "purchase draft", "draft purchase",
                    "draft po", "create po", "create purchase order", "prepare po", "order them",
                    "reorder draft", "place order", "restock draft",
                ]
            )

            if ok_inv and ok_rec:
                needs_reorder = [r for r in reorders if r.needs_reorder]
                default_sup = db.query(Supplier).filter(Supplier.business_id == bid).first()
                resolved_plan: List[Tuple[Any, Optional[int], str, float, float]] = []
                for r in needs_reorder:
                    best_sid, best_sname, best_cost = _select_best_supplier_and_cost(
                        r,
                        sup if ok_sup else None,
                        default_sup.id if default_sup else None,
                        default_sup.name if default_sup else "",
                    )
                    line_est = round(float(r.recommended_order_qty) * best_cost, 2)
                    resolved_plan.append((r, best_sid, best_sname, best_cost, line_est))

                est_total_po = round(sum(x[4] for x in resolved_plan), 2)
                verified_dict["reorder_recommendations"] = [
                    {
                        **r.model_dump(),
                        "selected_supplier_id": sid,
                        "selected_supplier_name": sname,
                        "selected_unit_cost": ucost,
                        "selected_estimated_cost": line_cost,
                    }
                    for r, sid, sname, ucost, line_cost in resolved_plan
                ]
                verified_dict["est_total_po"] = est_total_po

                trace.add_agent("InventoryIntelligenceAgent", f"Checked {inv['total_skus']} SKUs ({inv['low_stock_count']} low).")
                trace.add_agent("SalesIntelligenceAgent", "Calculated recent SKU daily sales velocity.")
                trace.add_agent("ForecastingAgent", f"Detected {pred['stockout_within_7d_count'] if pred else 0} <7d stockout risk SKU(s).")
                trace.add_agent("PurchaseManagementAgent", f"Computed order quantities for {len(needs_reorder)} SKU(s).")
                if sup:
                    trace.add_agent("SupplierIntelligenceAgent", f"Mapped {sup['suppliers_count']} supplier(s) & best historical quotes.")

                if is_deep:
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Low-Stock Items", "ಕಡಿಮೆ ಸ್ಟಾಕ್", "कम स्टॉक"), value=str(len(needs_reorder)), delta=f"₹{est_total_po:,.0f}", tone="warning" if needs_reorder else "positive"))
                    if needs_reorder:
                        tables.append(
                            AITableSpec(
                                table_id="multi_reorder_plan",
                                title=_L(eff_lang, "Items Needing Restock", "ಮರುಖರೀದಿ ಬೇಕಾದ ವಸ್ತುಗಳು", "रीस्टॉक आइटम"),
                                columns=[_L(eff_lang, "Product", "ಉತ್ಪನ್ನ", "प्रोडक्ट"), _L(eff_lang, "Stock", "ಸ್ಟಾಕ್", "स्टॉक"), _L(eff_lang, "Velocity/d", "ದಿನದ ವೇಗ", "बिक्री/दिन"), _L(eff_lang, "Order Qty", "ಆರ್ಡರ್", "ऑर्डर"), _L(eff_lang, "Est. Cost", "ವೆಚ್ಚ", "लागत"), _L(eff_lang, "Supplier", "ಸರಬರಾಜುದಾರ", "सप्लायर")],
                                rows=[[r.product_name, f"{r.current_stock:g} {r.unit}", f"{r.avg_daily_demand:.1f}/d", f"{r.recommended_order_qty:g} {r.unit}", f"₹{line_cost:,.2f}", sname] for r, _, sname, _, line_cost in resolved_plan[:10]],
                            )
                        )

                created_count = 0
                chosen_suppliers: List[str] = []
                if (wants_po or mode == "AGENT") and needs_reorder:
                    if not is_tool_allowed(role, "CREATE_PURCHASE_ORDER"):
                        trace.run_tool("PurchaseManagementAgent", "CREATE_PURCHASE_ORDER", "Create Purchase Draft", role, lambda: None, is_mutating=True)
                        denied_sections.append(_L(eff_lang, "Creating Purchase Order Drafts", "ಖರೀದಿ ಆರ್ಡರ್ ತಯಾರಿ", "Purchase Order बनाना"))
                    else:
                        grouped: Dict[int, List[Dict[str, Any]]] = {}
                        for r, best_sid, best_sname, best_cost, _ in resolved_plan[:15]:
                            if best_sid:
                                if best_sname:
                                    chosen_suppliers.append(best_sname)
                                grouped.setdefault(best_sid, []).append({
                                    "product_id": r.product_id, "quantity_ordered": r.recommended_order_qty,
                                    "unit_cost": best_cost, "tax_rate_percent": 0.0,
                                })
                        for sid, po_items in grouped.items():
                            ok_d, appr = trace.run_tool(
                                "PurchaseManagementAgent", "CREATE_PURCHASE_ORDER", f"Prepare PO Draft (Supplier #{sid})", role,
                                lambda s=sid, it=po_items: build_purchase_order_approval_draft(
                                    db, ctx, supplier_id=s, items=it,
                                    notes="Prepared by SmartStock AI multi-task orchestration",
                                    conversation_id=conv.id, task_id=task.id,
                                    language=eff_lang,
                                ),
                                args_preview={"supplier_id": sid, "items_count": len(po_items)}, is_mutating=True,
                            )
                            if ok_d and appr:
                                approval_ids.append(appr.id)
                                verified_dict.setdefault("approvals", []).append(approval_to_out(appr).model_dump())
                                created_count += 1

                if created_count > 0:
                    sku_names = ", ".join(r.product_name for r in needs_reorder[:3])
                    sup_names = ", ".join(dict.fromkeys(chosen_suppliers[:3]))
                    via_en = f" via **{sup_names}**" if sup_names else ""
                    via_kn = f" (**{sup_names}**)" if sup_names else ""
                    sections.append(_L(
                        eff_lang,
                        f"**Low Stock & Purchase Draft:** Found **{len(needs_reorder)}** low-stock item(s) ({sku_names}) and prepared **{created_count} PO draft(s)**{via_en} totaling **₹{est_total_po:,.2f}** below.",
                        f"**ಕಡಿಮೆ ಸ್ಟಾಕ್ ಮತ್ತು ಖರೀದಿ ಡ್ರಾಫ್ಟ್:** **{len(needs_reorder)}** ವಸ್ತುಗಳಿಗೆ ({sku_names}){via_kn} ಒಟ್ಟು **₹{est_total_po:,.2f}** ಮೌಲ್ಯದ **{created_count} PO ಡ್ರಾಫ್ಟ್** ಸಿದ್ಧವಾಗಿದೆ.",
                        f"**कम स्टॉक व PO ड्राफ्ट:** **{len(needs_reorder)}** कम स्टॉक आइटम ({sku_names}) के लिए **₹{est_total_po:,.2f}** का **{created_count} PO ड्राफ्ट** तैयार है।",
                    ))
                elif needs_reorder:
                    sku_names = ", ".join(r.product_name for r in needs_reorder[:3])
                    sections.append(_L(
                        eff_lang,
                        f"**Low Stock:** **{len(needs_reorder)}** SKU(s) need restock ({sku_names}; est. ₹{est_total_po:,.2f}).",
                        f"**ಕಡಿಮೆ ಸ್ಟಾಕ್:** **{len(needs_reorder)}** ವಸ್ತುಗಳಿಗೆ ({sku_names}) ಮರುಖರೀದಿ ಅಗತ್ಯ (ಅಂದಾಜು ₹{est_total_po:,.2f}).",
                        f"**कम स्टॉक:** **{len(needs_reorder)}** आइटम ({sku_names}) कम हैं (अनुमान ₹{est_total_po:,.2f})।",
                    ))
                    actions.append(AIActionShortcut(label=_L(eff_lang, "Prepare Purchase Draft", "ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "PO ड्राफ्ट बनाओ"), prompt="Prepare a purchase draft for low stock products"))
                else:
                    sections.append(_L(
                        eff_lang,
                        f"**Stock Health:** All **{inv['total_skus']}** SKUs are well stocked.",
                        f"**ಸ್ಟಾಕ್ ಸ್ಥಿತಿ:** ಎಲ್ಲಾ **{inv['total_skus']}** ವಸ್ತುಗಳು ಸರಿಯಾದ ಮಟ್ಟದಲ್ಲಿವೆ.",
                        f"**स्टॉक स्थिति:** सभी **{inv['total_skus']}** आइटम पर्याप्त हैं।",
                    ))
                new_ctx["last_product_ids"] = [r.product_id for r in needs_reorder[:10]]
                if needs_reorder:
                    new_ctx["last_product_id"] = needs_reorder[0].product_id
                    new_ctx["last_product_name"] = needs_reorder[0].product_name
            else:
                denied_sections.append(_L(eff_lang, "Inventory & Replenishment", "ಸ್ಟಾಕ್ ಪರಿಶೀಲನೆ", "स्टॉक जाँच"))
                if (wants_po or mode == "AGENT") and not is_tool_allowed(role, "CREATE_PURCHASE_ORDER"):
                    trace.run_tool("PurchaseManagementAgent", "CREATE_PURCHASE_ORDER", "Create Purchase Draft", role, lambda: None, is_mutating=True)
                    denied_sections.append(_L(eff_lang, "Creating Purchase Order Drafts", "ಖರೀದಿ ಆರ್ಡರ್ ತಯಾರಿ", "Purchase Order बनाना"))

        if "supplier" in compound_tasks:
            if sup_cache is None:
                ok_s, sup_cache = s1.get("supplier_price_comparison", (False, None))
                if not ok_s:
                    denied_sections.append(_L(eff_lang, "Supplier Comparison", "ಸರಬರಾಜುದಾರರ ಹೋಲಿಕೆ", "सप्लायर तुलना"))
                    sup_cache = None
                else:
                    trace.add_agent("SupplierIntelligenceAgent", f"Benchmarked {sup_cache['suppliers_count']} supplier(s).")
            if sup_cache:
                verified_dict["supplier_comparison"] = sup_cache
                if sup_cache["has_multi_supplier_quotes"]:
                    bd = sup_cache["product_price_comparisons"][0]
                    sections.append(_L(
                        eff_lang,
                        f"**Suppliers:** Best quote on **{bd['product_name']}** is **{bd['best_supplier']}** at ₹{bd['best_avg_unit_cost']:,.2f}/{bd['unit']}.",
                        f"**ಸರಬರಾಜುದಾರರು:** **{bd['product_name']}** ಗೆ **{bd['best_supplier']}** ಕಡಿಮೆ ದರ ₹{bd['best_avg_unit_cost']:,.2f} ನೀಡಿದ್ದಾರೆ.",
                        f"**सप्लायर:** **{bd['best_supplier']}** ने ₹{bd['best_avg_unit_cost']:,.2f} का सबसे अच्छा रेट दिया।",
                    ))
                elif sup_cache["suppliers"]:
                    fastest = min(sup_cache["suppliers"], key=lambda s: s["lead_time_days"])
                    sections.append(_L(
                        eff_lang,
                        f"**Suppliers:** **{sup_cache['suppliers_count']}** vendor(s); fastest lead time is **{fastest['supplier_name']}** ({fastest['lead_time_days']}d).",
                        f"**ಸರಬರಾಜುದಾರರು:** **{sup_cache['suppliers_count']}** ವ್ಯಾಪಾರಿಗಳು; **{fastest['supplier_name']}** ವೇಗದ ಡೆಲಿವರಿ ({fastest['lead_time_days']} ದಿನ).",
                        f"**सप्लायर:** **{sup_cache['suppliers_count']}** वेंडर; सबसे तेज़ **{fastest['supplier_name']}**।",
                    ))

        if "khata" in compound_tasks:
            ok_k, khata = s1.get("khata", (False, None))
            if not ok_k:
                denied_sections.append(_L(eff_lang, "Customer Khata Receivables", "ಗ್ರಾಹಕರ ಖಾತಾ ಬಾಕಿ", "ग्राहक खाता बकाया"))
            else:
                verified_dict["khata"] = khata
                trace.add_agent("CustomerIntelligenceAgent", f"Reviewed {khata['total_customers']} customer(s); ₹{khata['total_receivable']:,.2f} due.")
                if is_deep:
                    kpis.append(AIKpiMetric(label=_L(eff_lang, "Khata Receivable", "ಖಾತಾ ಬಾಕಿ", "खाता बकाया"), value=f"₹{khata['total_receivable']:,.2f}", delta=f"{khata['debtors_count']} accounts", tone="warning" if khata["total_receivable"] > 0 else "positive"))
                    if khata["top_debtors"]:
                        tables.append(
                            AITableSpec(
                                table_id="multi_khata_table",
                                title=_L(eff_lang, "Pending Customer Khata Dues", "ಬಾಕಿ ಖಾತಾ ಪಟ್ಟಿ", "बकाया खाता सूची"),
                                columns=[_L(eff_lang, "Customer", "ಗ್ರಾಹಕ", "ग्राहक"), _L(eff_lang, "Phone", "ಫೋನ್", "फ़ोन"), _L(eff_lang, "Outstanding (₹)", "ಬಾಕಿ (₹)", "बकाया (₹)")],
                                rows=[[d["name"], d["phone"] or "—", f"₹{d['outstanding_balance']:,.2f}"] for d in khata["top_debtors"][:8]],
                            )
                        )
                sections.append(_L(
                    eff_lang,
                    f"**Customer Khata:** **₹{khata['total_receivable']:,.2f}** pending across **{khata['debtors_count']}** account(s).",
                    f"**ಗ್ರಾಹಕರ ಖಾತಾ:** **{khata['debtors_count']}** ಗ್ರಾಹಕರಿಂದ **₹{khata['total_receivable']:,.2f}** ಬಾಕಿ ಬರಬೇಕಿದೆ.",
                    f"**ग्राहक खाता:** **{khata['debtors_count']}** ग्राहकों पर **₹{khata['total_receivable']:,.2f}** बकाया है।",
                ))

        if "forecast" in compound_tasks:
            if pred_cache is None:
                ok_f, pred_cache = s1.get("demand_forecasting", (False, None))
                if not ok_f:
                    denied_sections.append(_L(eff_lang, "Predictive Forecasting", "ಬೇಡಿಕೆ ಮುನ್ಸೂಚನೆ", "मांग पूर्वानुमान"))
                elif pred_cache:
                    trace.add_agent("ForecastingAgent", "Computed 7d & 30d revenue forecast.")
            if pred_cache:
                verified_dict["demand_forecasting"] = pred_cache
                rev7 = pred_cache["revenue_forecast_7d"]
                sections.append(_L(
                    eff_lang,
                    f"**7-Day Forecast (Est.):** **₹{rev7['projected_revenue']:,.2f}**; **{pred_cache['stockout_within_7d_count']}** item(s) risk <7d stockout.",
                    f"**7 ದಿನದ ಅಂದಾಜು ಮಾರಾಟ:** **₹{rev7['projected_revenue']:,.2f}**; **{pred_cache['stockout_within_7d_count']}** ವಸ್ತು 7 ದಿನದಲ್ಲಿ ಖಾಲಿಯಾಗಬಹುದು.",
                    f"**7 दिन का अनुमान:** **₹{rev7['projected_revenue']:,.2f}**; **{pred_cache['stockout_within_7d_count']}** आइटम खत्म होने के कगार पर।",
                ))

        if "expiry" in compound_tasks:
            ok_x, exp = s1.get("expiry", (False, None))
            if ok_x and exp:
                verified_dict["expiry"] = exp
                trace.add_agent("InventoryIntelligenceAgent", f"Scanned FEFO batches: {exp['expiring_batches_count']} expiring.")
                sections.append(_L(
                    eff_lang,
                    f"**Expiry Watch:** **{exp['expiring_batches_count']}** batch(es) expiring within 30d (₹{exp['total_at_risk_value']:,.2f}).",
                    f"**ಅವಧಿ ಮುಗಿಯುವ ಬ್ಯಾಚ್:** **{exp['expiring_batches_count']}** ಬ್ಯಾಚ್‌ಗಳು 30 ದಿನದಲ್ಲಿ ಮುಗಿಯಲಿವೆ (₹{exp['total_at_risk_value']:,.2f}).",
                    f"**एक्सपायरी अलर्ट:** **{exp['expiring_batches_count']}** बैच 30 दिन में एक्सपायर होंगे।",
                ))

        if "cash_till" in compound_tasks:
            ok_c, till = s1.get("cash_till", (False, None))
            if ok_c and till:
                verified_dict["cash_till"] = till
                trace.add_agent("FinancialAnalysisAgent", "Checked live cash register drawer state.")
                if till["has_open_shift"] and till["open_shift"]:
                    s = till["open_shift"]
                    sections.append(_L(eff_lang, f"**Cash Drawer:** **OPEN**, expected ₹{s['expected_cash']:,.2f}.", f"**ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ:** **ತೆರೆದಿದೆ**, ₹{s['expected_cash']:,.2f}.", f"**कैश ड्रॉअर:** **खुला**, ₹{s['expected_cash']:,.2f}।"))
                else:
                    sections.append(_L(eff_lang, "**Cash Drawer:** Currently **CLOSED**.", "**ಗಲ್ಲಾಪೆಟ್ಟಿಗೆ:** ಸದ್ಯ **ಮುಚ್ಚಲಾಗಿದೆ**.", "**कैश ड्रॉअर:** **बंद** है।"))

        if "gstr1" in compound_tasks:
            ok_g, gst = s1.get("gstr1", (False, None))
            if not ok_g:
                denied_sections.append(_L(eff_lang, "GSTR-1 Tax Summary", "ಜಿಎಸ್‌ಟಿ ವರದಿ", "GST सारांश"))
            elif gst:
                verified_dict["gstr1_summary"] = gst
                s = gst["summary"]
                trace.add_agent("FinancialAnalysisAgent", "Compiled GSTR-1 summary.")
                sections.append(_L(eff_lang, f"**GST Summary:** Taxable ₹{s['total_taxable_value']:,.2f}, Tax **₹{s['total_tax']:,.2f}**.", f"**GST ಸಾರಾಂಶ:** ತೆರಿಗೆ ಅರ್ಹ ₹{s['total_taxable_value']:,.2f}, ಒಟ್ಟು GST **₹{s['total_tax']:,.2f}**.", f"**GST सारांश:** टैक्स **₹{s['total_tax']:,.2f}**।"))

        if "audit" in compound_tasks:
            ok_a, aud = s1.get("audit", (False, None))
            if not ok_a:
                denied_sections.append(_L(eff_lang, "Audit & Anomalies", "ಆಡಿಟ್ ವರದಿ", "ऑडिट रिपोर्ट"))
            elif aud:
                verified_dict["audit_anomalies"] = aud
                trace.add_agent("ReportingAgent", "Scanned anomalies & audit trail.")
                sections.append(_L(eff_lang, f"**Anomalies:** {len(aud['pending_system_anomalies'])} pending.", f"**ಅಸಹಜ ವಹಿವಾಟು:** {len(aud['pending_system_anomalies'])} ಬಾಕಿ.", f"**अनियमितता:** {len(aud['pending_system_anomalies'])} बकाया।"))

        if "briefing" in compound_tasks:
            ok_b, brief = trace.run_tool("ReportingAgent", "daily_briefing", "Proactive Risks", role, lambda: build_daily_briefing(db, ctx, commit=False))
            if not ok_b:
                denied_sections.append(_L(eff_lang, "Daily Executive Briefing", "ದೈನಂದಿನ ವರದಿ", "दैनिक रिपोर्ट"))
            elif brief:
                verified_dict["briefing"] = brief.model_dump()
                trace.add_agent("ReportingAgent", f"Compiled {len(brief.top_risks)} top risk(s).")
                sections.append(_L(eff_lang, f"**Alerts:** **{len(brief.top_risks)}** active store alert(s).", f"**ಎಚ್ಚರಿಕೆಗಳು:** **{len(brief.top_risks)}** ಸಕ್ರಿಯ ಅಂಗಡಿ ಎಚ್ಚರಿಕೆಗಳಿವೆ.", f"**अलर्ट:** **{len(brief.top_risks)}** सक्रिय चेतावनी।"))

        if "inventory_lookup" in compound_tasks and inv_cache is None:
            ok_i, inv = s1.get("inventory_lookup", (False, None))
            if ok_i and inv:
                verified_dict["inventory_lookup"] = inv
                trace.add_agent("InventoryIntelligenceAgent", f"Looked up {len(inv['items'])} SKU(s).")
                sections.append(_L(eff_lang, f"**Catalog:** **{inv['total_skus']}** SKUs ({inv['low_stock_count']} low).", f"**ಸರಕು ಪಟ್ಟಿ:** **{inv['total_skus']}** ವಸ್ತುಗಳು ({inv['low_stock_count']} ಕಡಿಮೆ).", f"**कैटलॉग:** **{inv['total_skus']}** आइटम।"))

        if denied_sections:
            verified_dict["rbac_restricted"] = True

        kpis = kpis[:4]
        uniq_denied = list(dict.fromkeys(denied_sections))
        if not sections and uniq_denied:
            reply_md = localize_restriction_notice(eff_lang, role, ", ".join(uniq_denied))
        else:
            bullet_body = "\n".join(f"- {s}" for s in sections)
            denied_note = (
                _L(
                    eff_lang,
                    f"\n\n*Note: {', '.join(uniq_denied)} is restricted for your role (`{role}`).*",
                    f"\n\n*ಸೂಚನೆ: ನಿಮ್ಮ ಪಾತ್ರ (`{role}`) ಕ್ಕೆ {', '.join(uniq_denied)} ಅನುಮತಿ ಇಲ್ಲ.*",
                    f"\n\n*नोट: आपकी भूमिका (`{role}`) के लिए {', '.join(uniq_denied)} प्रतिबंधित है।*",
                )
                if uniq_denied
                else ""
            )
            reply_md = _L(
                eff_lang,
                f"Here's everything across **{ctx.business.name}**:\n\n{bullet_body}{denied_note}",
                f"**{ctx.business.name}** ಅಂಗಡಿಯ ಸಂಪೂರ್ಣ ಮಾಹಿತಿ ಇಲ್ಲಿದೆ:\n\n{bullet_body}{denied_note}",
                f"**{ctx.business.name}** की पूरी जानकारी:\n\n{bullet_body}{denied_note}",
            )
            if approval_ids:
                reply_md += _L(
                    eff_lang,
                    "\n\nReview the draft card(s) below and click **Approve & Execute** to save.",
                    "\n\nಕೆಳಗಿನ ಕಾರ್ಡ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ **ಅನುಮೋದಿಸಿ ಮತ್ತು ಕಾರ್ಯಗತಗೊಳಿಸಿ** ಒತ್ತಿ.",
                    "\n\nनीचे ड्राफ्ट की समीक्षा करके **मंज़ूर करें** दबाएँ।",
                )
        follow_ups = [
            _L(eff_lang, "Why did profit change recently?", "ಇತ್ತೀಚೆಗೆ ಲಾಭ ಯಾಕೆ ಬದಲಾಗಿದೆ?", "हाल ही में मुनाफा क्यों बदला?"),
            _L(eff_lang, "Compare supplier purchasing prices", "ಸರಬರಾಜುದಾರರ ಬೆಲೆ ಹೋಲಿಸಿ", "सप्लायर रेट की तुलना करें"),
        ]

    else:  # GENERAL_BUSINESS_ASSIST (live store overview explicitly requested)
        ok_w, ws = trace.run_tool("ReportingAgent", "workspace_overview", "Workspace Health Heartbeat", role, lambda: tool_workspace_overview(db, ctx))
        ws_data = ws or {"business_name": ctx.business.name, "active_skus": 0, "low_stock_skus": 0, "out_of_stock_skus": 0, "open_purchase_orders": 0, "active_ai_alerts": 0, "cash_shift_open": False}
        verified_dict["workspace_overview"] = ws_data
        pnl_note = ""
        if is_tool_allowed(role, "financial_pnl"):
            ok_p, pnl = trace.run_tool("FinancialAnalysisAgent", "financial_pnl", "Recent 30d P&L Snapshot", role, lambda: tool_financial_pnl(db, ctx, days=30))
            if ok_p and pnl:
                verified_dict["financial_pnl"] = pnl
                pnl_note = _L(
                    eff_lang,
                    f"- **30-Day Sales & Profit:** **₹{pnl['net_sales']:,.2f}** ({pnl['invoices_count']} bills) · Operating profit **₹{pnl['operating_profit']:,.2f}**\n",
                    f"- **30 ದಿನದ ಮಾರಾಟ ಮತ್ತು ಲಾಭ:** **₹{pnl['net_sales']:,.2f}** ({pnl['invoices_count']} ಬಿಲ್) · ನಿವ್ವಳ ಲಾಭ **₹{pnl['operating_profit']:,.2f}**\n",
                    f"- **30 दिन की बिक्री व मुनाफा:** **₹{pnl['net_sales']:,.2f}** · शुद्ध मुनाफा **₹{pnl['operating_profit']:,.2f}**\n",
                )
                trace.add_agent("FinancialAnalysisAgent", "Checked 30-day revenue & profit pulse.")

        trace.add_agent("ReportingAgent", f"Reviewed live store status for {ws_data['business_name']}.")
        if is_deep:
            kpis = [
                AIKpiMetric(label=_L(eff_lang, "Active SKUs", "ಸಕ್ರಿಯ ವಸ್ತುಗಳು", "सक्रिय आइटम"), value=str(ws_data["active_skus"]), delta=f"{ws_data['low_stock_skus']} low", tone="info"),
                AIKpiMetric(label=_L(eff_lang, "Open POs", "ಬಾಕಿ POಗಳು", "खुले ऑर्डर"), value=str(ws_data["open_purchase_orders"]), tone="warning" if ws_data["open_purchase_orders"] > 0 else "positive"),
                AIKpiMetric(label=_L(eff_lang, "Active Alerts", "ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆ", "सक्रिय अलर्ट"), value=str(ws_data["active_ai_alerts"]), tone="critical" if ws_data["active_ai_alerts"] > 0 else "positive"),
            ]
        reply_md = _L(
            eff_lang,
            f"Here's a quick live snapshot of **{ws_data['business_name']}**:\n\n{pnl_note}- **Inventory:** **{ws_data['active_skus']}** active items (**{ws_data['low_stock_skus']}** low on stock, **{ws_data['out_of_stock_skus']}** out of stock)\n- **Operations:** **{ws_data['open_purchase_orders']}** open PO(s) · **{ws_data['active_ai_alerts']}** alert(s) · Cash till **{'OPEN' if ws_data['cash_shift_open'] else 'CLOSED'}**",
            f"**{ws_data['business_name']}** ಅಂಗಡಿಯ ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ:\n\n{pnl_note}- **ದಾಸ್ತಾನು:** **{ws_data['active_skus']}** ವಸ್ತುಗಳು (**{ws_data['low_stock_skus']}** ಕಡಿಮೆ ಸ್ಟಾಕ್, **{ws_data['out_of_stock_skus']}** ಖಾಲಿ)\n- **ಕಾರ್ಯಾಚರಣೆ:** **{ws_data['open_purchase_orders']}** ಬಾಕಿ PO · **{ws_data['active_ai_alerts']}** ಎಚ್ಚರಿಕೆಗಳು · ಕ್ಯಾಶ್ ಶಿಫ್ಟ್ **{'ತೆರೆದಿದೆ' if ws_data['cash_shift_open'] else 'ಮುಚ್ಚಲಾಗಿದೆ'}**",
            f"**{ws_data['business_name']}** का लाइव स्टेटस:\n\n{pnl_note}- **स्टॉक:** **{ws_data['active_skus']}** आइटम (**{ws_data['low_stock_skus']}** कम स्टॉक)\n- **संचालन:** **{ws_data['open_purchase_orders']}** खुले PO · **{ws_data['active_ai_alerts']}** अलर्ट।",
        )
        follow_ups = [
            _L(eff_lang, "Check profit, low stock & prepare a PO draft", "ಲಾಭ, ಕಡಿಮೆ ಸ್ಟಾಕ್ ನೋಡಿ ಖರೀದಿ ಡ್ರಾಫ್ಟ್ ಮಾಡಿ", "मुनाफा व कम स्टॉक देखकर PO ड्राफ्ट बनाओ"),
            _L(eff_lang, "Show pending approvals", "ಬಾಕಿ ಇರುವ ಅನುಮೋದನೆ ತೋರಿಸಿ", "लंबित मंज़ूरी दिखाओ"),
        ]

    # Add applied memories note only in Deep / Agent mode
    if is_deep and memories and not intent.startswith("CONVERSATIONAL_") and intent not in ("SAVE_MEMORY", "GENERAL_GPT_CHAT", "MANAGE_MEMORIES"):
        mem_notes = "; ".join(f"{m.memory_key}: {m.memory_value[:80]}" for m in memories[:3])
        assumptions.append(_L(
            eff_lang,
            f"Applied {len(memories)} saved workspace rule(s): {mem_notes}",
            f"ಉಳಿಸಲಾದ {len(memories)} ಅಂಗಡಿ ನಿಯಮಗಳನ್ನು ಅನ್ವಯಿಸಲಾಗಿದೆ: {mem_notes}",
            f"{len(memories)} सेव किए गए स्टोर नियम लागू किए गए: {mem_notes}",
        ))

    # Enforce Normal vs Deep complexity separation!
    # In Normal (QUICK_ASSIST): simple ChatGPT presentation -> no KPI clutter, no charts/tables/traces UI dumps!
    if mode == "QUICK_ASSIST":
        kpis = []
        charts = []
        tables = []
        evidence = []
        recommendations = []
        follow_ups = follow_ups[:2]

    # Optional External LLM polish strictly bounded to verified numbers + live chunk streaming
    final_md, tokens_used, provider_name = maybe_synthesize_with_llm(
        mode=mode,
        language=eff_lang,
        user_query=clean_query,
        deterministic_summary=reply_md,
        verified_evidence=verified_dict,
        conversation_history=history_msgs,
        on_text_chunk=on_text_chunk,
        cancel_event=cancel_event,
    )

    payload = AIMessagePayload(
        kpis=kpis,
        charts=charts,
        tables=tables,
        evidence=evidence,
        assumptions=assumptions,
        recommendations=recommendations,
        agents_involved=trace.agent_traces,
        tool_traces=trace.tool_traces,
        actions=actions,
        approval_ids=approval_ids,
        follow_ups=follow_ups,
        data_quality=data_quality,
        llm_provider=provider_name,
    )
    payload_dump = payload.model_dump()
    v_passed, v_score, v_details = verify_turn_groundedness(
        final_md,
        intent,
        data_quality,
        verified_dict,
        payload_dict=payload_dump,
        tool_traces=[t.model_dump() for t in trace.tool_traces],
    )
    if not v_passed and provider_name != "smartstock-deterministic-brain":
        final_md = reply_md
        provider_name = "smartstock-deterministic-brain-verified-fallback"
        payload.llm_provider = provider_name
        payload_dump = payload.model_dump()
        v_passed, v_score, v_details = verify_turn_groundedness(
            final_md,
            intent,
            data_quality,
            verified_dict,
            payload_dict=payload_dump,
            tool_traces=[t.model_dump() for t in trace.tool_traces],
        )

    elapsed_ms = max(1, int((time.perf_counter() - started) * 1000))
    task.status = "PENDING_APPROVAL" if approval_ids else "COMPLETED"
    task.completed_at = utc_now()
    task.duration_ms = elapsed_ms
    task.plan_json = json.dumps([a.model_dump() for a in trace.agent_traces], default=str)
    task.result_summary = final_md[:400]

    asst_msg = AIMessage(
        conversation_id=conv.id,
        business_id=bid,
        role="assistant",
        content=final_md,
        mode=mode,
        language=eff_lang,
        intent=intent,
        confidence=0.96,
        response_payload_json=json.dumps(payload_dump, default=str),
        tokens_used=tokens_used,
        latency_ms=elapsed_ms,
    )
    db.add(asst_msg)
    conv.last_message_at = utc_now()
    conv.mode = mode
    conv.language = eff_lang
    conv.context_summary = json.dumps(new_ctx, default=str)
    db.flush()

    record_turn_evaluation(
        db,
        business_id=bid,
        user_id=ctx.user.id,
        task_id=task.id,
        query=clean_query,
        mode=mode,
        intent=intent,
        passed=v_passed,
        groundedness_score=v_score,
        latency_ms=elapsed_ms,
        tokens_used=tokens_used,
        details={
            "agents": [a.agent_name for a in trace.agent_traces],
            "tools": [t.tool_name for t in trace.tool_traces],
            "groundedness": v_details,
        },
    )

    db.commit()
    db.refresh(user_msg)
    db.refresh(asst_msg)
    return AIChatResponse(
        conversation_id=conv.id,
        user_message=message_to_out(user_msg, db),
        assistant_message=message_to_out(asst_msg, db),
        detected_language=eff_lang,
        task_id=task.id,
        status=task.status,
    )


def stream_ai_ultra_chat(
    db: Session,
    ctx: TenantContext,
    *,
    message: str,
    conversation_id: Optional[int] = None,
    mode: str = "QUICK_ASSIST",
    language: str = "auto",
    document_id: Optional[int] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Generator[str, None, None]:
    """
    True incremental Server-Sent Events (SSE) generator.
    Executes run_ai_ultra_turn on a background worker thread and streams live
    'agent_step' and 'token' events immediately via a thread-safe Queue.
    """
    yield f"event: status\ndata: {json.dumps({'stage': 'orchestrating', 'mode': mode})}\n\n"

    ev_q: queue.Queue = queue.Queue()
    cancel_ev = cancel_event or threading.Event()
    streamed_any_chunk = False
    result_holder: Dict[str, Any] = {}
    err_holder: Dict[str, BaseException] = {}

    def _on_ev(ev_name: str, data: Dict[str, Any]) -> None:
        if not cancel_ev.is_set():
            ev_q.put((ev_name, data))

    def _on_chunk(delta: str) -> None:
        if delta and not cancel_ev.is_set():
            ev_q.put(("token", {"delta": delta}))

    def _worker() -> None:
        try:
            res = run_ai_ultra_turn(
                db=db,
                ctx=ctx,
                message=message,
                conversation_id=conversation_id,
                mode=mode,
                language=language,
                document_id=document_id,
                on_event=_on_ev,
                on_text_chunk=_on_chunk,
                cancel_event=cancel_ev,
            )
            ev_q.put(("_result", res))
        except BaseException as exc:  # noqa: BLE001
            ev_q.put(("_error", exc))
        finally:
            ev_q.put(("_done", None))

    worker = threading.Thread(target=_worker, name="smartstock-ai-stream", daemon=True)
    worker.start()

    try:
        while True:
            if cancel_ev.is_set():
                break
            try:
                kind, payload_obj = ev_q.get(timeout=0.2)
            except queue.Empty:
                if not worker.is_alive():
                    break
                continue

            if kind == "_done":
                break
            elif kind == "_result":
                result_holder["res"] = payload_obj
            elif kind == "_error":
                err_holder["exc"] = payload_obj
            elif kind == "token":
                streamed_any_chunk = True
                yield f"event: token\ndata: {json.dumps(payload_obj)}\n\n"
            elif kind == "agent_step":
                yield f"event: agent_step\ndata: {json.dumps(payload_obj, default=str)}\n\n"

        if "exc" in err_holder:
            raise err_holder["exc"]

        res = result_holder.get("res")
        if res is not None and not cancel_ev.is_set():
            if not streamed_any_chunk:
                words = res.assistant_message.content.split(" ")
                chunk_size = 6
                for i in range(0, len(words), chunk_size):
                    if cancel_ev.is_set():
                        break
                    chunk = " ".join(words[i : i + chunk_size]) + (" " if i + chunk_size < len(words) else "")
                    yield f"event: token\ndata: {json.dumps({'delta': chunk})}\n\n"

            yield f"event: final\ndata: {json.dumps(res.model_dump(), default=str)}\n\n"
    finally:
        cancel_ev.set()
        worker.join(timeout=2.0)
