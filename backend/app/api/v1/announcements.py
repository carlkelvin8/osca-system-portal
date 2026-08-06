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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.announcement import Announcement
from app.models.user import UserRole
from app.schemas.announcement import AnnouncementCreate, AnnouncementRead, AnnouncementUpdate
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
    from sqlalchemy import func
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

    items = []
    for ann in rows:
        r = AnnouncementRead.model_validate(ann)
        creator = await db.get(type(ann).created_by.property.mapper.class_, ann.created_by_id)
        r.created_by_name = creator.full_name if creator else ""
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

    # Validate file size (max 5 MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise ForbiddenError("Image must be 5 MB or smaller.")

    storage = StorageService()
    ext = "jpg" if "jpeg" in (file.content_type or "") else "png"
    key = f"announcements/{announcement_id}/image.{ext}"
    await storage.upload_bytes(
        bucket="osca-reports",
        key=key,
        data=contents,
        content_type=file.content_type,
    )

    image_url = storage.get_presigned_url("osca-reports", key, expires_in=86400)
    ann.image_url = image_url
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
