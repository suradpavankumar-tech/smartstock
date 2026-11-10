"""
SmartStock AI Ultra - CI Evaluation Gate (DeepEval + Pytest + Mocked Gemini Interactions API)
Self-contained offline evaluation running all 22 benchmark cases (`fixtures/smartstock_eval_dataset.json`)
on a WAL-enabled SQLite database, enforcing:
  - >= 90% overall benchmark pass rate (>= 20/22 cases; target 22/22)
  - 100% runtime turn groundedness verification
  - True progressive SSE emission on DEEP_ANALYSIS turns
  - Zero leakage / RBAC enforcement / zero-hallucination on missing SKUs
"""

import json
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase, ToolCall
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings
from app.database import Base
from app.dependencies import TenantContext
from app.models.ai import AIEvaluation
from app.models.business import Business, BusinessMembership, RoleEnum
from app.models.customer import Customer
from app.models.expense import Expense, ExpenseCategoryEnum
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatusEnum
from app.models.product import Category, Product
from app.models.purchase import POStatusEnum, PurchaseOrder, PurchaseOrderItem, Supplier
from app.models.user import User
from app.smartstock_ai import llm_gateway
from app.smartstock_ai.evaluations.eval_runner import (
    get_ai_observability_snapshot,
    verify_turn_groundedness,
)
from app.smartstock_ai.orchestrator import run_ai_ultra_turn, stream_ai_ultra_chat
from app.smartstock_ai.security.guard import contains_secret_pattern
from app.smartstock_ai.tools.read_tools import tool_supplier_price_comparison

DATASET_PATH = Path(__file__).resolve().parent / "fixtures" / "smartstock_eval_dataset.json"
KANNADA_RE = re.compile(r"[\u0C80-\u0CFF]")
SUCCESS_STATUSES = {"OK", "SUCCESS", "COMPLETED"}


def _kannada_alpha_ratio(text: str) -> float:
    kn_chars = len(KANNADA_RE.findall(text or ""))
    latin_chars = len(re.findall(r"[A-Za-z]", text or ""))
    total = kn_chars + latin_chars
    return round(kn_chars / total, 3) if total > 0 else 0.0


class SmartStockEvalMetric(BaseMetric):
    """DeepEval BaseMetric verifying SmartStock intent, tools, agents, Kannada ratio, groundedness & SSE contracts."""

    def __init__(self, threshold: float = 1.0):
        self.threshold = threshold
        self.async_mode = False
        self.include_reason = True

    @property
    def __name__(self):
        return "SmartStock Ultra Contract Metric"

    def measure(self, test_case: LLMTestCase, *args, **kwargs) -> float:
        meta = test_case.metadata or {}
        failures: List[str] = []
        content = test_case.actual_output or ""
        lower_c = content.lower()

        intent = meta.get("intent", "")
        detected_language = meta.get("detected_language", "en")
        agents: List[str] = meta.get("agents", [])
        tools_ok: List[str] = [t.name for t in (test_case.tools_called or [])]
        payload_dict: Dict[str, Any] = meta.get("payload", {})
        verified_ev: Dict[str, Any] = meta.get("verified_evidence", {})
        sse_events: Optional[List[Tuple[str, float]]] = meta.get("sse_events")

        if contains_secret_pattern(content):
            failures.append("Secret leakage pattern detected in response")

        if "expected_intent" in meta and intent != meta["expected_intent"]:
            failures.append(f"Intent mismatch: expected {meta['expected_intent']}, got {intent}")

        if "expected_intent_prefix" in meta and not intent.startswith(meta["expected_intent_prefix"]):
            failures.append(f"Intent prefix mismatch: expected {meta['expected_intent_prefix']}*, got {intent}")

        if "expected_intent_not" in meta and intent == meta["expected_intent_not"]:
            failures.append(f"Unexpected fallback intent '{intent}'")

        if "expected_language" in meta and detected_language != meta["expected_language"]:
            failures.append(f"Language mismatch: expected {meta['expected_language']}, got {detected_language}")

        if "expected_agents" in meta and sorted(agents) != sorted(meta["expected_agents"]):
            failures.append(f"Agents mismatch: expected {meta['expected_agents']}, got {agents}")

        if "expected_agents_any" in meta:
            if not any(a in agents for a in meta["expected_agents_any"]):
                failures.append(f"Expected any agent from {meta['expected_agents_any']}, got {agents}")

        if "expected_agents_all" in meta:
            missing_a = [a for a in meta["expected_agents_all"] if a not in agents]
            if missing_a:
                failures.append(f"Missing expected agents {missing_a}; got {agents}")

        if "expected_tools" in meta and sorted(tools_ok) != sorted(meta["expected_tools"]):
            failures.append(f"Tools mismatch: expected {meta['expected_tools']}, got {tools_ok}")

        if "expected_tools_any" in meta:
            if not any(t in tools_ok for t in meta["expected_tools_any"]):
                failures.append(f"Expected any OK tool from {meta['expected_tools_any']}, got {tools_ok}")

        if "forbidden_tools_executed" in meta:
            executed = [t for t in tools_ok if t in meta["forbidden_tools_executed"]]
            if executed:
                failures.append(f"Forbidden RBAC tools executed as OK: {executed}")

        if "must_contain_any" in meta:
            if not any(needle.lower() in lower_c for needle in meta["must_contain_any"]):
                failures.append(f"Response missing expected substrings {meta['must_contain_any']}")

        if "must_not_contain" in meta:
            hits = [bad for bad in meta["must_not_contain"] if bad.lower() in lower_c]
            if hits:
                failures.append(f"Forbidden strings found: {hits}")

        if meta.get("require_kannada_script"):
            if not KANNADA_RE.search(content):
                failures.append("Response lacks Kannada script characters")
            min_ratio = float(meta.get("min_kannada_alpha_ratio", 0.0))
            ratio = _kannada_alpha_ratio(content)
            if min_ratio > 0 and ratio < min_ratio:
                failures.append(f"Kannada script ratio {ratio} < {min_ratio}")

        if meta.get("check_numeric_groundedness"):
            v_ok, v_score, v_det = verify_turn_groundedness(
                content,
                intent,
                payload_dict.get("data_quality"),
                verified_ev,
                payload_dict=payload_dict,
                tool_traces=payload_dict.get("tool_traces"),
            )
            if not v_ok:
                failures.append(f"Groundedness check failed (score={v_score}): {v_det}")

        if sse_events is not None and meta.get("expected_sse_events"):
            seen_names = {ev for ev, _ in sse_events}
            missing_ev = [e for e in meta["expected_sse_events"] if e not in seen_names]
            if missing_ev:
                failures.append(f"Missing SSE event types: {missing_ev}")
            if meta.get("require_progressive_before_turn_end"):
                step_times = [ts for ev, ts in sse_events if ev == "agent_step"]
                if len(step_times) < 2:
                    failures.append("Fewer than 2 agent_step SSE events emitted")
                else:
                    spread_ms = (max(step_times) - min(step_times)) * 1000.0
                    if spread_ms < 0.5:
                        failures.append(f"Post-turn buffered SSE detected (spread={spread_ms:.3f}ms)")

        self.score = 1.0 if not failures else 0.0
        self.reason = "All SmartStock DeepEval checks passed." if not failures else "; ".join(failures)
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase, *args, **kwargs) -> float:
        return self.measure(test_case, *args, **kwargs)


def _setup_wal_eval_db(db_path: Path):
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 15.0},
        poolclass=NullPool,
    )
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
        conn.exec_driver_sql("PRAGMA synchronous=NORMAL;")

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with SessionLocal() as db:
        owner = User(email="owner@kirana.in", hashed_password="x", full_name="Pavan S", is_active=True)
        cashier = User(email="cashier@kirana.in", hashed_password="x", full_name="Ravi K", is_active=True)
        db.add_all([owner, cashier])
        db.flush()

        biz = Business(name="Kirana & General Stores", city="Haveri", state="Karnataka", currency="INR")
        db.add(biz)
        db.flush()

        owner_mem = BusinessMembership(user_id=owner.id, business_id=biz.id, role=RoleEnum.OWNER, is_active=True)
        cashier_mem = BusinessMembership(user_id=cashier.id, business_id=biz.id, role=RoleEnum.CASHIER, is_active=True)
        db.add_all([owner_mem, cashier_mem])
        db.flush()

        cat = Category(business_id=biz.id, name="Groceries")
        db.add(cat)
        db.flush()

        sup_alpha = Supplier(business_id=biz.id, name="Alpha Supply", lead_time_days=4, payment_terms_days=15)
        sup_beta = Supplier(business_id=biz.id, name="Beta Traders", lead_time_days=2, payment_terms_days=7)
        db.add_all([sup_alpha, sup_beta])
        db.flush()

        p_dal = Product(
            business_id=biz.id, category_id=cat.id, name="Toor Dal 1kg", sku="DAL-1",
            supplier_id=sup_alpha.id, purchase_cost=100.0, selling_price=140.0,
            current_stock=4.0, reorder_threshold=15.0, min_order_qty=20.0, unit="kg",
        )
        p_oil = Product(
            business_id=biz.id, category_id=cat.id, name="Sunflower Oil 1L", sku="OIL-1",
            supplier_id=sup_alpha.id, purchase_cost=120.0, selling_price=150.0,
            current_stock=50.0, reorder_threshold=10.0, min_order_qty=12.0, unit="L",
        )
        db.add_all([p_dal, p_oil])
        db.flush()

        now = datetime.now()
        inv_today = Invoice(
            business_id=biz.id, invoice_number="INV-TODAY-1", status=InvoiceStatusEnum.COMPLETED,
            subtotal=1980.0, discount_amount=0.0, tax_amount=0.0, total_amount=1980.0, total_cost=1440.0,
            created_at=now,
        )
        inv_yest = Invoice(
            business_id=biz.id, invoice_number="INV-YEST-1", status=InvoiceStatusEnum.COMPLETED,
            subtotal=560.0, discount_amount=0.0, tax_amount=0.0, total_amount=560.0, total_cost=400.0,
            created_at=now - timedelta(days=1),
        )
        inv_lw = Invoice(
            business_id=biz.id, invoice_number="INV-LW-1", status=InvoiceStatusEnum.COMPLETED,
            subtotal=3000.0, discount_amount=0.0, tax_amount=0.0, total_amount=3000.0, total_cost=2100.0,
            created_at=now - timedelta(days=8),
        )
        db.add_all([inv_today, inv_yest, inv_lw])
        db.flush()

        db.add_all([
            InvoiceItem(invoice_id=inv_today.id, product_id=p_dal.id, product_name=p_dal.name,
                        quantity=12.0, unit_price=140.0, unit_cost=100.0, total_amount=1680.0, total_cost=1200.0),
            InvoiceItem(invoice_id=inv_today.id, product_id=p_oil.id, product_name=p_oil.name,
                        quantity=2.0, unit_price=150.0, unit_cost=120.0, total_amount=300.0, total_cost=240.0),
            InvoiceItem(invoice_id=inv_yest.id, product_id=p_dal.id, product_name=p_dal.name,
                        quantity=4.0, unit_price=140.0, unit_cost=100.0, total_amount=560.0, total_cost=400.0),
            InvoiceItem(invoice_id=inv_lw.id, product_id=p_oil.id, product_name=p_oil.name,
                        quantity=20.0, unit_price=150.0, unit_cost=120.0, total_amount=3000.0, total_cost=2100.0),
        ])

        po_a = PurchaseOrder(
            business_id=biz.id, supplier_id=sup_alpha.id, po_number="PO-ALPHA-1",
            status=POStatusEnum.COMPLETED, order_date=date.today() - timedelta(days=10),
            subtotal=1100.0, total_amount=1100.0,
        )
        po_b = PurchaseOrder(
            business_id=biz.id, supplier_id=sup_beta.id, po_number="PO-BETA-1",
            status=POStatusEnum.COMPLETED, order_date=date.today() - timedelta(days=5),
            subtotal=950.0, total_amount=950.0,
        )
        db.add_all([po_a, po_b])
        db.flush()
        db.add_all([
            PurchaseOrderItem(purchase_order_id=po_a.id, product_id=p_dal.id, quantity_ordered=10.0, unit_cost=110.0, total_cost=1100.0),
            PurchaseOrderItem(purchase_order_id=po_b.id, product_id=p_dal.id, quantity_ordered=10.0, unit_cost=95.0, total_cost=950.0),
        ])

        db.add(Customer(business_id=biz.id, name="Ramesh Kirana Credit", phone="9876543210", outstanding_balance=450.0))
        db.add(Expense(business_id=biz.id, category=ExpenseCategoryEnum.RENT, title="Shop rent", amount=500.0, expense_date=date.today()))
        db.commit()

        ids = {
            "owner_id": owner.id,
            "cashier_id": cashier.id,
            "business_id": biz.id,
            "owner_mem_id": owner_mem.id,
            "cashier_mem_id": cashier_mem.id,
        }
    return engine, SessionLocal, ids


def _build_ctx(db: Session, ids: Dict[str, Any], role: str = "OWNER") -> TenantContext:
    user_id = ids["owner_id"] if role == "OWNER" else ids["cashier_id"]
    mem_id = ids["owner_mem_id"] if role == "OWNER" else ids["cashier_mem_id"]
    user = db.query(User).filter(User.id == user_id).one()
    biz = db.query(Business).filter(Business.id == ids["business_id"]).one()
    mem = db.query(BusinessMembership).filter(BusinessMembership.id == mem_id).one()
    return TenantContext(user=user, business=biz, membership=mem)


def test_smartstock_ai_ultra_22_case_deepeval_ci_gate(tmp_path: Path):
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    engine, SessionLocal, ids = _setup_wal_eval_db(tmp_path / "ci_wal_eval.db")
    metric = SmartStockEvalMetric(threshold=1.0)
    passed_cases = 0
    failure_report: List[str] = []

    try:
        with SessionLocal() as db:
            for case in dataset["cases"]:
                cid = case["id"]
                role = case.get("role", "OWNER")
                ctx = _build_ctx(db, ids, role=role)

                if "turns" in case:
                    conv_id = None
                    turn_ok = True
                    for idx, turn in enumerate(case["turns"], start=1):
                        res = run_ai_ultra_turn(
                            db,
                            ctx,
                            message=turn["prompt"],
                            conversation_id=conv_id,
                            mode=turn.get("mode", "QUICK_ASSIST"),
                            language=turn.get("language", "auto"),
                        )
                        conv_id = res.conversation_id
                        am = res.assistant_message
                        p = am.payload
                        tools_called = [
                            ToolCall(name=t.tool_name, output=t.summary)
                            for t in p.tool_traces
                            if t.status in SUCCESS_STATUSES
                        ]
                        tc = LLMTestCase(
                            input=turn["prompt"],
                            actual_output=am.content,
                            retrieval_context=[json.dumps(p.model_dump(), default=str)],
                            tools_called=tools_called,
                            metadata={
                                **turn,
                                "intent": am.intent,
                                "detected_language": res.detected_language,
                                "agents": [a.agent_name for a in p.agents_involved],
                                "payload": p.model_dump(),
                            },
                        )
                        metric.measure(tc)
                        if not metric.is_successful():
                            turn_ok = False
                            failure_report.append(f"{cid} Turn {idx}: {metric.reason}")
                    if turn_ok:
                        passed_cases += 1

                elif case.get("expected_sse_events"):
                    gen = stream_ai_ultra_chat(
                        db,
                        ctx,
                        message=case["prompt"],
                        mode=case.get("mode", "DEEP_ANALYSIS"),
                        language=case.get("language", "auto"),
                    )
                    sse_events: List[Tuple[str, float]] = []
                    final_payload: Optional[Dict[str, Any]] = None
                    for raw_ev in gen:
                        now_t = time.perf_counter()
                        ev_name, ev_data = "", ""
                        for ln in raw_ev.splitlines():
                            if ln.startswith("event:"):
                                ev_name = ln.split(":", 1)[1].strip()
                            elif ln.startswith("data:"):
                                ev_data = ln.split(":", 1)[1].strip()
                        sse_events.append((ev_name, now_t))
                        if ev_name == "final" and ev_data:
                            final_payload = json.loads(ev_data)

                    am_d = (final_payload or {}).get("assistant_message", {})
                    p_d = am_d.get("payload", {})
                    tools_called = [
                        ToolCall(name=t["tool_name"], output=t.get("summary"))
                        for t in p_d.get("tool_traces", [])
                        if t.get("status") in SUCCESS_STATUSES
                    ]
                    tc = LLMTestCase(
                        input=case["prompt"],
                        actual_output=am_d.get("content", ""),
                        retrieval_context=[json.dumps(p_d, default=str)],
                        tools_called=tools_called,
                        metadata={
                            **case,
                            "intent": am_d.get("intent", ""),
                            "detected_language": (final_payload or {}).get("detected_language", "en"),
                            "agents": [a["agent_name"] for a in p_d.get("agents_involved", [])],
                            "payload": p_d,
                            "sse_events": sse_events,
                        },
                    )
                    metric.measure(tc)
                    if metric.is_successful():
                        passed_cases += 1
                    else:
                        failure_report.append(f"{cid}: {metric.reason}")

                else:
                    res = run_ai_ultra_turn(
                        db,
                        ctx,
                        message=case["prompt"],
                        mode=case.get("mode", "QUICK_ASSIST"),
                        language=case.get("language", "auto"),
                    )
                    am = res.assistant_message
                    p = am.payload
                    tools_called = [
                        ToolCall(name=t.tool_name, output=t.summary)
                        for t in p.tool_traces
                        if t.status in SUCCESS_STATUSES
                    ]
                    # Independent tool ground-truth verification (e.g., QUICK_ASSIST hides tables/evidence from UI)
                    verified_ev: Dict[str, Any] = {}
                    if case.get("must_not_invent_sku_metrics"):
                        verified_ev["inventory_lookup"] = {"matched_query": True, "items": []}
                    if any(t.name == "supplier_price_comparison" for t in tools_called):
                        verified_ev["supplier_comparison"] = tool_supplier_price_comparison(db, ctx)
                    eval_row = db.query(AIEvaluation).filter(AIEvaluation.task_id == res.task_id).one()
                    assert eval_row.passed is True, f"{cid} runtime AIEvaluation failed: {eval_row.details_json}"
                    tc = LLMTestCase(
                        input=case["prompt"],
                        actual_output=am.content,
                        retrieval_context=[json.dumps(p.model_dump(), default=str)],
                        tools_called=tools_called,
                        metadata={
                            **case,
                            "intent": am.intent,
                            "detected_language": res.detected_language,
                            "agents": [a.agent_name for a in p.agents_involved],
                            "payload": p.model_dump(),
                            "verified_evidence": verified_ev,
                        },
                    )
                    metric.measure(tc)
                    if metric.is_successful():
                        passed_cases += 1
                    else:
                        failure_report.append(f"{cid}: {metric.reason}")

            snap = get_ai_observability_snapshot(db, ids["business_id"])
            assert snap["benchmark_pass_rate"] == 100.0
    finally:
        engine.dispose()

    assert not failure_report, f"CI eval failures ({passed_cases}/22 passed):\n" + "\n".join(failure_report)
    assert passed_cases >= 20, f"Expected >=20/22 CI eval cases to pass, got {passed_cases}/22"


def test_ci_mocked_gemini_interactions_eval_preserving_groundedness(tmp_path: Path, monkeypatch):
    """Runs core groundedness cases through mocked Google GenAI Interactions API."""
    engine, SessionLocal, ids = _setup_wal_eval_db(tmp_path / "ci_gemini_eval.db")

    class _MockInteractions:
        def create(self, **kwargs):
            # Echo back the grounded deterministic summary extracted from input JSON
            body = json.loads(kwargs.get("input", "{}"))
            summary = body.get("deterministic_summary", "")
            return SimpleNamespace(output_text=summary, usage=SimpleNamespace(total_tokens=64))

    class _MockClient:
        def __init__(self, api_key: str):
            self.interactions = _MockInteractions()

    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "AIzaSy-ci-mock-key")
    monkeypatch.setattr(llm_gateway, "genai", SimpleNamespace(Client=_MockClient))

    try:
        with SessionLocal() as db:
            ctx = _build_ctx(db, ids, role="OWNER")
            for q, mode in [
                ("How much did I sell today?", "QUICK_ASSIST"),
                ("ಇವತ್ತು ನನ್ನ ಅಂಗಡಿಯಲ್ಲಿ ಎಷ್ಟು ಸೇಲ್ ಆಗಿದೆ?", "QUICK_ASSIST"),
                ("Give me a complete analysis of my store", "DEEP_ANALYSIS"),
            ]:
                res = run_ai_ultra_turn(db, ctx, message=q, mode=mode)
                assert res.assistant_message.payload.llm_provider.startswith("gemini:")
            snap = get_ai_observability_snapshot(db, ids["business_id"])
            assert snap["benchmark_pass_rate"] == 100.0
    finally:
        engine.dispose()
