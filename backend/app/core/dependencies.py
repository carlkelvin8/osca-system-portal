"""
FastAPI dependency injection — authentication, RBAC, rate limiting.
"""
import uuid
from typing import Annotated

import structlog
import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_token, is_token_type
from app.database import get_db
from app.models.user import User, UserRole

logger = structlog.get_logger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


# ── Redis Client ──────────────────────────────────────────────────────────────

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


# ── Token Extraction & Validation ─────────────────────────────────────────────

async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
) -> User:
    """
    Validate Bearer JWT, check token blacklist (Redis), return User.
    Raises 401 on any failure.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not credentials:
        raise credentials_exception

    token = credentials.credentials

    # Check token blacklist (logout / rotation invalidation)
    blacklisted = await redis.get(f"blacklist:{token}")
    if blacklisted:
        raise credentials_exception

    try:
        payload = decode_token(token)
        if not is_token_type(payload, "access"):
            raise credentials_exception
        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_id = uuid.UUID(user_id_str)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    # Attach the request so audit logging can extract IP / browser / device context.
    user._current_request = request

    return user


# ── Typed Current User Aliases ────────────────────────────────────────────────

CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
) -> User | None:
    """
    Like get_current_user but returns None instead of raising 401.
    Used for endpoints that behave differently for authenticated vs anonymous callers.
    """
    if not credentials:
        return None
    try:
        token = credentials.credentials
        blacklisted = await redis.get(f"blacklist:{token}")
        if blacklisted:
            return None
        payload = decode_token(token)
        if not is_token_type(payload, "access"):
            return None
        user_id_str: str | None = payload.get("sub")
        if not user_id_str:
            return None
        user_id = uuid.UUID(user_id_str)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            return None
        user._current_request = request
        return user
    except JWTError:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


# ── RBAC Role Checkers ────────────────────────────────────────────────────────

def require_roles(*roles: UserRole):
    """Factory that returns a dependency enforcing role membership."""
    async def _check(current_user: CurrentUser) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in roles]}",
            )
        return current_user
    return _check


# Pre-built role dependencies — Director shares Admin privileges
AdminOnly = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF))]
AdminOrCoach = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF, UserRole.COACH))]
CoachOrPe = Annotated[User, Depends(require_roles(UserRole.COACH, UserRole.PE_INSTRUCTOR))]
StaffOnly = Annotated[User, Depends(
    require_roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF, UserRole.COACH, UserRole.PE_INSTRUCTOR)
)]
NotStudent = Annotated[User, Depends(
    require_roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF, UserRole.COACH, UserRole.PE_INSTRUCTOR)
)]
# For attendance scan — must be logged-in user (not public)
ScanStaff = Annotated[User, Depends(
    require_roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF, UserRole.COACH, UserRole.PE_INSTRUCTOR, UserRole.STUDENT)
)]


# ── Rate Limiting ─────────────────────────────────────────────────────────────

async def check_login_rate_limit(request: Request, redis: Annotated[aioredis.Redis, Depends(get_redis)]) -> None:
    """
    Enforces login rate limit: 5 attempts per 15 min, then 30-min lockout.
    Key is based on client IP.
    """
    client_ip = request.client.host if request.client else "unknown"
    lockout_key = f"login_lockout:{client_ip}"
    attempt_key = f"login_attempts:{client_ip}"

    # Check lockout
    if await redis.exists(lockout_key):
        ttl = await redis.ttl(lockout_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {ttl} seconds.",
        )

    # Increment attempts
    attempts = await redis.incr(attempt_key)
    if attempts == 1:
        await redis.expire(attempt_key, settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS)

    if attempts > settings.LOGIN_RATE_LIMIT_ATTEMPTS:
        await redis.setex(lockout_key, settings.LOGIN_LOCKOUT_SECONDS, "locked")
        await redis.delete(attempt_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked for {settings.LOGIN_LOCKOUT_SECONDS // 60} minutes.",
        )


async def clear_login_rate_limit(client_ip: str, redis: aioredis.Redis) -> None:
    """Clear rate limit counters on successful login."""
    await redis.delete(f"login_attempts:{client_ip}")
    await redis.delete(f"login_lockout:{client_ip}")
