import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey,
    Index, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ViolationType(str, enum.Enum):
    TARDINESS = "tardiness"
    ABSENCE = "absence"
    MISCONDUCT = "misconduct"
    DRESS_CODE = "dress_code"
    EQUIPMENT_MISUSE = "equipment_misuse"
    UNSPORTSMANLIKE = "unsportsmanlike"
    SUBSTANCE = "substance"
    ACADEMIC = "academic"
    OTHER = "other"


class SanctionSeverity(str, enum.Enum):
    WARNING = "warning"
    MINOR = "minor"
    MAJOR = "major"
    SEVERE = "severe"


class SanctionStatus(str, enum.Enum):
    ACTIVE = "active"
    SERVED = "served"
    APPEALED = "appealed"
    LIFTED = "lifted"


class Sanction(Base):
    __tablename__ = "sanctions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    issued_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    violation_type: Mapped[ViolationType] = mapped_column(
        Enum(ViolationType, name="violation_type_enum"), nullable=False
    )
    severity: Mapped[SanctionSeverity] = mapped_column(
        Enum(SanctionSeverity, name="sanction_severity_enum"), default=SanctionSeverity.WARNING
    )
    status: Mapped[SanctionStatus] = mapped_column(
        Enum(SanctionStatus, name="sanction_status_enum"), default=SanctionStatus.ACTIVE
    )

    description: Mapped[str] = mapped_column(Text, nullable=False)
    violation_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    penalty: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_compliant: Mapped[bool] = mapped_column(Boolean, default=False)
    compliance_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    acknowledged_by_student: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    issued_by: Mapped["User"] = relationship(foreign_keys=[issued_by_id])

    __table_args__ = (
        Index("ix_sanctions_student", "student_id", "status"),
        Index("ix_sanctions_status", "status"),
        Index("ix_sanctions_issued_by", "issued_by_id"),
    )


from app.models.user import User  # noqa: E402
