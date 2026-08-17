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


class EligibilityStatus(str, enum.Enum):
    ELIGIBLE = "eligible"
    RESTRICTED = "restricted"
    INELIGIBLE = "ineligible"
    PENDING_CLEARANCE = "pending_clearance"


class EligibilityReasonType(str, enum.Enum):
    INJURY = "injury"
    MEDICAL = "medical"
    DISCIPLINARY = "disciplinary"
    ACADEMIC = "academic"
    OTHER = "other"


class AthleteEligibility(Base):
    __tablename__ = "athlete_eligibility"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[EligibilityStatus] = mapped_column(
        Enum(EligibilityStatus, name="eligibility_status_enum"), default=EligibilityStatus.ELIGIBLE
    )
    reason_type: Mapped[EligibilityReasonType | None] = mapped_column(
        Enum(EligibilityReasonType, name="eligibility_reason_enum"), nullable=True
    )
    reason_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    medical_clearance: Mapped[bool] = mapped_column(Boolean, default=False)
    cleared_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    student: Mapped["User"] = relationship(foreign_keys=[student_id])
    cleared_by: Mapped["User | None"] = relationship(foreign_keys=[cleared_by_id])
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])

    __table_args__ = (
        Index("ix_eligibility_student", "student_id", "is_current"),
        Index("ix_eligibility_status", "status"),
    )


from app.models.user import User  # noqa: E402
