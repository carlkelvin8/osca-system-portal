"""
Authentication endpoints: login, refresh, logout, password change.
"""
from datetime import UTC, datetime, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import (
    CurrentUser,
    check_login_rate_limit,
    clear_login_rate_limit,
    get_db,
    get_redis,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_type,
    verify_password,
)
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.common import MessageResponse
from app.schemas.user import UserRead
from app.services.storage_service import StorageService

router = APIRouter()
logger = structlog.get_logger(__name__)
_storage = StorageService()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email and password",
)
async def login(
    request: Request,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis=Depends(get_redis),
    _rate_check=Depends(check_login_rate_limit),
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Constant-time comparison to prevent user enumeration
    if not user or not verify_password(body.password, user.hashed_password):
        # Log failed attempt
        db.add(AuditLog(
            action="USER_LOGIN_FAILED",
            ip_address=client_ip,
            details={"email": body.email},
            status="failure",
            failure_reason="Invalid credentials",
        ))
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval. Please wait for an administrator to activate it.",
        )

    # Check account lockout (stored on user model)
    if user.locked_until and user.locked_until > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked until {user.locked_until.isoformat()}",
        )

    # Success — clear rate limits and update user
    await clear_login_rate_limit(client_ip, redis)
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = datetime.now(UTC)

    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token = create_refresh_token(str(user.id))

    # Mark user online in Redis (TTL = access token lifetime, renewed on /me and refresh)
    online_ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await redis.setex(f"online:{user.id}", online_ttl, "1")

    db.add(AuditLog(
        user_id=user.id,
        action="USER_LOGIN_SUCCESS",
        ip_address=client_ip,
        status="success",
    ))
    await db.commit()

    logger.info("user_login", user_id=str(user.id), role=user.role)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis=Depends(get_redis),
) -> TokenResponse:
    try:
        payload = decode_token(body.refresh_token)
        if not is_token_type(payload, "refresh"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    # Security: Check if this refresh token has already been used (rotation blacklist).
    # A reused refresh token indicates potential theft; reject immediately.
    already_used = await redis.get(f"blacklist:{body.refresh_token}")
    if already_used:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been used. Please log in again.",
        )

    # Blacklist old refresh token (rotation — one-time use)
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    await redis.setex(f"blacklist:{body.refresh_token}", ttl, "1")

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Renew online key (heartbeat on refresh)
    online_ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await redis.setex(f"online:{user.id}", online_ttl, "1")

    return TokenResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", response_model=MessageResponse, summary="Logout — blacklist access token")
async def logout(
    request: Request,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    redis=Depends(get_redis),
) -> MessageResponse:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    # Blacklist the access token until its natural expiry
    ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await redis.setex(f"blacklist:{token}", ttl, "1")

    # Remove online key and record logout timestamp
    await redis.delete(f"online:{current_user.id}")
    current_user.last_logout_at = datetime.now(UTC)
    await db.commit()

    logger.info("user_logout", user_id=str(current_user.id))
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserRead, summary="Get current user profile")
async def me(
    current_user: CurrentUser,
    redis=Depends(get_redis),
) -> UserRead:
    # Renew online key (heartbeat) so the user stays "online" while active
    online_ttl = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    await redis.setex(f"online:{current_user.id}", online_ttl, "1")
    try:
        current_user.profile_picture_url = _storage.resolve_profile_picture_url(current_user.profile_picture_url)
    except Exception:
        pass
    return UserRead.model_validate(current_user)


@router.put("/me/password", response_model=MessageResponse, summary="Change own password")
async def change_password(
    body: PasswordChangeRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(body.new_password)
    db.add(AuditLog(user_id=current_user.id, action="PASSWORD_CHANGED", status="success"))
    await db.commit()
    return MessageResponse(message="Password changed successfully")
