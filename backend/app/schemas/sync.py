from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime

class OfflineQueueItem(BaseModel):
    client_uuid: str
    action_type: str  # CREATE_INVOICE, RECORD_EXPENSE, STOCK_CHECK
    payload: dict
    created_at_client: datetime

class SyncPushRequest(BaseModel):
    items: List[OfflineQueueItem]

class SyncItemResult(BaseModel):
    client_uuid: str
    status: str  # PROCESSED, CONFLICT, DUPLICATE_SKIPPED, FAILED
    server_id: Optional[str] = None
    message: str

class SyncPushResponse(BaseModel):
    processed_count: int
    skipped_count: int
    failed_count: int
    results: List[SyncItemResult]

class SyncStatusResponse(BaseModel):
    server_time: datetime
    active_business_id: int
    business_name: str
    pending_conflicts_count: int
    connection_status: str = "ONLINE"
