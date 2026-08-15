import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    admin_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    admin_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    admin_role: Mapped[str | None] = mapped_column(String(50), nullable=True)

    action: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True,
        comment="e.g. USER_LOGIN, FACE_SCAN_SUCCESS, EQUIPMENT_BORROWED, REPORT_GENERATED"
    )
    module: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True,
        comment="e.g. Auth, Users, Attendance, Inventory, Settings"
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    resource_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="e.g. User, Equipment, AttendanceRecord"
    )
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    previous_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True, index=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(100), nullable=True)
    os: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device_info: Mapped[str | None] = mapped_column(String(200), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    http_method: Mapped[str | None] = mapped_column(String(10), nullable=True)

    details: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Structured additional context (never store raw biometric data here)"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="success",
        comment="success | failure | warning"
    )
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User | None"] = relationship(  # noqa: F821
        "User", back_populates="audit_logs", foreign_keys=[user_id]
    )

    __table_args__ = (
        Index("ix_audit_action", "action"),
        Index("ix_audit_user", "user_id"),
        Index("ix_audit_created_at", "created_at"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_module", "module"),
        Index("ix_audit_status", "status"),
        Index("ix_audit_ip", "ip_address"),
        Index("ix_audit_created_action", "created_at", "action"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} by user={self.user_id} at={self.created_at}>"
