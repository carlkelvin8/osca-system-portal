import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime, Enum, ForeignKey, Index, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IncidentSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    CLOSED = "closed"


class IncidentCategory(str, enum.Enum):
    INJURY = "injury"
    EQUIPMENT_DAMAGE = "equipment_damage"
    FACILITY_DAMAGE = "facility_damage"
    BEHAVIORAL = "behavioral"
    SAFETY = "safety"
    OTHER = "other"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[IncidentCategory] = mapped_column(
        Enum(IncidentCategory, name="incident_category_enum"), nullable=False
    )
    severity: Mapped[IncidentSeverity] = mapped_column(
        Enum(IncidentSeverity, name="incident_severity_enum"), default=IncidentSeverity.MEDIUM
    )
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status_enum"), default=IncidentStatus.OPEN
    )
    incident_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)

    reported_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    involved_student_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    involved_facility_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("facilities.id"), nullable=True)

    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    reported_by: Mapped["User"] = relationship(foreign_keys=[reported_by_id])
    involved_student: Mapped["User | None"] = relationship(foreign_keys=[involved_student_id])
    resolved_by: Mapped["User | None"] = relationship(foreign_keys=[resolved_by_id])

    __table_args__ = (
        Index("ix_incidents_status", "status"),
        Index("ix_incidents_category", "category"),
        Index("ix_incidents_student", "involved_student_id"),
    )


from app.models.user import User  # noqa: E402
