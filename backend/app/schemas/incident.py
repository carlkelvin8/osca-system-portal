import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.incident import IncidentCategory, IncidentSeverity, IncidentStatus


class IncidentCreate(BaseModel):
    title: str = Field(max_length=300)
    description: str
    category: IncidentCategory
    severity: IncidentSeverity = IncidentSeverity.MEDIUM
    incident_date: datetime
    location: str | None = Field(default=None, max_length=200)
    involved_student_id: uuid.UUID | None = None
    involved_facility_id: uuid.UUID | None = None


class IncidentUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = None
    category: IncidentCategory | None = None
    severity: IncidentSeverity | None = None
    status: IncidentStatus | None = None
    location: str | None = None
    resolution: str | None = None


class IncidentRead(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    category: IncidentCategory
    severity: IncidentSeverity
    status: IncidentStatus
    incident_date: datetime
    location: str | None
    reported_by_id: uuid.UUID
    involved_student_id: uuid.UUID | None
    involved_facility_id: uuid.UUID | None
    resolution: str | None
    resolved_by_id: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
