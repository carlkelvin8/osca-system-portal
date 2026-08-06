"""
Facility Monitoring models.
Tracks sports facilities, their schedules, and condition.
"""
import enum
import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey,
    Index, Integer, String, Text, Time, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FacilityStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    CLOSED = "closed"
    RESERVED = "reserved"


class FacilityCondition(str, enum.Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    NEEDS_REPAIR = "needs_repair"


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
        comment="Custom uploaded venue image (MinIO key). Falls back to bundled public image when null."
    )
    status: Mapped[FacilityStatus] = mapped_column(
        Enum(FacilityStatus, name="facility_status_enum"), default=FacilityStatus.AVAILABLE
    )
    condition: Mapped[FacilityCondition] = mapped_column(
        Enum(FacilityCondition, name="facility_condition_enum"), default=FacilityCondition.GOOD
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    schedules: Mapped[list["FacilitySchedule"]] = relationship(back_populates="facility", cascade="all, delete-orphan")
    venue_reservations: Mapped[list["VenueReservationRequest"]] = relationship(back_populates="facility")  # noqa: F821

    __table_args__ = (Index("ix_facilities_status", "status"),)


class FacilitySchedule(Base):
    __tablename__ = "facility_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    booked_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    sport_or_activity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    facility: Mapped["Facility"] = relationship(back_populates="schedules")

    __table_args__ = (Index("ix_facility_schedules_date", "facility_id", "scheduled_date"),)
