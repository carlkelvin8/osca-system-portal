import uuid
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timezone

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
_DASHBOARD_VISIBILITY = ("all_dashboards", "both")
_PUBLIC_VISIBILITY = ("public_website", "both")


def _jsonable(d: dict) -> dict:
    from datetime import date as _date, datetime as _datetime, time as _time

    def conv(v):
        if isinstance(v, (uuid.UUID, _date, _datetime, _time)):
            return str(v)
        return v

    return {k: conv(v) for k, v in d.items()}


async def _build_announcement_page(
    db: AsyncSession,
    query: Select,
    page: int,
    page_size: int,
    viewer: User | None,
) -> PaginatedResponse[AnnouncementRead]:
    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).scalars().all()

    ann_ids = [a.id for a in rows]

    creators: dict[uuid.UUID, str] = {}
    author_ids = {a.created_by_id for a in rows}
    if author_ids:
        creator_rows = await db.execute(
            select(User).where(User.id.in_(author_ids))
        )
        creators = {u.id: u.full_name for u in creator_rows.scalars()}

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

        if viewer is not None:
            my_rows = await db.execute(
                select(AnnouncementAcknowledgement.announcement_id).where(
                    AnnouncementAcknowledgement.announcement_id.in_(ann_ids),
                    AnnouncementAcknowledgement.user_id == viewer.id,
                )
            )
            my_acked = set(my_rows.scalars().all())

    storage = StorageService()

    items = []
    for ann in rows:
        r = AnnouncementRead.model_validate(ann)
        r.created_by_name = creators.get(ann.created_by_id, "")
        r.acknowledged_by_me = ann.id in my_acked
        r.acknowledgement_count = ack_counts.get(ann.id, 0)
        r.comment_count = comment_counts.get(ann.id, 0)
        r.image_url = storage.resolve_venue_image_url(ann.image_url) if ann.image_url else None
        if ann.image_urls:
            r.image_urls = [u for u in (storage.resolve_venue_image_url(u) for u in ann.image_urls) if u]
        items.append(r)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


@router.get(
    "",
    response_model=PaginatedResponse[AnnouncementRead],
    summary="List announcements visible on dashboards",
)
async def list_announcements(
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    include_inactive: bool = Query(False),
    publish_to: Literal["all_dashboards", "public_website"] = Query("all_dashboards"),
) -> PaginatedResponse[AnnouncementRead]:
    query = select(Announcement)
    query = query.where(Announcement.visibility.in_(_DASHBOARD_VISIBILITY if publish_to == "all_dashboards" else _PUBLIC_VISIBILITY))
    query = query.where(Announcement.deleted_at.is_(None))
    if not include_inactive:
        query = query.where(Announcement.is_active == True)
    query = query.order_by(
        Announcement.pinned.desc(),
        Announcement.event_date.asc().nullslast(),
        Announcement.created_at.desc(),
    )
    return await _build_announcement_page(db, query, page, page_size, _user)


@router.get(
    "/public",
    response_model=PaginatedResponse[AnnouncementRead],
    summary="Public announcements (no authentication)",
)
async def list_public_announcements(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> PaginatedResponse[AnnouncementRead]:
    query = (
        select(Announcement)
        .where(Announcement.is_active == True)
        .where(Announcement.deleted_at.is_(None))
        .where(Announcement.visibility.in_(_PUBLIC_VISIBILITY))
    )
    query = query.order_by(
        Announcement.pinned.desc(),
        Announcement.event_date.asc().nullslast(),
        Announcement.created_at.desc(),
    )
    return await _build_announcement_page(db, query, page, page_size, None)


@router.get(
    "/manage",
    response_model=PaginatedResponse[AnnouncementRead],
    summary="Manage announcements (Admin / Director / Staff)",
)
async def manage_announcements(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = Query(None, max_length=200),
    publish_to: Literal["all_dashboards", "public_website", "both"] | None = Query(None),
    status: Literal["active", "inactive", "deleted"] | None = Query(None),
    sort: Literal["newest", "oldest"] = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse[AnnouncementRead]:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin, director, and staff may manage announcements.")

    query = select(Announcement)
    if search:
        like = f"%{search}%"
        query = query.where(or_(Announcement.title.ilike(like), Announcement.content.ilike(like)))
    if publish_to:
        query = query.where(Announcement.visibility == publish_to)

    if status == "deleted":
        query = query.where(Announcement.deleted_at.isnot(None))
    elif status == "active":
        query = query.where(Announcement.is_active == True).where(Announcement.deleted_at.is_(None))
    elif status == "inactive":
        query = query.where(Announcement.is_active == False).where(Announcement.deleted_at.is_(None))
    else:
        query = query.where(Announcement.deleted_at.is_(None))
    if sort == "oldest":
        query = query.order_by(Announcement.created_at.asc())
    else:
        query = query.order_by(Announcement.created_at.desc())
    return await _build_announcement_page(db, query, page, page_size, current_user)


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
        raise ForbiddenError("Only admin, director, and staff may create announcements.")

    ann = Announcement(
        title=body.title,
        content=body.content,
        event_date=body.event_date,
        tag=body.tag,
        pinned=body.pinned,
        visibility=body.visibility,
        link_url=body.link_url,
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
        new_values=_jsonable({
            "title": body.title,
            "event_date": body.event_date,
            "tag": body.tag,
            "pinned": body.pinned,
            "visibility": body.visibility,
            "link_url": body.link_url,
        }),
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
    logger.info(
        "announcement_update_start",
        announcement_id=str(announcement_id),
        user_id=str(current_user.id),
        payload=_jsonable(body.model_dump(exclude_unset=True)),
    )

    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin, director, and staff may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ann, field, value)

    await audit_log(
        db=db,
        action="ANNOUNCEMENT_UPDATED",
        module="Announcements",
        description=f"Updated announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        new_values=_jsonable(update_data),
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(ann)
    logger.info("announcement_update_success", announcement_id=str(announcement_id))
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
    logger.info(
        "announcement_delete_start",
        announcement_id=str(announcement_id),
        user_id=str(current_user.id),
    )

    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin, director, and staff may delete announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    now = datetime.now(timezone.utc)
    previous_is_active = ann.is_active
    ann.is_active = False
    ann.deleted_at = now
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_DELETED",
        module="Announcements",
        description=f"Soft-deleted announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        previous_values={"is_active": previous_is_active},
        new_values={"is_active": False, "deleted_at": str(now)},
        current_user=current_user,
    )
    await db.commit()
    logger.info("announcement_deleted", announcement_id=str(announcement_id), admin_id=str(current_user.id))


@router.post(
    "/{announcement_id}/restore",
    response_model=AnnouncementRead,
    summary="Restore a soft-deleted announcement (Admin / Director / Staff)",
)
async def restore_announcement(
    announcement_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnnouncementRead:
    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin, director, and staff may restore announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    if ann.deleted_at is None:
        raise ForbiddenError("This announcement is not deleted.")

    ann.deleted_at = None
    ann.is_active = True
    await audit_log(
        db=db,
        action="ANNOUNCEMENT_RESTORED",
        module="Announcements",
        description=f"Restored announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        new_values={"is_active": True, "deleted_at": None},
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(ann)
    logger.info("announcement_restored", announcement_id=str(announcement_id), admin_id=str(current_user.id))

    r = AnnouncementRead.model_validate(ann)
    r.created_by_name = current_user.full_name
    return r


@router.delete(
    "/{announcement_id}/permanent",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete an announcement (Admin / Director / Staff)",
)
async def permanent_delete_announcement(
    announcement_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    logger.info(
        "announcement_permanent_delete_start",
        announcement_id=str(announcement_id),
        user_id=str(current_user.id),
    )

    if current_user.role not in _EDITOR_ROLES:
        raise ForbiddenError("Only admin, director, and staff may permanently delete announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    await audit_log(
        db=db,
        action="ANNOUNCEMENT_PERMANENTLY_DELETED",
        module="Announcements",
        description=f"Permanently deleted announcement '{ann.title}'",
        resource_type="Announcement",
        resource_id=str(announcement_id),
        previous_values={"title": ann.title, "is_active": ann.is_active},
        current_user=current_user,
    )
    await db.delete(ann)
    await db.commit()
    logger.info("announcement_permanent_delete_done", announcement_id=str(announcement_id), admin_id=str(current_user.id))


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
        raise ForbiddenError("Only admin, director, and staff may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise ForbiddenError("Only JPEG, PNG, and WebP images are allowed.")

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

    image_url = key

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
        raise ForbiddenError("Only admin, director, and staff may update announcements.")

    ann = await db.get(Announcement, announcement_id)
    if not ann:
        raise NotFoundError("Announcement", str(announcement_id))

    urls = list(ann.image_urls or [])
    if index < 0 or index >= len(urls):
        raise NotFoundError("Announcement image", str(index))

    removed_url = urls.pop(index)
    ann.image_urls = urls or None
    ann.image_url = urls[0] if urls else None

    try:
        storage = StorageService()
        if removed_url.startswith("http"):
            from urllib.parse import urlparse
            parsed = urlparse(removed_url)
            path = parsed.path.lstrip("/")
            bucket_prefix = "osca-reports/"
            if path.startswith(bucket_prefix):
                await storage.delete_object("osca-reports", path[len(bucket_prefix):])
        else:
            await storage.delete_object("osca-reports", removed_url)
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
    user_map: dict[uuid.UUID, User] = {}
    if user_ids:
        name_rows = await db.execute(
            select(User).where(User.id.in_(user_ids))
        )
        user_map = {u.id: u for u in name_rows.scalars()}

    storage = StorageService()

    items = [
        CommentRead(
            id=c.id,
            announcement_id=c.announcement_id,
            user_id=c.user_id,
            author_name=user_map.get(c.user_id, User(full_name="")).full_name,
            author_picture_url=storage.resolve_profile_picture_url(
                user_map.get(c.user_id, User()).profile_picture_url
            ) if c.user_id in user_map else None,
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

    storage = StorageService()
    return CommentRead(
        id=comment.id,
        announcement_id=comment.announcement_id,
        user_id=comment.user_id,
        author_name=current_user.full_name,
        author_picture_url=storage.resolve_profile_picture_url(current_user.profile_picture_url),
        content=comment.content,
        created_at=comment.created_at,
    )
