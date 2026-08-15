import uuid
from datetime import date, datetime, time
from pydantic import BaseModel, Field
from app.models.facility import FacilityStatus, FacilityCondition
from app.models.reservation import ReservationStatus


class FacilityCreate(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    capacity: int | None = Field(default=None, ge=0)
    status: FacilityStatus = FacilityStatus.AVAILABLE
    condition: FacilityCondition = FacilityCondition.GOOD
    notes: str | None = None


class FacilityUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = None
    location: str | None = None
    capacity: int | None = Field(default=None, ge=0)
    status: FacilityStatus | None = None
    condition: FacilityCondition | None = None
    notes: str | None = None
    is_active: bool | None = None


class FacilityRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    location: str | None
    capacity: int | None
    image_url: str | None = None
    status: FacilityStatus
    condition: FacilityCondition
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReservationCreate(BaseModel):
    facility_id: uuid.UUID
    purpose: str = Field(min_length=1, max_length=300)
    reservation_date: date
    start_time: time
    end_time: time
    remarks: str | None = Field(default=None, max_length=1000)


class ReservationRead(BaseModel):
    id: uuid.UUID
    facility_id: uuid.UUID
    requester_id: uuid.UUID
    purpose: str
    reservation_date: date
    start_time: time
    end_time: time
    remarks: str | None
    status: ReservationStatus
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime
    requester_name: str | None = None
    requester_role: str | None = None
    facility_name: str | None = None

    model_config = {"from_attributes": True}


class ReservationReject(BaseModel):
    rejection_reason: str | None = Field(default=None, max_length=500)


class ScheduleCreate(BaseModel):
    facility_id: uuid.UUID
    title: str = Field(max_length=200)
    scheduled_date: date
    start_time: time
    end_time: time
    sport_or_activity: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class ScheduleRead(BaseModel):
    id: uuid.UUID
    facility_id: uuid.UUID
    title: str
    scheduled_date: date
    start_time: time
    end_time: time
    booked_by_id: uuid.UUID | None
    sport_or_activity: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
