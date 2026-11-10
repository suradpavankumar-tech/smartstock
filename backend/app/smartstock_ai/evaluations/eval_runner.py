import json
import re
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models.ai import AIAlert, AIApproval, AIEvaluation, AIMessage, AITask


_EXEMPT_VERIFICATION_INTENTS = {
    "CONVERSATIONAL_GREETING",
    "CONVERSATIONAL_ACK",
    "CONVERSATIONAL_HELP",
    "GENERAL_GPT_CHAT",
    "SAVE_MEMORY",
    "MANAGE_WORKFLOWS",
    "MANAGE_MEMORIES",
    "MANAGE_DOCUMENTS",
    "WHAT_IF_SIMULATION",
}


def _collect_numeric_values(obj: Any, out: List[float]) -> None:
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        out.append(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_numeric_values(v, out)
    elif isinstance(obj, (list, tuple, set)):
        for item in obj:
            _collect_numeric_values(item, out)


def verify_turn_groundedness(
    reply_md: str,
    intent: str,
    data_quality: Optional[str],
    verified_evidence: Dict[str, Any],
    payload_dict: Optional[Dict[str, Any]] = None,
    tool_traces: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[bool, float, Dict[str, Any]]:
    """
    Deterministic post-synthesis groundedness verifier.
    Returns (passed, groundedness_score, details_dict).
    """
    text = reply_md or ""
    if (
        intent in _EXEMPT_VERIFICATION_INTENTS
        or intent.startswith("BLOCKED_")
        or data_quality in ("HYPOTHETICAL_SIMULATION", "GOVERNANCE_BLOCK")
        or verified_evidence.get("rbac_restricted")
        or any(m in text for m in ("Access Restricted:", "ಪ್ರವೇಶ ನಿರ್ಬಂಧಿತವಾಗಿದೆ", "अनुमति अस्वीकृत"))
    ):
        return True, 1.0, {"mode": "exempt", "intent": intent}

    # Hallucination check #1: matched empty inventory lookup must never invent prices/currency
    inv_ev = verified_evidence.get("inventory_lookup")
    if isinstance(inv_ev, dict) and inv_ev.get("matched_query") and len(inv_ev.get("items") or []) == 0:
        if "₹" in text or re.search(r"\bRs\.?\s*\d", text, flags=re.IGNORECASE):
            return False, 0.0, {
                "mode": "empty_lookup_hallucination",
                "reason": "Inventory lookup matched 0 products but response stated a currency price.",
            }

    combined_evidence: Dict[str, Any] = {
        "verified_evidence": verified_evidence,
        "payload": payload_dict or {},
        "tool_traces": tool_traces or [],
    }
    ev_flat = json.dumps(combined_evidence, default=str).replace(",", "")
    ev_nums: List[float] = []
    _collect_numeric_values(combined_evidence, ev_nums)

    # Mask ISO dates & HH:MM timestamps so date digits aren't treated as KPI numbers
    masked = re.sub(r"\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?\b", " ", text)
    # Mask fixed reporting window labels like "7 days", "30 day(s)", "90+ day"
    masked = re.sub(
        r"\b(?:1|7|14|30|90)\+?\s*(?:days?|day\(s\)|d\b|ದಿನಗಳು?|ದಿನಗಳಲ್ಲಿ|ದಿನ|दिनों?|दिन)\b",
        " ",
        masked,
        flags=re.IGNORECASE,
    )

    raw_nums = re.findall(r"(?:₹\s*)?\d[\d,]*(?:\.\d+)?", masked)
    checked: List[str] = []
    ungrounded: List[str] = []

    for tok in raw_nums:
        clean = tok.replace("₹", "").replace(",", "").strip()
        try:
            val = float(clean)
        except ValueError:
            continue
        is_currency = tok.strip().startswith("₹")
        # Skip tiny plain integer list/sentence ordinals unless prefixed with ₹
        if not is_currency and val < 10 and "." not in clean:
            continue

        checked.append(tok)
        variants = {
            clean,
            f"{val:.2f}",
            f"{val:.1f}",
            f"{val:g}",
            str(int(val)) if val.is_integer() else clean,
        }
        str_match = any(v in ev_flat for v in variants)
        num_match = any(
            abs(val - ev_v) < 0.015 or any(val == round(ev_v, dp) for dp in (0, 1, 2))
            for ev_v in ev_nums
        )
        if not (str_match or num_match):
            ungrounded.append(tok)

    if not checked:
        return True, 1.0, {"mode": "checked", "checked": [], "ungrounded": []}

    score = round((len(checked) - len(ungrounded)) / len(checked), 3)
    passed = len(ungrounded) == 0
    return passed, score, {"mode": "checked", "checked": checked, "ungrounded": ungrounded}


def record_turn_evaluation(
    db: Session,
    *,
    business_id: int,
    user_id: int,
    task_id: int,
    query: str,
    mode: str,
    intent: str,
    passed: bool,
    groundedness_score: float,
    latency_ms: int,
    tokens_used: int,
    details: Dict[str, Any],
) -> AIEvaluation:
    ev = AIEvaluation(
        business_id=business_id,
        user_id=user_id,
        task_id=task_id,
        suite_name="runtime_turn",
        query=query[:1000],
        mode=mode,
        expected_intent=None,
        actual_intent=intent,
        passed=passed,
        groundedness_score=round(groundedness_score, 3),
        latency_ms=latency_ms,
        tokens_used=tokens_used,
        details_json=json.dumps(details, default=str),
    )
    db.add(ev)
    return ev


def get_ai_observability_snapshot(db: Session, business_id: int) -> Dict[str, Any]:
    total_tasks = db.query(AITask).filter(AITask.business_id == business_id).count()
    total_messages = db.query(AIMessage).filter(AIMessage.business_id == business_id).count()
    avg_lat = (
        db.query(func.coalesce(func.avg(AITask.duration_ms), 0.0))
        .filter(AITask.business_id == business_id)
        .scalar()
        or 0.0
    )
    total_tokens = (
        db.query(func.coalesce(func.sum(AIMessage.tokens_used), 0))
        .filter(AIMessage.business_id == business_id)
        .scalar()
        or 0
    )
    pending = db.query(AIApproval).filter(AIApproval.business_id == business_id, AIApproval.status == "PENDING").count()
    executed = db.query(AIApproval).filter(AIApproval.business_id == business_id, AIApproval.status == "EXECUTED").count()
    rejected = db.query(AIApproval).filter(AIApproval.business_id == business_id, AIApproval.status == "REJECTED").count()
    active_alerts = db.query(AIAlert).filter(AIAlert.business_id == business_id, AIAlert.status == "ACTIVE").count()

    eval_rows = db.query(AIEvaluation).filter(AIEvaluation.business_id == business_id).all()
    pass_rate = None
    if eval_rows:
        passed_cnt = sum(1 for e in eval_rows if e.passed)
        pass_rate = round((passed_cnt / len(eval_rows)) * 100.0, 1)

    recent_tasks = (
        db.query(AITask)
        .filter(AITask.business_id == business_id)
        .order_by(desc(AITask.created_at))
        .limit(10)
        .all()
    )

    return {
        "total_tasks": total_tasks,
        "total_messages": total_messages,
        "avg_latency_ms": round(float(avg_lat), 1),
        "total_tokens_used": int(total_tokens),
        "approvals_pending": pending,
        "approvals_executed": executed,
        "approvals_rejected": rejected,
        "active_alerts": active_alerts,
        "benchmark_pass_rate": pass_rate,
        "recent_tasks": [
            {
                "id": t.id,
                "mode": t.mode,
                "intent": t.intent,
                "status": t.status,
                "objective": t.objective[:120],
                "duration_ms": t.duration_ms,
                "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            }
            for t in recent_tasks
        ],
    }
