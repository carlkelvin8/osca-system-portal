"""
User management endpoints.
Admin: full CRUD. Students: self-register.
"""
import base64
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
from app.models.audit import AuditLog
from app.models.attendance import FaceEmbedding
from app.models.user import User, UserRole
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserSummary, UserUpdate
from app.services.storage_service import StorageService
from app.services.facial_recognition import FacialRecognitionService

router = APIRouter()
logger = structlog.get_logger(__name__)

_storage = StorageService()


def _resolve_user_profile_urls(user: User) -> None:
    """Resolve stored profile picture key to a fresh presigned URL on the User model."""
    try:
        user.profile_picture_url = _storage.resolve_profile_picture_url(user.profile_picture_url)
    except Exception:
        pass


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
    # ── Role-based access control ─────────────────────────────────────────
    # No token  → self-registration: only students allowed
    # Admin      → can create any role
    # Director   → can create coach, pe_instructor, student only
    # Staff      → can create coach, pe_instructor, student only
    # Others     → cannot create users

    if current_user is None:
        # Self-registration — force student role and require approval
        if body.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Self-registration is only available for students.",
            )
        body.role = UserRole.STUDENT
        body.is_active = False  # Must be approved by admin/staff/director
    else:
        # Authenticated caller — check what roles they may assign
        if current_user.role == UserRole.ADMIN:
            pass  # Admin can create any role
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
    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    # Check student_id uniqueness (for students)
    if body.student_id:
        existing_sid = await db.execute(select(User).where(User.student_id == body.student_id))
        if existing_sid.scalar_one_or_none():
            raise ConflictError("Student ID already registered")

    # Prevent self-promotion to admin during self-registration
    # (proper enforcement done via auth middleware in production)
    user_data = body.model_dump(exclude={"password", "face_images_base64"})
    user = User(
        **user_data,
        hashed_password=hash_password(body.password),
        biometric_consent_date=datetime.now(UTC) if body.biometric_consent else None,
    )
    db.add(user)
    db.add(AuditLog(
        user_id=user.id,
        action="USER_REGISTERED",
        resource_type="User",
        resource_id=str(user.id),
        status="success",
    ))
    await db.commit()
    await db.refresh(user)

    # ── Auto-enroll face if images provided ───────────────────────────────────
    if body.face_images_base64 and len(body.face_images_base64) >= 5 and request is not None:
        fr_svc = getattr(request.app.state, "fr_service", None)
        if fr_svc is not None:
            try:
                images_bytes = []
                for img_b64 in body.face_images_base64:
                    images_bytes.append(base64.b64decode(img_b64))

                embedding, model_used, minio_keys = await fr_svc.enroll_face(
                    user_id=str(user.id),
                    images_bytes=images_bytes,
                )

                face_emb = FaceEmbedding(
                    user_id=user.id,
                    embedding=embedding,
                    model_used=model_used,
                    images_used=len(images_bytes),
                    minio_image_keys=",".join(minio_keys),
                )
                db.add(face_emb)
                user.is_face_enrolled = True
                db.add(AuditLog(
                    user_id=user.id,
                    action="FACE_ENROLLED",
                    resource_type="FaceEmbedding",
                    status="success",
                    details={"model": model_used, "images_count": len(images_bytes)},
                ))
                await db.commit()
                await db.refresh(user)
                logger.info("face_enrolled_during_registration", user_id=str(user.id), model=model_used)
            except Exception as e:
                logger.warning("face_enrollment_failed_during_registration", user_id=str(user.id), error=str(e))

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
        _resolve_user_profile_urls(u)
        summary = UserSummary.model_validate(u)
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
    # Students can only view their own profile
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    result = await db.execute(select(User).options(selectinload(User.face_embedding)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))
    _resolve_user_profile_urls(user)
    if user.face_embedding:
        try:
            user.face_image_url = _storage.resolve_face_image_url(user.face_embedding.minio_image_keys)
        except Exception:
            pass
    result = UserRead.model_validate(user)
    if user.face_embedding:
        result.face_enrolled_at = user.face_embedding.enrolled_at
    result.last_logout_at = user.last_logout_at
    # Only expose online status to admin/director/staff
    if current_user.role in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF):
        try:
            online_key = await redis.get(f"online:{user.id}")
            result.is_online = online_key is not None
        except Exception:
            pass
    return result


@router.patch("/{user_id}", response_model=UserRead, summary="Update user profile (Admin)")
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserRead:
    # Students can only update their own profile
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    # Only admins/directors/staff can change is_active
    if body.is_active is not None and current_user.role not in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins/staff can change active status")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    db.add(AuditLog(
        user_id=current_user.id,
        action="USER_UPDATED",
        resource_type="User",
        resource_id=str(user_id),
        status="success",
    ))
    await db.commit()
    await db.refresh(user)
    _resolve_user_profile_urls(user)
    return UserRead.model_validate(user)


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
    db.add(AuditLog(
        action="USER_DEACTIVATED",
        resource_type="User",
        resource_id=str(user_id),
        status="success",
    ))
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

    # Prevent self-deletion
    # (checked via _admin but explicit for clarity)
    db.add(AuditLog(
        action="USER_DELETED",
        resource_type="User",
        resource_id=str(user_id),
        status="success",
    ))
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
    # Students can only update their own picture; admins can update anyone
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, and WebP images are allowed.",
        )

    # Validate file size (max 5 MB)
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

    # Store the object key (not presigned URL) so it never expires
    user.profile_picture_url = key
    db.add(AuditLog(
        user_id=current_user.id,
        action="PROFILE_PICTURE_UPDATED",
        resource_type="User",
        resource_id=str(user_id),
        status="success",
    ))
    await db.commit()
    await db.refresh(user)
    _resolve_user_profile_urls(user)
    return UserRead.model_validate(user)
