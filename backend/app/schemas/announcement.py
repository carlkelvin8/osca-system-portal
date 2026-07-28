"""Announcement schemas."""
import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import OSCABaseModel


class AnnouncementCreate(OSCABaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    event_date: datetime | None = None
    image_url: str | None = None
    tag: str | None = Field(default=None, max_length=20)
    pinned: bool = False


class AnnouncementUpdate(OSCABaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    event_date: datetime | None = None
    image_url: str | None = None
    tag: str | None = Field(default=None, max_length=20)
    pinned: bool | None = None


class AnnouncementRead(OSCABaseModel):
    id: uuid.UUID
    title: str
    content: str
    image_url: str | None = None
    event_date: datetime | None
    tag: str | None = None
    pinned: bool = False
    is_active: bool
    created_by_id: uuid.UUID
    created_by_name: str = ""
    created_at: datetime
    updated_at: datetime
