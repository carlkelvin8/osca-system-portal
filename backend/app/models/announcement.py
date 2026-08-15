import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_urls: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True,
        comment="All attached image URLs (ordered). image_url mirrors the first entry for backward compat.")
    event_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Set when this is an upcoming event; None for general notices"
    )
    tag: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="Optional tag: urgent, event, or notice"
    )
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])  # noqa: F821
    acknowledgements: Mapped[list["AnnouncementAcknowledgement"]] = relationship(  # noqa: F821
        back_populates="announcement",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    comments: Mapped[list["AnnouncementComment"]] = relationship(  # noqa: F821
        back_populates="announcement",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_announcements_event_date", "event_date"),
        Index("ix_announcements_is_active", "is_active"),
    )


class AnnouncementAcknowledgement(Base):
    __tablename__ = "announcement_acknowledgements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    announcement: Mapped["Announcement"] = relationship(back_populates="acknowledgements")  # noqa: F821
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[user_id], lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("announcement_id", "user_id", name="uq_announcement_ack_user"),
        Index("ix_announcement_acks_announcement", "announcement_id"),
    )


class AnnouncementComment(Base):
    __tablename__ = "announcement_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    announcement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    announcement: Mapped["Announcement"] = relationship(back_populates="comments")  # noqa: F821
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[user_id], lazy="selectin"
    )

    __table_args__ = (
        Index("ix_announcement_comments_announcement", "announcement_id", "created_at"),
    )
