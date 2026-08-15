import uuid
from datetime import date, datetime
from pydantic import BaseModel
from app.models.sanction import ViolationType, SanctionSeverity, SanctionStatus


class SanctionCreate(BaseModel):
    student_id: uuid.UUID
    violation_type: ViolationType
    severity: SanctionSeverity = SanctionSeverity.WARNING
    description: str
    violation_date: date
    start_date: date
    end_date: date | None = None
    penalty: str | None = None


class SanctionUpdate(BaseModel):
    status: SanctionStatus | None = None
    severity: SanctionSeverity | None = None
    end_date: date | None = None
    penalty: str | None = None
    is_compliant: bool | None = None
    compliance_notes: str | None = None


class SanctionRead(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    issued_by_id: uuid.UUID
    violation_type: ViolationType
    severity: SanctionSeverity
    status: SanctionStatus
    description: str
    violation_date: date
    start_date: date
    end_date: date | None
    penalty: str | None
    is_compliant: bool
    compliance_notes: str | None
    acknowledged_by_student: bool
    acknowledged_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
