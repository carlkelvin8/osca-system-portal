from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.user import User, UserRole

_MANAGER_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF)
_DASHBOARD_ROLES = (
    UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF,
    UserRole.COACH, UserRole.PE_INSTRUCTOR, UserRole.STUDENT,
)


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
    ids = list(set(recipient_ids))
    if not ids:
        return []

    existing: set[uuid.UUID] = set()
    if reference_type and reference_id:
        rows = await db.execute(
            select(Notification.recipient_id).where(
                Notification.recipient_id.in_(ids),
                Notification.reference_type == reference_type,
                Notification.reference_id == reference_id,
            )
        )
        existing = {r[0] for r in rows.all()}

    new_ids = [r for r in ids if r not in existing]
    if not new_ids:
        return []

    objects = [
        Notification(
            recipient_id=r,
            title=title,
            message=message,
            type=notification_type,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        for r in new_ids
    ]
    db.add_all(objects)
    await db.flush()
    return objects


async def notify_venue_managers(
    db: AsyncSession,
    *,
    title: str,
    message: str,
    notification_type: str = "info",
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
) -> list[Notification]:
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


async def notify_announcement_recipients(
    db: AsyncSession,
    *,
    announcement_id: uuid.UUID,
    title: str,
    visibility: str,
    created_by_id: uuid.UUID,
) -> list[Notification]:
    if visibility == "public_website":
        return []

    result = await db.execute(
        select(User.id).where(
            User.role.in_(_DASHBOARD_ROLES),
            User.is_active == True,  # noqa: E712
            User.id != created_by_id,
        )
    )
    ids = [row[0] for row in result.all()]
    return await notify_users(
        db,
        recipient_ids=ids,
        title="New Announcement",
        message=f"{title}",
        notification_type="info",
        reference_type="announcement",
        reference_id=announcement_id,
    )
