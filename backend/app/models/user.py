import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    COACH = "coach"
    PE_INSTRUCTOR = "pe_instructor"
    STUDENT = "student"
    DIRECTOR = "director"
    STAFF = "staff"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    student_id: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    profile_picture_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    course: Mapped[str | None] = mapped_column(String(100), nullable=True)
    year_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    suffix: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    employee_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)

    sport_or_art: Mapped[str | None] = mapped_column(String(100), nullable=True)
    medical_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    emergency_contact_number: Mapped[str | None] = mapped_column(String(20), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role_enum"), nullable=False, default=UserRole.STUDENT
    )
    assigned_sport: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
        comment="Coach: limits attendance management to this sport"
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_face_enrolled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    biometric_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    biometric_consent_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_logout_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    face_embedding: Mapped["FaceEmbedding | None"] = relationship(  # noqa: F821
        "FaceEmbedding", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    attendance_records: Mapped[list["AttendanceRecord"]] = relationship(  # noqa: F821
        "AttendanceRecord", back_populates="student", foreign_keys="AttendanceRecord.student_id",
        cascade="all, delete-orphan"
    )
    borrowing_id: Mapped["BorrowingID | None"] = relationship(  # noqa: F821
        "BorrowingID", back_populates="instructor", uselist=False, cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(  # noqa: F821
        "AuditLog", back_populates="user", foreign_keys="AuditLog.user_id"
    )

    __table_args__ = (
        Index("ix_users_role", "role"),
        Index("ix_users_active_role", "is_active", "role"),
    )

    @property
    def full_name(self) -> str:
        parts = [self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        return " ".join(parts)

    def __repr__(self) -> str:
        return f"<User {self.email} [{self.role}]>"
