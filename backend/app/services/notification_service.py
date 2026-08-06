"""Notification service — create in-app notifications (bell in dashboard topbar)."""
from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User, UserRole

_MANAGER_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF)


async def notify_users(
    db: AsyncSession,
    *,
    recipient_ids: Iterable[uuid.UUID],
    title: str,
    message: str,
    notification_type: str = "info",
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> list[Notification]:
    """Create notifications for the given recipient IDs."""
    rows = [
        Notification(
            recipient_id=r,
            title=title,
            message=message,
            type=notification_type,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        for r in set(recipient_ids)
    ]
    if rows:
        db.add_all(rows)
        await db.flush()
    return rows


async def notify_venue_managers(
    db: AsyncSession,
    *,
    title: str,
    message: str,
    notification_type: str = "info",
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> list[Notification]:
    """Notify all Admin, Director, and Staff users."""
    result = await db.execute(
        select(User.id).where(User.role.in_(_MANAGER_ROLES), User.is_active == True)  # noqa: E712
    )
    ids = [row[0] for row in result.all()]
    return await notify_users(
        db,
        recipient_ids=ids,
        title=title,
        message=message,
        notification_type=notification_type,
        reference_type=reference_type,
        reference_id=reference_id,
    )
