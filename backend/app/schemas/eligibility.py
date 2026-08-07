"""Athlete eligibility schemas."""
import uuid
from datetime import date, datetime
from pydantic import BaseModel
from app.models.eligibility import EligibilityStatus, EligibilityReasonType


class EligibilityCreate(BaseModel):
    student_id: uuid.UUID
    status: EligibilityStatus = EligibilityStatus.ELIGIBLE
    reason_type: EligibilityReasonType | None = None
    reason_detail: str | None = None
    start_date: date
    end_date: date | None = None
    medical_clearance: bool = False
    notes: str | None = None


class EligibilityUpdate(BaseModel):
    status: EligibilityStatus | None = None
    reason_type: EligibilityReasonType | None = None
    reason_detail: str | None = None
    end_date: date | None = None
    medical_clearance: bool | None = None
    notes: str | None = None
    is_current: bool | None = None


class EligibilityRead(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    status: EligibilityStatus
    reason_type: EligibilityReasonType | None
    reason_detail: str | None
    start_date: date
    end_date: date | None
    medical_clearance: bool
    cleared_by_id: uuid.UUID | None
    cleared_at: datetime | None
    notes: str | None
    is_current: bool
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    student_registered_id: str | None = None
    student_full_name: str | None = None

    model_config = {"from_attributes": True}
