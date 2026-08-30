import uuid
from datetime import UTC, datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import AdminOnly, CurrentUser, OptionalUser, get_db, get_redis
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.inventory import BorrowingID, BorrowTransaction, EquipmentRequest
from app.models.user import User, UserRole
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserSummary, UserUpdate
from app.services.audit_service import audit_log
from app.services.barcode_service import BarcodeService
from app.services.storage_service import StorageService

router = APIRouter()
logger = structlog.get_logger(__name__)

_storage = StorageService()


def _resolved_profile_url(user: User) -> str | None:
    try:
        return _storage.resolve_profile_picture_url(user.profile_picture_url)
    except Exception:
        return None


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Self-register (students) or admin/director-create any role",
)
async def create_user(
    body: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: OptionalUser = None,
    request: Request = None,
) -> UserRead:
    if current_user is None:
        if body.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Self-registration is only available for students.",
            )
        body.role = UserRole.STUDENT
        body.is_active = False
    else:
        if current_user.role == UserRole.ADMIN:
            pass
        elif current_user.role in (UserRole.DIRECTOR, UserRole.STAFF):
            allowed = {UserRole.STUDENT, UserRole.COACH, UserRole.PE_INSTRUCTOR}
            if body.role not in allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"You can only create accounts for: Student, Coach, PE Instructor.",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create users.",
            )
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    if body.student_id:
        existing_sid = await db.execute(select(User).where(User.student_id == body.student_id))
        if existing_sid.scalar_one_or_none():
            raise ConflictError("Student ID already registered")

    user_data = body.model_dump(exclude={"password", "face_images_base64"})
    user = User(
        **user_data,
        hashed_password=hash_password(body.password),
        biometric_consent_date=datetime.now(UTC) if body.biometric_consent else None,
    )
    if not isinstance(user.role, UserRole):
        user.role = UserRole(user.role)
    db.add(user)
    await audit_log(
        db=db,
        action="USER_REGISTERED",
        module="Users",
        description=f"Registered new {user.role.value} account: {user.full_name}",
        resource_type="User",
        resource_id=str(user.id),
        new_values={"email": user.email, "role": user.role.value, "is_active": user.is_active},
        current_user=current_user,
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    if user.role in (UserRole.COACH, UserRole.PE_INSTRUCTOR):
        existing_bid = await db.execute(
            select(BorrowingID).where(BorrowingID.instructor_id == user.id)
        )
        if not existing_bid.scalar_one_or_none():
            qr_value = BarcodeService.generate_qr_value(str(user.id))
            qr_img_bytes = BarcodeService.render_qr(qr_value)
            _bid_storage = StorageService()
            qr_key = await _bid_storage.upload_qr_image(qr_value, qr_img_bytes)
            bid = BorrowingID(
                instructor_id=user.id,
                qr_code=qr_value,
                qr_image_key=qr_key,
            )
            db.add(bid)
            await db.commit()
            await db.refresh(user)

    if body.face_images_base64 and len(body.face_images_base64) >= 5:
        from app.workers.tasks import enroll_face_background

        try:
            enroll_face_background.delay(str(user.id), body.face_images_base64)
            logger.info(
                "face_enroll_queued_background",
                user_id=str(user.id),
                images=len(body.face_images_base64),
            )
        except Exception as e:
            logger.warning("face_enroll_queuing_failed", user_id=str(user.id), error=str(e))

    return UserRead.model_validate(user)


@router.get(
    "",
    response_model=PaginatedResponse[UserSummary],
    summary="List all users (Admin/Director)",
)
async def list_users(
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis=Depends(get_redis),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: UserRole | None = Query(None),
    sport_or_art: str | None = Query(None),
    is_active: bool | None = Query(None),
    search: str | None = Query(None),
) -> PaginatedResponse[UserSummary]:
    query = select(User).options(selectinload(User.face_embedding))
    if role:
        query = query.where(User.role == role)
    if sport_or_art:
        query = query.where(User.sport_or_art == sport_or_art)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if search:
        like = f"%{search}%"
        query = query.where(
            User.first_name.ilike(like) | User.last_name.ilike(like) | User.email.ilike(like)
        )

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size).order_by(User.last_name)
    result = await db.execute(query)
    users = result.scalars().unique().all()

    summaries = []
    for u in users:
        summary = UserSummary.model_validate(u)
        summary.profile_picture_url = _resolved_profile_url(u)
        if u.face_embedding:
            try:
                summary.face_image_url = _storage.resolve_face_image_url(u.face_embedding.minio_image_keys)
            except Exception:
                pass
        try:
            online_key = await redis.get(f"online:{u.id}")
            summary.is_online = online_key is not None
        except Exception:
            pass
        summaries.append(summary)

    return PaginatedResponse(
        items=summaries,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{user_id}", response_model=UserRead, summary="Get user by ID")
async def get_user(
    user_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis=Depends(get_redis),
) -> UserRead:
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    result = await db.execute(select(User).options(selectinload(User.face_embedding)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))
    if user.face_embedding:
        try:
            user.face_image_url = _storage.resolve_face_image_url(user.face_embedding.minio_image_keys)
        except Exception:
            pass
    read = UserRead.model_validate(user)
    read.profile_picture_url = _resolved_profile_url(user)
    if user.face_embedding:
        read.face_enrolled_at = user.face_embedding.enrolled_at
    read.last_logout_at = user.last_logout_at
    if current_user.role in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF):
        try:
            online_key = await redis.get(f"online:{user.id}")
            read.is_online = online_key is not None
        except Exception:
            pass
    return read


@router.patch("/{user_id}", response_model=UserRead, summary="Update user profile (Admin)")
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if body.is_active is not None and current_user.role not in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins/staff can change active status")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    await audit_log(
        db=db,
        action="USER_UPDATED",
        module="User Management",
        description=f"Updated profile of {user.full_name}",
        resource_type="User",
        resource_id=str(user_id),
        new_values=update_data,
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(user)
    read = UserRead.model_validate(user)
    read.profile_picture_url = _resolved_profile_url(user)
    return read


@router.delete("/{user_id}", response_model=MessageResponse, summary="Deactivate user (Admin)")
async def deactivate_user(
    user_id: uuid.UUID,
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))

    user.is_active = False
    await audit_log(
        db=db,
        action="USER_DEACTIVATED",
        module="User Management",
        description=f"Deactivated account of {user.full_name}",
        resource_type="User",
        resource_id=str(user_id),
        previous_values={"is_active": True},
        new_values={"is_active": False},
        current_user=_admin,
    )
    await db.commit()
    return MessageResponse(message=f"User {user.full_name} deactivated")


@router.delete("/{user_id}/permanent", response_model=MessageResponse, summary="Permanently delete user (Admin/Staff/Director)")
async def delete_user_permanently(
    user_id: uuid.UUID,
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))

    await audit_log(
        db=db,
        action="USER_DELETED",
        module="User Management",
        description=f"Permanently deleted account of {user.full_name} ({user.email})",
        resource_type="User",
        resource_id=str(user_id),
        previous_values={"email": user.email, "role": user.role.value},
        current_user=_admin,
    )
    await db.delete(user)
    await db.commit()
    return MessageResponse(message=f"User {user.full_name} has been permanently deleted")


@router.put(
    "/{user_id}/profile-picture",
    response_model=UserRead,
    summary="Upload profile picture",
)
async def upload_profile_picture(
    user_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: CurrentUser = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
) -> UserRead:
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, and WebP images are allowed.",
        )

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be 5 MB or smaller.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))

    storage = StorageService()
    key = await storage.upload_profile_picture(
        user_id=str(user_id),
        image_bytes=contents,
        content_type=file.content_type,
    )

    user.profile_picture_url = key
    await audit_log(
        db=db,
        action="PROFILE_PICTURE_UPDATED",
        module="User Management",
        description=f"Updated profile picture of {user.full_name}",
        resource_type="User",
        resource_id=str(user_id),
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(user)
    read = UserRead.model_validate(user)
    read.profile_picture_url = _resolved_profile_url(user)
    return read
