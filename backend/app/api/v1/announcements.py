"""
Announcement endpoints.

Routes:
    GET    /announcements           — List active announcements (any authenticated user)
    POST   /announcements           — Create announcement (Admin / Director)
    PATCH  /announcements/{id}      — Update announcement (Admin / Director)
    DELETE /announcements/{id}      — Soft-delete announcement (Admin / Director)
    POST   /announcements/{id}/image — Upload announcement image (Admin / Director)
"""
import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.announcement import Announcement, AnnouncementAcknowledgement, AnnouncementComment
from app.models.user import User, UserRole
from app.schemas.announcement import (
    AcknowledgementRead,
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    CommentCreate,
    CommentRead,
)
from app.schemas.common import PaginatedResponse
from app.services.audit_service import audit_log
from app.services.storage_service import StorageService

router = APIRouter()
logger = structlog.get_logger(__name__)

_EDITOR_ROLES = {UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF}


@router.get(
    "",
    response_model=PaginatedResponse[AnnouncementRead],
    summary="List active announcements",
)
async def list_announcements(
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
) -> PaginatedResponse[AnnouncementRead]:
    query = select(Announcement)
    if not include_inactive:
        query = query.where(Announcement.is_active == True)
    # Pinned first, then upcoming events (NULL last), then created_at desc
    query = query.order_by(
        Announcement.pinned.desc(),
        Announcement.event_date.asc().nullslast(),
        Announcement.created_at.desc(),
    )

    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).scalars().all()

    ann_ids = [a.id for a in rows]

    # Bulk-fetch author names
    creators: dict[uuid.UUID, str] = {}
    author_ids = {a.created_by_id for a in rows}
    if author_ids:
        creator_rows = await db.execute(
            select(User).where(User.id.in_(author_ids))
        )
        creators = {u.id: u.full_name for u in creator_rows.scalars()}

    # Bulk-fetch acknowledgement + comment aggregates and the current user's acks
    ack_counts: dict[uuid.UUID, int] = {}
    comment_counts: dict[uuid.UUID, int] = {}
    my_acked: set[uuid.UUID] = set()
    if ann_ids:
        ack_rows = await db.execute(
            select(AnnouncementAcknowledgement.announcement_id, func.count())
            .where(AnnouncementAcknowledgement.announcement_id.in_(ann_ids))
            .group_by(AnnouncementAcknowledgement.announcement_id)
        )
        ack_counts = dict(ack_rows.all())

        comment_rows = await db.execute(
            select(AnnouncementComment.announcement_id, func.count())
            .where(AnnouncementComment.announcement_id.in_(ann_ids))
            .group_by(AnnouncementComment.announcement_id)
        )
        comment_counts = dict(comment_rows.all())

        my_rows = await db.execute(
            select(AnnouncementAcknowledgement.announcement_id).where(
                AnnouncementAcknowledgement.announcement_id.in_(ann_ids),
                AnnouncementAcknowledgement.user_id == _user.id,
            )
        )
        my_acked = set(my_rows.scalars().all())

    items = []
    for ann in rows:
        r = AnnouncementRead.model_validate(ann)
        r.created_by_name = creators.get(ann.created_by_id, "")
        r.acknowledged_by_me = ann.id in my_acked
        r.acknowledgement_count = ack_counts.get(ann.id, 0)
        r.comment_count = comment_counts.get(ann.id, 0)
        items.append(r)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


@router.post(
    "",
    response_model=AnnouncementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create announcement (Admin / Director)",
)
async def create_announcement(
    body: AnnouncementCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementRead:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin and director may create announcements.")

    ann = Announcement(
        title=body.title,
        content=body.content,
        event_date=body.event_date,
        tag=body.tag,
        pinned=body.pinned,
        created_by_id=current_user.id,
    )
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_CREATED",
        module="Announcements",
        description=f"Created announcement '{body.title}'",
        resource_type="Announcement",
        resource_id=str(ann.id),
        new_values={"title": body.title, "tag": body.tag, "pinned": body.pinned},
        current_user=current_user,
    )
    await db.commit()
    r = AnnouncementRead.model_validate(ann)
    r.created_by_name = current_user.full_name
    return r


@router.patch(
    "/{announcement_id}",
    response_model=AnnouncementRead,
    summary="Update announcement (Admin / Director)",
)
async def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementRead:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin and director may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ann, field, value)

    update_data = body.model_dump(exclude_unset=True)
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_UPDATED",
        module="Announcements",
        description=f"Updated announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        new_values=update_data,
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(ann)
    r = AnnouncementRead.model_validate(ann)
    creator = await db.get(type(ann).created_by.property.mapper.class_, ann.created_by_id)
    r.created_by_name = creator.full_name if creator else ""
    return r


@router.delete(
    "/{announcement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete announcement (Admin / Director)",
)
async def delete_announcement(
    announcement_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin and director may delete announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    ann.is_active = False
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_DELETED",
        module="Announcements",
        description=f"Deleted announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        previous_values={"is_active": True},
        new_values={"is_active": False},
        current_user=current_user,
    )
    await db.commit()
    logger.info("announcement_deleted", announcement_id=str(announcement_id), admin_id=str(current_user.id))


@router.post(
    "/{announcement_id}/image",
    response_model=AnnouncementRead,
    summary="Upload announcement image (Admin / Director)",
)
async def upload_announcement_image(
    announcement_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> AnnouncementRead:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin and director may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise ForbiddenError("Only JPEG, PNG, and WebP images are allowed.")

    # Validate file size (max 5 MB per file)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise ForbiddenError("Image must be 5 MB or smaller.")

    storage = StorageService()
    ext = "jpg" if "jpeg" in (file.content_type or "") else ("webp" if "webp" in (file.content_type or "") else "png")
    key = f"announcements/{announcement_id}/{uuid.uuid4().hex[:8]}.{ext}"
    await storage.upload_bytes(
        bucket="osca-reports",
        key=key,
        data=contents,
        content_type=file.content_type,
    )

    image_url = storage.get_presigned_url("osca-reports", key, expires_in=86400)

    # Append to the ordered list (no fixed limit). image_url mirrors the first entry.
    urls = list(ann.image_urls or [])
    urls.append(image_url)
    ann.image_urls = urls
    ann.image_url = urls[0] if urls else None
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_IMAGE_UPLOADED",
        module="Announcements",
        description=f"Uploaded image for announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(ann)

    r = AnnouncementRead.model_validate(ann)
    creator = await db.get(type(ann).created_by.property.mapper.class_, ann.created_by_id)
    r.created_by_name = creator.full_name if creator else ""
    return r


@router.delete(
    "/{announcement_id}/images/{index}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an announcement image (Admin / Director)",
)
async def remove_announcement_image(
    announcement_id: uuid.UUID,
    index: int,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin and director may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    urls = list(ann.image_urls or [])
    if index < 0 or index >= len(urls):
        raise NotFoundError("Announcement image", str(index))

    removed_url = urls.pop(index)
    ann.image_urls = urls or None
    ann.image_url = urls[0] if urls else None

    # Best-effort purge of the object from MinIO (ignore failures).
    try:
        storage = StorageService()
        from urllib.parse import urlparse
        parsed = urlparse(removed_url)
        path = parsed.path.lstrip("/")
        bucket_prefix = "osca-reports/"
        if path.startswith(bucket_prefix):
            await storage.delete_object("osca-reports", path[len(bucket_prefix):])
    except Exception:
        pass

    await audit_log(
        db=db,
        action="ANNOUNCEMENT_IMAGE_REMOVED",
        module="Announcements",
        description=f"Removed an image from announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        current_user=current_user,
    )
    await db.commit()
    logger.info("announcement_image_removed", announcement_id=str(announcement_id), index=index)


@router.post(
    "/{announcement_id}/acknowledge",
    response_model=AcknowledgementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Acknowledge an announcement (any authenticated user)",
)
async def acknowledge_announcement(
    announcement_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AcknowledgementRead:
    """Idempotently add the current user's acknowledgement to an announcement."""
    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    existing = await db.execute(
        select(AnnouncementAcknowledgement).where(
            AnnouncementAcknowledgement.announcement_id == announcement_id,
            AnnouncementAcknowledgement.user_id == current_user.id,
        )
    )
    ack = existing.scalar_one_or_none()
    if ack is None:
        ack = AnnouncementAcknowledgement(
            announcement_id=announcement_id,
            user_id=current_user.id,
        )
        db.add(ack)
        await audit_log(
            db=db,
            action="ANNOUNCEMENT_ACKNOWLEDGED",
            module="Announcements",
            description=f"Acknowledged announcement '{ann.title}'",
            resource_type="Announcement",
            resource_id=str(announcement_id),
            current_user=current_user,
        )
        await db.commit()
        await db.refresh(ack)

    return AcknowledgementRead(
        announcement_id=ack.announcement_id,
        user_id=ack.user_id,
        created_at=ack.created_at,
    )


@router.delete(
    "/{announcement_id}/acknowledge",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove own acknowledgement from an announcement",
)
async def unacknowledge_announcement(
    announcement_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove the current user's acknowledgement (toggle off)."""
    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    existing = await db.execute(
        select(AnnouncementAcknowledgement).where(
            AnnouncementAcknowledgement.announcement_id == announcement_id,
            AnnouncementAcknowledgement.user_id == current_user.id,
        )
    )
    ack = existing.scalar_one_or_none()
    if ack is None:
        return
    await db.delete(ack)
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_ACKNOWLEDGEMENT_REMOVED",
        module="Announcements",
        description=f"Removed acknowledgement for announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        current_user=current_user,
    )
    await db.commit()


@router.get(
    "/{announcement_id}/comments",
    response_model=PaginatedResponse[CommentRead],
    summary="List comments on an announcement",
)
async def list_comments(
    announcement_id: uuid.UUID,
    _current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> PaginatedResponse[CommentRead]:
    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    query = (
        select(AnnouncementComment)
        .where(AnnouncementComment.announcement_id == announcement_id)
        .order_by(AnnouncementComment.created_at.asc())
    )
    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).scalars().all()

    user_ids = {c.user_id for c in rows}
    names: dict[uuid.UUID, str] = {}
    if user_ids:
        name_rows = await db.execute(
            select(User).where(User.id.in_(user_ids))
        )
        names = {u.id: u.full_name for u in name_rows.scalars()}

    items = [
        CommentRead(
            id=c.id,
            announcement_id=c.announcement_id,
            user_id=c.user_id,
            author_name=names.get(c.user_id, ""),
            content=c.content,
            created_at=c.created_at,
        )
        for c in rows
    ]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


@router.post(
    "/{announcement_id}/comments",
    response_model=CommentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Comment on an announcement (any authenticated user)",
)
async def create_comment(
    announcement_id: uuid.UUID,
    body: CommentCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentRead:
    ann = await db.get(Announcement, announcement_id)
    if not ann or not ann.is_active:
        raise NotFoundError("Announcement", str(announcement_id))

    comment = AnnouncementComment(
        announcement_id=announcement_id,
        user_id=current_user.id,
        content=body.content.strip(),
    )
    if not comment.content:
        raise ForbiddenError("Comment cannot be empty.")

    db.add(comment)
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_COMMENTED",
        module="Announcements",
        description=f"Commented on announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(comment)

    return CommentRead(
        id=comment.id,
        announcement_id=comment.announcement_id,
        user_id=comment.user_id,
        author_name=current_user.full_name,
        content=comment.content,
        created_at=comment.created_at,
    )
