"""
Attendance models: Sessions, AttendanceRecords, FaceEmbeddings, ScanAttempts.
"""
import enum
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.config import settings
from app.database import Base


class ActivityType(str, enum.Enum):
    PRACTICE = "practice"
    COMPETITION = "competition"
    TRAINING = "training"
    EVENT = "event"
    OTHER = "other"


class AttendanceScanType(str, enum.Enum):
    TIME_IN = "time_in"
    TIME_OUT = "time_out"


class ScanResult(str, enum.Enum):
    SUCCESS = "success"
    FAILED_RECOGNITION = "failed_recognition"
    FAILED_LIVENESS = "failed_liveness"
    FAILED_THRESHOLD = "failed_threshold"
    NO_FACE_DETECTED = "no_face_detected"
    TIMEOUT = "timeout"


class Session(Base):
    """
    An OSCA training/event session.
    Attendance records are grouped under sessions.
    """
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    activity_type: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activity_type_enum"), nullable=False
    )
    sport_or_art: Mapped[str | None] = mapped_column(String(100), nullable=True)
    venue: Mapped[str | None] = mapped_column(String(200), nullable=True)
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Grace period for late arrivals (in minutes)
    grace_period_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    attendance_records: Mapped[list["AttendanceRecord"]] = relationship(
        "AttendanceRecord", back_populates="session", cascade="all, delete-orphan"
    )
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])  # noqa: F821

    __table_args__ = (
        Index("ix_sessions_sport", "sport_or_art"),
        Index("ix_sessions_start", "scheduled_start"),
    )


class AttendanceRecord(Base):
    """
    A single student's attendance entry for one session.
    Stores time-in, time-out, and facial recognition metadata.
    """
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False
    )

    # Time-in
    time_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_in_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_in_liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Time-out
    time_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_out_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_out_liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Duration in minutes (computed on time_out)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Status
    status: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="present, late, absent")
    is_complete: Mapped[bool] = mapped_column(default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    student: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="attendance_records", foreign_keys=[student_id]
    )
    session: Mapped["Session"] = relationship("Session", back_populates="attendance_records")

    __table_args__ = (
        Index("ix_attendance_student_session", "student_id", "session_id", unique=True),
        Index("ix_attendance_session", "session_id"),
        Index("ix_attendance_student_date", "student_id", "time_in"),
    )


class FaceEmbedding(Base):
    """
    Stores the 512-dim ArcFace embedding for each enrolled student.
    Uses pgvector for cosine similarity search.
    Raw images are stored in MinIO (not here — R.A. 10173 compliance).
    """
    __tablename__ = "face_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, unique=True
    )

    # 512-dim vector (ArcFace / InsightFace)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(settings.FACE_EMBEDDING_DIM), nullable=False
    )

    # Metadata
    model_used: Mapped[str] = mapped_column(String(50), nullable=False)
    images_used: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    minio_image_keys: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Comma-separated MinIO object keys for enrolled face images"
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="face_embedding")  # noqa: F821

    # IVFFlat index for cosine similarity search (created via Alembic migration)
    # CREATE INDEX ON face_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);


class ScanAttempt(Base):
    """
    Audit log for every facial recognition scan attempt.
    Stored regardless of success/failure (security audit trail).
    """
    __tablename__ = "scan_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_type: Mapped[AttendanceScanType] = mapped_column(
        Enum(AttendanceScanType, name="scan_type_enum"), nullable=False
    )
    result: Mapped[ScanResult] = mapped_column(
        Enum(ScanResult, name="scan_result_enum"), nullable=False
    )

    # Matched user (null if recognition failed)
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Kiosk info
    kiosk_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_scan_attempts_user", "matched_user_id"),
        Index("ix_scan_attempts_date", "attempted_at"),
        Index("ix_scan_attempts_result", "result"),
    )
