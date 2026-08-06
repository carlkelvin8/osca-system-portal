"""In-app notification endpoints.

Routes:
    GET  /notifications         — Current user's notifications + unread count
    PATCH /notifications/{id}/read    — Mark one notification as read
    PATCH /notifications/read-all     — Mark all as read
"""
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, get_db
from app.models.notification import Notification
from app.schemas.notification import NotificationItem, NotificationListRead

router = APIRouter()


def _to_item(n: Notification) -> NotificationItem:
    return NotificationItem(
        id=str(n.id),
        title=n.title,
        message=n.message,
        type=n.type,
        read=n.is_read,
        createdAt=n.created_at.isoformat() if n.created_at else datetime.now().isoformat(),
    )


@router.get("", response_model=NotificationListRead, summary="List current user's notifications")
async def list_notifications(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    unread_count = (
        await db.execute(
            select(func.count()).where(
                Notification.recipient_id == current_user.id,
                Notification.is_read == False,  # noqa: E712
            )
        )
    ).scalar() or 0

    result = await db.execute(
        select(Notification)
        .where(Notification.recipient_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    items = [_to_item(n) for n in result.scalars().all()]
    return NotificationListRead(items=items, unread_count=unread_count)


@router.patch("/{notification_id}/read", status_code=status.HTTP_200_OK, summary="Mark a notification as read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.patch("/read-all", status_code=status.HTTP_200_OK, summary="Mark all notifications as read")
async def mark_all_notifications_read(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await db.execute(
        update(Notification)
        .where(Notification.recipient_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
