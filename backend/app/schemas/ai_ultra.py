from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


AIModeType = Literal["QUICK_ASSIST", "DEEP_ANALYSIS", "AGENT"]
AILanguageType = Literal["auto", "en", "kn", "hi"]


class AIKpiMetric(BaseModel):
    label: str
    value: str
    delta: Optional[str] = None
    tone: Literal["neutral", "positive", "warning", "critical", "info"] = "neutral"
    data_type: Literal["ACTUAL", "FORECAST", "HYPOTHETICAL_SIMULATION"] = "ACTUAL"


class AIChartPoint(BaseModel):
    label: str
    value: float
    secondary_value: Optional[float] = None
    color: Optional[str] = None


class AIChartSpec(BaseModel):
    chart_id: str
    title: str
    subtitle: Optional[str] = None
    chart_type: Literal["bar", "line", "donut"]
    unit_prefix: str = ""
    unit_suffix: str = ""
    data_type: Literal["ACTUAL", "FORECAST", "HYPOTHETICAL_SIMULATION"] = "ACTUAL"
    series_label: str = "Value"
    secondary_label: Optional[str] = None
    points: List[AIChartPoint] = Field(default_factory=list)


class AITableSpec(BaseModel):
    table_id: str
    title: str
    columns: List[str]
    rows: List[List[str]]
    highlight_col: Optional[int] = None


class AIEvidenceItem(BaseModel):
    source: str
    label: str
    value: str
    record_count: Optional[int] = None
    data_type: Literal["ACTUAL", "FORECAST", "HYPOTHETICAL_SIMULATION"] = "ACTUAL"


class AISpecialistTrace(BaseModel):
    agent_name: str
    agent_role: str
    status: str
    summary: str
    confidence: float = 0.95
    duration_ms: int = 0


class AIToolTrace(BaseModel):
    tool_name: str
    agent_name: Optional[str] = None
    label: str
    status: Literal["COMPLETED", "DENIED", "ERROR"] = "COMPLETED"
    is_mutating: bool = False
    summary: str
    duration_ms: int = 0


class AIActionShortcut(BaseModel):
    label: str
    target_tab: Optional[str] = None
    prompt: Optional[str] = None
    mode: Optional[AIModeType] = None


class AIApprovalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    conversation_id: Optional[int] = None
    task_id: Optional[int] = None
    action_type: str
    title: str
    summary: str
    preview: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str
    status: str
    decision_note: Optional[str] = None
    execution_result: Optional[Dict[str, Any]] = None
    created_at: datetime
    decided_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None


class AIConversationCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    mode: AIModeType = "QUICK_ASSIST"
    language: AILanguageType = "en"


class AIConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    user_id: int
    title: str
    mode: str
    language: str
    context_summary: Optional[str] = None
    last_message_at: datetime
    created_at: datetime
    message_count: int = 0


class AIMessagePayload(BaseModel):
    kpis: List[AIKpiMetric] = Field(default_factory=list)
    charts: List[AIChartSpec] = Field(default_factory=list)
    tables: List[AITableSpec] = Field(default_factory=list)
    evidence: List[AIEvidenceItem] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    agents_involved: List[AISpecialistTrace] = Field(default_factory=list)
    tool_traces: List[AIToolTrace] = Field(default_factory=list)
    actions: List[AIActionShortcut] = Field(default_factory=list)
    approval_ids: List[int] = Field(default_factory=list)
    approvals: List[AIApprovalOut] = Field(default_factory=list)
    follow_ups: List[str] = Field(default_factory=list)
    data_quality: Optional[str] = None
    llm_provider: str = "smartstock-deterministic-brain"


class AIMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    role: str
    content: str
    mode: str
    language: str
    intent: Optional[str] = None
    confidence: float = 1.0
    payload: AIMessagePayload = Field(default_factory=AIMessagePayload)
    tokens_used: int = 0
    latency_ms: int = 0
    created_at: datetime


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=6000)
    conversation_id: Optional[int] = None
    mode: AIModeType = "QUICK_ASSIST"
    language: AILanguageType = "auto"
    document_id: Optional[int] = None
    voice_input: bool = False


class AIChatResponse(BaseModel):
    conversation_id: int
    user_message: AIMessageOut
    assistant_message: AIMessageOut
    detected_language: str
    task_id: Optional[int] = None
    status: str = "COMPLETED"


class AIApprovalDecisionRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)
    edited_payload: Optional[Dict[str, Any]] = None


class AIMemoryCreate(BaseModel):
    memory_key: str = Field(..., min_length=2, max_length=120)
    memory_value: str = Field(..., min_length=1, max_length=1000)
    category: Literal["PREFERENCE", "SUPPLIER", "INVENTORY_RULE", "REPORTING", "GENERAL"] = "PREFERENCE"


class AIMemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    memory_key: str
    memory_value: str
    category: str
    is_active: bool
    source: str
    created_at: datetime
    updated_at: datetime


class AIWorkflowCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    natural_language_rule: str = Field(..., min_length=5, max_length=2000)
    trigger_type: Literal["SCHEDULED", "EVENT", "MANUAL"] = "SCHEDULED"
    schedule_cron: Optional[str] = Field(default="0 9 * * *", max_length=80)
    requires_approval: bool = True


class AIWorkflowToggle(BaseModel):
    is_active: Optional[bool] = None
    requires_approval: Optional[bool] = None


class AIWorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    name: str
    natural_language_rule: str
    trigger_type: str
    schedule_cron: Optional[str] = None
    condition: Dict[str, Any] = Field(default_factory=dict)
    action: Dict[str, Any] = Field(default_factory=dict)
    requires_approval: bool
    is_active: bool
    last_run_at: Optional[datetime] = None
    last_run_summary: Optional[str] = None
    run_count: int = 0
    created_at: datetime


class AIAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    alert_key: str
    category: str
    severity: str
    title: str
    what_happened: str
    why_it_matters: str
    supporting_data: Dict[str, Any] = Field(default_factory=dict)
    recommended_action: str
    recommended_tab: Optional[str] = None
    status: str
    detected_at: datetime
    resolved_at: Optional[datetime] = None


class AIAlertStatusUpdate(BaseModel):
    status: Literal["ACTIVE", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]


class AIDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    conversation_id: Optional[int] = None
    filename: str
    content_type: str
    document_type: str
    file_size_bytes: int
    extraction_status: str
    raw_excerpt: Optional[str] = None
    extracted: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AIRuntimeOut(BaseModel):
    assistant_name: str
    version: str
    workspace_name: str
    role: str
    active_provider: str
    external_llm_enabled: bool
    external_providers: Dict[str, bool]
    supported_modes: List[str]
    supported_languages: List[str]
    specialists: List[Dict[str, str]]
    allowed_tools: List[str]
    restricted_tools: List[str]
    pending_approvals_count: int
    active_alerts_count: int


class AIBriefingOut(BaseModel):
    generated_at: datetime
    workspace_name: str
    headline: str
    summary_markdown: str
    kpis: List[AIKpiMetric] = Field(default_factory=list)
    top_risks: List[AIAlertOut] = Field(default_factory=list)
    opportunities: List[str] = Field(default_factory=list)
    recommended_actions: List[AIActionShortcut] = Field(default_factory=list)


class AIObservabilityOut(BaseModel):
    total_tasks: int
    total_messages: int
    avg_latency_ms: float
    total_tokens_used: int
    approvals_pending: int
    approvals_executed: int
    approvals_rejected: int
    active_alerts: int
    benchmark_pass_rate: Optional[float] = None
    recent_tasks: List[Dict[str, Any]] = Field(default_factory=list)
