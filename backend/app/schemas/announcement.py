import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import OSCABaseModel

AnnouncementVisibility = Literal["all_dashboards", "public_website", "both"]


class AnnouncementCreate(OSCABaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    event_date: datetime | None = None
    image_url: str | None = None
    tag: str | None = Field(default=None, max_length=20)
    pinned: bool = False
    visibility: AnnouncementVisibility = "all_dashboards"
    link_url: str | None = Field(default=None, max_length=500)


class AnnouncementUpdate(OSCABaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    event_date: datetime | None = None
    image_url: str | None = None
    tag: str | None = Field(default=None, max_length=20)
    pinned: bool | None = None
    visibility: AnnouncementVisibility | None = None
    link_url: str | None = Field(default=None, max_length=500)


class AnnouncementRead(OSCABaseModel):
    id: uuid.UUID
    title: str
    content: str
    image_url: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    event_date: datetime | None
    tag: str | None = None
    pinned: bool = False
    visibility: str = "all_dashboards"
    link_url: str | None = None
    is_active: bool
    deleted_at: datetime | None = None
    created_by_id: uuid.UUID
    created_by_name: str = ""
    created_at: datetime
    updated_at: datetime
    acknowledged_by_me: bool = False
    acknowledgement_count: int = 0
    comment_count: int = 0

    @field_validator("image_urls", mode="before")
    @classmethod
    def _images_none_to_empty(cls, v: object) -> object:
        if v is None:
            return []
        return v

    @model_validator(mode="after")
    def _normalize_image_urls(self) -> "AnnouncementRead":
        if not self.image_urls and self.image_url:
            self.image_urls = [self.image_url]
        return self


class AcknowledgementRead(OSCABaseModel):
    announcement_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime


class CommentCreate(OSCABaseModel):
    content: str = Field(min_length=1, max_length=1000)


class CommentRead(OSCABaseModel):
    id: uuid.UUID
    announcement_id: uuid.UUID
    user_id: uuid.UUID
    author_name: str = ""
    content: str
    created_at: datetime
