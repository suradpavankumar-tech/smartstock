from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.models.anomaly import AnomalySeverityEnum, AnomalyStatusEnum

class AnomalyOut(BaseModel):
    id: int
    business_id: int
    alert_type: str
    severity: AnomalySeverityEnum
    description: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    status: AnomalyStatusEnum
    resolution_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_name: Optional[str] = None

    class Config:
        from_attributes = True

class AnomalyResolveRequest(BaseModel):
    status: AnomalyStatusEnum  # RESOLVED or DISMISSED
    resolution_notes: str = Field(..., min_length=3)
