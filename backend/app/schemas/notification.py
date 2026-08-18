from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    type: str
    read: bool
    createdAt: str
    reference_type: str | None = None
    reference_id: str | None = None


class NotificationListRead(BaseModel):
    items: list[NotificationItem]
    unread_count: int
