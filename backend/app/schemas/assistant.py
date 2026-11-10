from pydantic import BaseModel, Field
from typing import Optional, Any, List, Dict

class AssistantQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)

class AssistantMetricCard(BaseModel):
    label: str
    value: str
    subtext: Optional[str] = None
    status: str = "neutral"  # "positive", "warning", "critical", "neutral"

class AssistantDataTable(BaseModel):
    title: str
    columns: List[str]
    rows: List[List[Any]]

class AssistantQueryResponse(BaseModel):
    query: str
    intent: str
    model_name: str = "Gemini 3.8 Retail Reasoner"
    confidence_score: float = 0.99
    latency_ms: float = 120.0
    thinking_steps: List[str] = []
    executive_summary: str
    answer_text: str
    metric_cards: List[AssistantMetricCard] = []
    data_table: Optional[AssistantDataTable] = None
    actionable_recommendations: List[str] = []
    metric_definition: str
    date_range_explained: str
    supporting_data: Optional[Any] = None
    drilldown_route: str
    data_limitation_notes: str
    source_tables: List[str] = []
