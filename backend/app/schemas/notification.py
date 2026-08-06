"""Notification schemas."""
from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    type: str
    read: bool
    createdAt: str


class NotificationListRead(BaseModel):
    items: list[NotificationItem]
    unread_count: int
