from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class AgentChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: List[AgentChatTurn] = Field(default_factory=list)
    language: str = "en"


class AgentFunctionSpec(BaseModel):
    name: str
    label: str
    description: str
    category: str
    status: Literal["ACTIVE", "SLOT_READY"] = "ACTIVE"
    example_prompt: Optional[str] = None


class AgentToolCall(BaseModel):
    tool_name: str
    label: str
    status: Literal["COMPLETED", "UNBOUND", "ERROR"]
    summary: str
    duration_ms: int = 0


class AgentMetricItem(BaseModel):
    label: str
    value: str
    tone: Literal["neutral", "positive", "warning", "critical", "info"] = "neutral"


class AgentAction(BaseModel):
    label: str
    target_tab: Optional[str] = None
    prompt: Optional[str] = None


class AgentCapabilitiesOut(BaseModel):
    agent_name: str
    workspace_name: str
    role: str
    runtime_status: str
    functions: List[AgentFunctionSpec]


class AgentChatResponse(BaseModel):
    reply: str
    intent: str
    tool_calls: List[AgentToolCall] = Field(default_factory=list)
    metrics: List[AgentMetricItem] = Field(default_factory=list)
    actions: List[AgentAction] = Field(default_factory=list)
    functions: List[AgentFunctionSpec] = Field(default_factory=list)
    latency_ms: int = 0
