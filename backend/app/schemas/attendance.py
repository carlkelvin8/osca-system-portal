import uuid
from datetime import datetime

from pydantic import Base64Bytes, Field, field_validator

from app.models.attendance import ActivityType, AttendanceScanType, ScanResult
from app.schemas.common import OSCABaseModel


class SessionCreate(OSCABaseModel):
    name: str = Field(min_length=1, max_length=200)
    activity_type: ActivityType
    sport_or_art: str | None = Field(default=None, max_length=100)
    venue: str | None = Field(default=None, max_length=200)
    scheduled_start: datetime
    scheduled_end: datetime
    grace_period_minutes: int = Field(default=0, ge=0, description="Minutes after start_time during which scan = PRESENT (beyond = LATE)")
    notes: str | None = None

    @field_validator("scheduled_end")
    @classmethod
    def end_after_start(cls, v: datetime, info) -> datetime:
        if "scheduled_start" in info.data and v <= info.data["scheduled_start"]:
            raise ValueError("scheduled_end must be after scheduled_start")
        return v


class SessionUpdate(OSCABaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    activity_type: ActivityType | None = None
    sport_or_art: str | None = Field(default=None, max_length=100)
    venue: str | None = Field(default=None, max_length=200)
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    grace_period_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None


class SessionRead(OSCABaseModel):
    id: uuid.UUID
    name: str
    activity_type: ActivityType
    sport_or_art: str | None
    venue: str | None
    scheduled_start: datetime
    scheduled_end: datetime
    grace_period_minutes: int = 0
    notes: str | None
    is_active: bool
    created_at: datetime
    attendance_count: int = 0


class SessionStatsRead(OSCABaseModel):
    session_id: uuid.UUID
    present: int = 0
    late: int = 0
    absent: int = 0
    total: int = 0


class AttendanceRecordRead(OSCABaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    session_id: uuid.UUID
    session_name: str = ""
    session_sport_or_art: str | None = None
    student_name: str = ""
    student_number: str | None = None
    time_in: datetime | None
    time_in_confidence: float | None
    time_out: datetime | None
    time_out_confidence: float | None
    duration_minutes: int | None
    is_complete: bool
    status: str | None = None
    notes: str | None
    ip_address: str | None = None
    device: str | None = None


class ManualAttendanceCreate(OSCABaseModel):
    session_id: uuid.UUID
    student_id: uuid.UUID
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: str | None = Field(
        default=None, pattern="^(present|late|absent|excused)$",
        description="present, late, absent, excused",
    )
    notes: str | None = None

    @field_validator("time_out")
    @classmethod
    def time_out_after_time_in(cls, v: datetime | None, info) -> datetime | None:
        if v is not None and info.data.get("time_in") is not None and v <= info.data["time_in"]:
            raise ValueError("time_out must be after time_in")
        return v


class ManualAttendanceUpdate(OSCABaseModel):
    time_in: datetime | None = None
    time_out: datetime | None = None
    status: str | None = Field(
        default=None, pattern="^(present|late|absent|excused)$",
        description="present, late, absent, excused",
    )
    notes: str | None = None


class QrCheckInRequest(OSCABaseModel):
    qr_code: str = Field(min_length=4, max_length=64)
    session_id: uuid.UUID


class FaceScanRequest(OSCABaseModel):
    image_base64: str = Field(
        description="Base64-encoded webcam frame (JPEG/PNG, max 5MB)"
    )
    scan_type: AttendanceScanType
    session_id: uuid.UUID
    kiosk_ip: str | None = None


class FaceScanResponse(OSCABaseModel):
    result: ScanResult
    matched_user_id: uuid.UUID | None = None
    matched_user_name: str | None = None
    matched_user_role: str | None = None
    confidence_score: float | None = None
    liveness_score: float | None = None
    attendance_record_id: uuid.UUID | None = None
    processing_time_ms: int
    message: str


class EnrollmentRequest(OSCABaseModel):
    user_id: uuid.UUID
    images_base64: list[str] = Field(
        min_length=5,
        max_length=10,
        description="5–10 face images at varied angles",
    )


class EnrollmentResponse(OSCABaseModel):
    success: bool
    user_id: uuid.UUID
    embedding_id: uuid.UUID | None = None
    images_processed: int
    message: str


class LatestAttendanceRead(OSCABaseModel):
    has_record: bool = False
    person_name: str | None = None
    person_role: str | None = None
    time: datetime | None = None
    time_out: datetime | None = None
    duration_minutes: int | None = None
    status: str | None = None
    session_name: str | None = None
    session_sport_or_art: str | None = None
    confidence_score: float | None = None


class AttendanceReportFilter(OSCABaseModel):
    sport_or_art: str | None = None
    session_id: uuid.UUID | None = None
    student_id: uuid.UUID | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    activity_type: ActivityType | None = None
