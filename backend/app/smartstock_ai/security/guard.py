import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

from app.models.business import RoleEnum

# Explicit role-based tool authorization matrix
OWNER_TOOLS: Set[str] = {
    "workspace_overview",
    "inventory_lookup",
    "sales_summary",
    "financial_pnl",
    "profit_drop_investigation",
    "margin_ranking",
    "working_capital_analysis",
    "supplier_price_comparison",
    "khata_receivables",
    "cash_till_status",
    "demand_forecasting",
    "reorder_recommendations",
    "stock_ageing_dead_stock",
    "expiring_batches",
    "what_if_simulation",
    "audit_anomalies",
    "daily_briefing",
    "document_analysis",
    "gstr1_summary",
    # Approval-gated write actions
    "CREATE_PURCHASE_ORDER",
    "ADJUST_STOCK",
    "UPDATE_PRODUCT_PRICE",
    "RECORD_EXPENSE",
    "RECORD_KHATA_PAYMENT",
    "IMPORT_DOCUMENT_ITEMS",
    "ENABLE_WORKFLOW",
}

MANAGER_TOOLS: Set[str] = {
    "workspace_overview",
    "inventory_lookup",
    "sales_summary",
    "financial_pnl",
    "profit_drop_investigation",
    "margin_ranking",
    "working_capital_analysis",
    "supplier_price_comparison",
    "khata_receivables",
    "cash_till_status",
    "demand_forecasting",
    "reorder_recommendations",
    "stock_ageing_dead_stock",
    "expiring_batches",
    "what_if_simulation",
    "audit_anomalies",
    "daily_briefing",
    "document_analysis",
    "gstr1_summary",
    # Operational approvals (bulk/AI price rules & policy workflows reserved for OWNER)
    "CREATE_PURCHASE_ORDER",
    "ADJUST_STOCK",
    "RECORD_EXPENSE",
    "RECORD_KHATA_PAYMENT",
    "IMPORT_DOCUMENT_ITEMS",
}

CASHIER_TOOLS: Set[str] = {
    "workspace_overview",
    "inventory_lookup",
    "khata_receivables",
    "cash_till_status",
    "expiring_batches",
}

ROLE_ALLOWED_TOOLS: Dict[str, Set[str]] = {
    RoleEnum.OWNER.value: OWNER_TOOLS,
    RoleEnum.MANAGER.value: MANAGER_TOOLS,
    RoleEnum.CASHIER.value: CASHIER_TOOLS,
}

APPROVAL_REQUIRED_ACTIONS: Set[str] = {
    "CREATE_PURCHASE_ORDER",
    "ADJUST_STOCK",
    "UPDATE_PRODUCT_PRICE",
    "RECORD_EXPENSE",
    "RECORD_KHATA_PAYMENT",
    "IMPORT_DOCUMENT_ITEMS",
    "ENABLE_WORKFLOW",
}

ROLE_APPROVAL_EXECUTION: Dict[str, Set[str]] = {
    RoleEnum.OWNER.value: APPROVAL_REQUIRED_ACTIONS,
    RoleEnum.MANAGER.value: {
        "CREATE_PURCHASE_ORDER",
        "ADJUST_STOCK",
        "RECORD_EXPENSE",
        "RECORD_KHATA_PAYMENT",
        "IMPORT_DOCUMENT_ITEMS",
    },
    RoleEnum.CASHIER.value: set(),
}

# Prompt injection, SQL exfiltration & credential harvesting signatures
INJECTION_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\b(drop\s+table|truncate\s+table|delete\s+from|alter\s+table|union\s+select|;\s*select\s+\*|select\s+\*\s+from)\b", re.IGNORECASE), "RAW_SQL_INJECTION"),
    (re.compile(r"\b(ignore\s+(all\s+|any\s+)?previous\s+instructions|disregard\s+(all\s+)?(previous\s+|system\s+)?instructions?|disregard\s+system\s+prompt|reveal\s+(your\s+)?(system\s+prompt|hidden\s+prompt|instructions))\b", re.IGNORECASE), "PROMPT_OVERRIDE"),
    (re.compile(r"\b(bypass\s+approval|skip\s+approval|execute\s+without\s+approval|force\s+write|disable\s+rbac|skip\s+hitl|approve\s+automatically)\b", re.IGNORECASE), "GOVERNANCE_BYPASS"),
    (re.compile(r"\b(printenv|os\.environ|secret_key|openai_api_key|gemini_api_key|show\s+all\s+passwords|dump\s+users\s+table|select\s+.*\s+from\s+users|read\s+\.env)\b", re.IGNORECASE), "SECRET_OR_PRIVILEGED_DUMP"),
    (re.compile(r"\b(other\s+tenant|another\s+shop|another\s+business|all\s+businesses\s+in\s+database)\b|business_id\s*!=", re.IGNORECASE), "CROSS_TENANT_PROBE"),
    (re.compile(r"(ಹಿಂದಿನ\s+ನಿಯಮ.*ಮರೆತುಬಿಡಿ|ಸಿಸ್ಟಮ್\s+ಪ್ರಾಂಪ್ಟ್\s+ತೋರಿಸಿ|ಎಲ್ಲಾ\s+ಪಾಸ್‌ವರ್ಡ್\s+ತೋರಿಸಿ|ಇನ್ನೊಂದು\s+ಅಂಗಡಿಯ\s+ಡೇಟಾ|ಅನುಮೋದನೆ\s+ಇಲ್ಲದೆ)", re.IGNORECASE), "PROMPT_OVERRIDE"),
    (re.compile(r"(पिछले\s+नियम\s+भूल\s+जाओ|सिस्टम\s+प्रॉम्प्ट\s+दिखाओ|दूसरी\s+दुकान\s+का\s+डेटा|बिना\s+मंजूरी)", re.IGNORECASE), "PROMPT_OVERRIDE"),
]

SECRET_VALUE_PATTERNS: List[re.Pattern] = [
    re.compile(r"(sk-[A-Za-z0-9_-]{12,})"),
    re.compile(r"(AIza[0-9A-Za-z_-]{20,})"),
    re.compile(r"(?i)(api[_-]?key|secret[_-]?key|password|bearer\s+[A-Za-z0-9._-]+|jwt_token)\s*[:=]\s*\S+"),
]


@dataclass
class SecurityInspection:
    allowed: bool
    reason_code: Optional[str] = None
    explanation: Optional[str] = None


def inspect_prompt_security(prompt: str) -> SecurityInspection:
    text = (prompt or "").strip()
    for pattern, code in INJECTION_PATTERNS:
        if pattern.search(text):
            return SecurityInspection(
                allowed=False,
                reason_code=code,
                explanation=(
                    f"Blocked by SmartStock Trust & Governance Guard ({code}). "
                    "AI Ultra strictly forbids raw SQL execution, system/credential disclosure, "
                    "cross-tenant probing, or bypassing human approval and role policies."
                ),
            )
    return SecurityInspection(allowed=True)


def is_tool_allowed(role: str, tool_name: str) -> bool:
    allowed = ROLE_ALLOWED_TOOLS.get(role, CASHIER_TOOLS)
    return tool_name in allowed


def can_approve_action(role: str, action_type: str) -> bool:
    allowed = ROLE_APPROVAL_EXECUTION.get(role, set())
    return action_type in allowed


def get_role_tool_partition(role: str) -> Tuple[List[str], List[str]]:
    allowed = sorted(ROLE_ALLOWED_TOOLS.get(role, CASHIER_TOOLS))
    restricted = sorted(OWNER_TOOLS - ROLE_ALLOWED_TOOLS.get(role, CASHIER_TOOLS))
    return allowed, restricted


def contains_secret_pattern(text: str) -> bool:
    for pattern in SECRET_VALUE_PATTERNS:
        if pattern.search(text or ""):
            return True
    return False


def redact_secrets(text: str) -> str:
    cleaned = text or ""
    for pattern in SECRET_VALUE_PATTERNS:
        cleaned = pattern.sub("[REDACTED_CREDENTIAL]", cleaned)
    return cleaned


def sanitize_tool_args(args: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Recursively strips secret/credential strings from tool trace logs before persistence."""
    if not args:
        return {}
    sanitized: Dict[str, Any] = {}
    for k, v in args.items():
        lk = str(k).lower()
        if any(s in lk for s in ("password", "secret", "api_key", "token", "authorization")):
            sanitized[k] = "[REDACTED_CREDENTIAL]"
        elif isinstance(v, str):
            sanitized[k] = redact_secrets(v)[:500]
        elif isinstance(v, dict):
            sanitized[k] = sanitize_tool_args(v)
        elif isinstance(v, list):
            sanitized[k] = [redact_secrets(x)[:300] if isinstance(x, str) else x for x in v[:25]]
        else:
            sanitized[k] = v
    return sanitized
