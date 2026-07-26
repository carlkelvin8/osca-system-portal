"""
User management endpoints.
Admin: full CRUD. Students: self-register.
"""
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOnly, CurrentUser, OptionalUser, get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.user import User, UserRole
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.user import UserCreate, UserRead, UserSummary, UserUpdate
from app.services.storage_service import StorageService

router = APIRouter()


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
) -> UserRead:
    # ── Role-based access control ─────────────────────────────────────────
    # No token  → self-registration: only students allowed
    # Admin      → can create any role
    # Director   → can create coach, pe_instructor, student only
    # Staff      → can create coach, pe_instructor, student only
    # Others     → cannot create users

    if current_user is None:
        # Self-registration — force student role regardless of what was sent
        if body.role != UserRole.STUDENT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Self-registration is only available for students.",
            )
        body.role = UserRole.STUDENT
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

    # Prevent self-promotion to admin during self-registration
    # (proper enforcement done via auth middleware in production)
    user_data = body.model_dump(exclude={"password"})
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
    return UserRead.model_validate(user)


@router.get(
    "",
    response_model=PaginatedResponse[UserSummary],
    summary="List all users (Admin/Director)",
)
async def list_users(
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: UserRole | None = Query(None),
    sport_or_art: str | None = Query(None),
    is_active: bool | None = Query(None),
    search: str | None = Query(None),
) -> PaginatedResponse[UserSummary]:
    query = select(User)
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
    users = result.scalars().all()

    return PaginatedResponse(
        items=[UserSummary.model_validate(u) for u in users],
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
) -> UserRead:
    # Students can only view their own profile
    if current_user.role == UserRole.STUDENT and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(user_id))
    return UserRead.model_validate(user)


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

    # Build presigned URL for the response
    profile_url = storage.get_presigned_url(
        bucket="osca-profile-pictures",
        key=key,
        expires_in=3600,
    )

    user.profile_picture_url = profile_url
    db.add(AuditLog(
        user_id=current_user.id,
        action="PROFILE_PICTURE_UPDATED",
        resource_type="User",
        resource_id=str(user_id),
        status="success",
    ))
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)
