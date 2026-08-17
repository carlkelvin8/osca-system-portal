import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime, Enum, ForeignKey, Index, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCED = "synced"
    CONFLICT = "conflict"
    FAILED = "failed"


class SyncRecordType(str, enum.Enum):
    ATTENDANCE = "attendance"
    INVENTORY_TRANSACTION = "inventory_transaction"


class OfflineSyncRecord(Base):
    __tablename__ = "offline_sync_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    record_type: Mapped[SyncRecordType] = mapped_column(
        Enum(SyncRecordType, name="sync_record_type_enum"), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    local_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, name="sync_status_enum"), default=SyncStatus.PENDING
    )
    sync_attempts: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    __table_args__ = (
        Index("ix_sync_status", "status"),
        Index("ix_sync_user_device", "user_id", "device_id"),
    )


from app.models.user import User  # noqa: E402
