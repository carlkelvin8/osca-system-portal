import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.offline_sync import SyncStatus, SyncRecordType


class SyncRecordCreate(BaseModel):
    device_id: str = Field(max_length=200)
    record_type: SyncRecordType
    payload: dict
    local_timestamp: datetime


class SyncBatchUpload(BaseModel):
    records: list[SyncRecordCreate]


class SyncRecordRead(BaseModel):
    id: uuid.UUID
    device_id: str
    user_id: uuid.UUID
    record_type: SyncRecordType
    payload: dict
    local_timestamp: datetime
    status: SyncStatus
    sync_attempts: int
    error_message: str | None
    synced_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SyncBatchResult(BaseModel):
    total: int
    synced: int
    failed: int
    conflicts: int
    results: list[SyncRecordRead]
