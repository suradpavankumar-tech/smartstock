import time
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import TenantContext
from app.models.product import Product
from app.models.customer import Customer
from app.models.purchase import Supplier, PurchaseOrder, POStatusEnum
from app.models.cash_shift import CashShift
from app.schemas.agent import (
    AgentAction,
    AgentCapabilitiesOut,
    AgentChatResponse,
    AgentChatTurn,
    AgentFunctionSpec,
    AgentMetricItem,
    AgentToolCall,
)


@dataclass
class AgentHandlerResult:
    reply: str
    intent: str
    tool_calls: List[AgentToolCall]
    metrics: List[AgentMetricItem]
    actions: List[AgentAction]


@dataclass
class AgentToolEntry:
    spec: AgentFunctionSpec
    handler: Callable[[Session, TenantContext, str, List[AgentChatTurn], str], AgentHandlerResult]


AGENT_FUNCTION_REGISTRY: Dict[str, AgentToolEntry] = {}


def register_agent_function(
    name: str,
    label: str,
    description: str,
    category: str,
    example_prompt: Optional[str] = None,
):
    """Decorator to register executable store functions into the SmartStock AI Agent runtime."""

    def decorator(
        fn: Callable[[Session, TenantContext, str, List[AgentChatTurn], str], AgentHandlerResult]
    ):
        AGENT_FUNCTION_REGISTRY[name] = AgentToolEntry(
            spec=AgentFunctionSpec(
                name=name,
                label=label,
                description=description,
                category=category,
                status="ACTIVE",
                example_prompt=example_prompt,
            ),
            handler=fn,
        )
        return fn

    return decorator


def list_agent_functions() -> List[AgentFunctionSpec]:
    return [entry.spec for entry in AGENT_FUNCTION_REGISTRY.values()]


@register_agent_function(
    name="get_workspace_heartbeat",
    label="Workspace Heartbeat",
    description="Inspects active shop metadata, catalog SKU count, open cash shift, and pending PO count from live DB.",
    category="Workspace",
    example_prompt="Check workspace status",
)
def _fn_workspace_heartbeat(
    db: Session,
    ctx: TenantContext,
    message: str,
    history: List[AgentChatTurn],
    language: str,
) -> AgentHandlerResult:
    t0 = time.perf_counter()
    bid = ctx.business.id

    active_skus = (
        db.query(Product)
        .filter(Product.business_id == bid, Product.is_archived == False)
        .count()
    )
    suppliers_count = (
        db.query(Supplier)
        .filter(Supplier.business_id == bid, func.upper(Supplier.is_active) != "NO")
        .count()
    )
    customers_count = (
        db.query(Customer).filter(Customer.business_id == bid).count()
    )
    open_pos = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.business_id == bid,
            PurchaseOrder.status.in_([POStatusEnum.DRAFT, POStatusEnum.ORDERED, POStatusEnum.PARTIALLY_RECEIVED]),
        )
        .count()
    )
    active_shift = (
        db.query(CashShift)
        .filter(CashShift.business_id == bid, CashShift.status == "OPEN")
        .first()
    )

    elapsed_ms = max(1, int((time.perf_counter() - t0) * 1000))
    till_text = (
        f"OPEN (Float ₹{active_shift.opening_float:,.2f})"
        if active_shift
        else "CLOSED"
    )

    reply = (
        f"Workspace **{ctx.business.name}** ({ctx.business.city}) is connected and ready.\n\n"
        f"- **Active Role:** {ctx.membership.role.value}\n"
        f"- **Active Catalogue:** {active_skus} tracked SKUs\n"
        f"- **Cash Register Till:** {till_text}\n"
        f"- **Active Suppliers / Open POs:** {suppliers_count} suppliers · {open_pos} open purchase orders\n\n"
        f"The conversational runtime is active and ready whenever you specify additional agent functions."
    )

    return AgentHandlerResult(
        reply=reply,
        intent="WORKSPACE_HEARTBEAT",
        tool_calls=[
            AgentToolCall(
                tool_name="get_workspace_heartbeat",
                label="Workspace Heartbeat",
                status="COMPLETED",
                summary=f"Queried live workspace counts for {ctx.business.name}",
                duration_ms=elapsed_ms,
            )
        ],
        metrics=[
            AgentMetricItem(label="Tracked SKUs", value=str(active_skus), tone="info"),
            AgentMetricItem(label="Customers", value=str(customers_count), tone="neutral"),
            AgentMetricItem(label="Open POs", value=str(open_pos), tone="warning" if open_pos > 0 else "positive"),
            AgentMetricItem(
                label="Cash Till",
                value="OPEN" if active_shift else "CLOSED",
                tone="positive" if active_shift else "neutral",
            ),
        ],
        actions=[
            AgentAction(label="Open POS Counter", target_tab="pos"),
            AgentAction(label="View Reorder Queue", target_tab="reorder"),
        ],
    )


@register_agent_function(
    name="list_registered_functions",
    label="Function Registry",
    description="Lists all tools & executable capabilities currently bound to this AI Agent.",
    category="System",
    example_prompt="List registered functions",
)
def _fn_list_capabilities(
    db: Session,
    ctx: TenantContext,
    message: str,
    history: List[AgentChatTurn],
    language: str,
) -> AgentHandlerResult:
    t0 = time.perf_counter()
    specs = list_agent_functions()
    lines = [f"- **{s.label}** (`{s.name}`) — {s.description}" for s in specs]
    reply = (
        f"**SmartStock AI Agent** currently has **{len(specs)} core runtime function(s)** registered for **{ctx.business.name}**:\n\n"
        + "\n".join(lines)
        + "\n\nTell me any custom shop functions you want this agent to perform (for example: live stock lookups, Khata credit checks, billing actions, PO generation, or WhatsApp workflows) and I will bind them here."
    )
    elapsed_ms = max(1, int((time.perf_counter() - t0) * 1000))
    return AgentHandlerResult(
        reply=reply,
        intent="LIST_CAPABILITIES",
        tool_calls=[
            AgentToolCall(
                tool_name="list_registered_functions",
                label="Inspect Function Registry",
                status="COMPLETED",
                summary=f"Returned {len(specs)} registered agent tool(s)",
                duration_ms=elapsed_ms,
            )
        ],
        metrics=[],
        actions=[
            AgentAction(label="Check Workspace Status", prompt="Check workspace status"),
        ],
    )


ROUTE_MAP = [
    (["pos", "bill", "checkout", "counter", "billing"], "pos", "Point of Sale (POS)"),
    (["overview", "dashboard", "home"], "overview", "Overview Dashboard"),
    (["product", "sku", "catalog", "catalogue"], "products", "Products & Categories"),
    (["stock", "batch", "inventory", "ledger"], "inventory", "Stock Ledger & Batches"),
    (["sale", "invoice", "receipt"], "sales", "Sales & Invoices"),
    (["khata", "customer", "credit", "due"], "customers", "Customers & Khata"),
    (["purchase", "po ", "order"], "purchases", "Purchase Orders"),
    (["supplier", "vendor", "distributor"], "suppliers", "Suppliers & Vendors"),
    (["expense", "opex", "spend"], "expenses", "Operating Expenses"),
    (["analytic", "p&l", "profit", "margin"], "analytics", "Financial Analytics"),
    (["reorder", "replenish", "low stock"], "reorder", "Reorder Recommendations"),
]


@register_agent_function(
    name="resolve_workspace_route",
    label="Workspace Navigator",
    description="Resolves natural-language workspace section names into instant navigation shortcuts.",
    category="Navigation",
    example_prompt="Open POS counter",
)
def _fn_resolve_route(
    db: Session,
    ctx: TenantContext,
    message: str,
    history: List[AgentChatTurn],
    language: str,
) -> AgentHandlerResult:
    t0 = time.perf_counter()
    lower = message.lower()
    matched_tab = None
    matched_label = None
    for keywords, tab, title in ROUTE_MAP:
        if any(k in lower for k in keywords):
            matched_tab = tab
            matched_label = title
            break

    elapsed_ms = max(1, int((time.perf_counter() - t0) * 1000))
    if matched_tab and matched_label:
        return AgentHandlerResult(
            reply=f"Ready to jump to **{matched_label}**. Click the shortcut button below to switch views.",
            intent="WORKSPACE_NAVIGATION",
            tool_calls=[
                AgentToolCall(
                    tool_name="resolve_workspace_route",
                    label="Workspace Navigator",
                    status="COMPLETED",
                    summary=f"Matched section '{matched_label}'",
                    duration_ms=elapsed_ms,
                )
            ],
            metrics=[],
            actions=[AgentAction(label=f"Open {matched_label}", target_tab=matched_tab)],
        )

    return AgentHandlerResult(
        reply="I could not match a specific SmartStock module from that navigation request. You can navigate directly using the shortcuts below or specify which section you want.",
        intent="WORKSPACE_NAVIGATION_MISS",
        tool_calls=[
            AgentToolCall(
                tool_name="resolve_workspace_route",
                label="Workspace Navigator",
                status="COMPLETED",
                summary="No direct section keyword matched",
                duration_ms=elapsed_ms,
            )
        ],
        metrics=[],
        actions=[
            AgentAction(label="Overview Dashboard", target_tab="overview"),
            AgentAction(label="Point of Sale (POS)", target_tab="pos"),
            AgentAction(label="Reorder Recommendations", target_tab="reorder"),
        ],
    )


def get_agent_capabilities(ctx: TenantContext) -> AgentCapabilitiesOut:
    return AgentCapabilitiesOut(
        agent_name="SmartStock AI Agent",
        workspace_name=ctx.business.name,
        role=ctx.membership.role.value,
        runtime_status="READY",
        functions=list_agent_functions(),
    )


def handle_agent_message(
    db: Session,
    ctx: TenantContext,
    message: str,
    history: Optional[List[AgentChatTurn]] = None,
    language: str = "en",
) -> AgentChatResponse:
    started = time.perf_counter()
    turns = history or []
    clean_msg = message.strip()
    lower = clean_msg.lower()
    specs = list_agent_functions()

    # 1. Greetings / conversational check-in
    if lower in {"hi", "hello", "hey", "namaste", "namaskara", "ನಮಸ್ಕಾರ", "hii", "yo"} or lower.startswith(
        ("hello ", "hi ", "hey ")
    ):
        reply = (
            f"Hello! I am your **SmartStock AI Agent** connected to **{ctx.business.name}** ({ctx.membership.role.value}).\n\n"
            f"Right now my conversational runtime and extensible tool registry ({len(specs)} core utilities) are active. "
            f"Whenever you assign new store functions, workflows, or automations, they will run directly inside this thread with live trace badges."
        )
        res = AgentHandlerResult(
            reply=reply,
            intent="GREETING",
            tool_calls=[],
            metrics=[],
            actions=[
                AgentAction(label="Check Workspace Status", prompt="Check workspace status"),
                AgentAction(label="List Registered Functions", prompt="List registered functions"),
            ],
        )

    # 2. Capability inspection
    elif any(k in lower for k in ["function", "capabilities", "capability", "what can you do", "help", "tools", "skills"]):
        res = AGENT_FUNCTION_REGISTRY["list_registered_functions"].handler(
            db, ctx, clean_msg, turns, language
        )

    # 3. Live workspace status / heartbeat check
    elif any(k in lower for k in ["status", "heartbeat", "ping", "health", "connected", "workspace"]):
        res = AGENT_FUNCTION_REGISTRY["get_workspace_heartbeat"].handler(
            db, ctx, clean_msg, turns, language
        )

    # 4. Explicit navigation requests
    elif any(lower.startswith(p) for p in ["open ", "go to ", "show page ", "navigate ", "switch to "]):
        res = AGENT_FUNCTION_REGISTRY["resolve_workspace_route"].handler(
            db, ctx, clean_msg, turns, language
        )

    # 5. Delegate domain reasoning cleanly to SmartStock AI Ultra Orchestrator
    else:
        from app.smartstock_ai.orchestrator import run_ai_ultra_turn

        ultra = run_ai_ultra_turn(
            db=db,
            ctx=ctx,
            message=clean_msg,
            mode="QUICK_ASSIST",
            language=language or "auto",
        )
        asst = ultra.assistant_message
        payload = asst.payload
        res = AgentHandlerResult(
            reply=asst.content,
            intent=asst.intent or "AI_ULTRA",
            tool_calls=[
                AgentToolCall(
                    tool_name=t.tool_name,
                    label=t.label,
                    status="COMPLETED" if t.status == "COMPLETED" else "ERROR",
                    summary=t.summary,
                    duration_ms=t.duration_ms,
                )
                for t in payload.tool_traces
            ],
            metrics=[
                AgentMetricItem(label=k.label, value=k.value, tone=k.tone)
                for k in payload.kpis[:4]
            ],
            actions=[
                AgentAction(label=a.label, target_tab=a.target_tab, prompt=a.prompt)
                for a in payload.actions[:4]
            ],
        )

    total_ms = max(1, int((time.perf_counter() - started) * 1000))
    return AgentChatResponse(
        reply=res.reply,
        intent=res.intent,
        tool_calls=res.tool_calls,
        metrics=res.metrics,
        actions=res.actions,
        functions=specs,
        latency_ms=total_ms,
    )
