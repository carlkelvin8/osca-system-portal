"""
Admin configuration endpoints.

Provides runtime control over facial recognition thresholds without restarting
the server. All changes are persisted to Redis and logged to the audit trail.

Routes:
    GET  /admin/fr-config  — Read current FR configuration (Admin only)
    PUT  /admin/fr-config  — Update FR configuration (Admin only)
"""
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOnly, get_db, get_redis
from app.schemas.admin import THRESHOLD_SECURITY_FLOOR, FRConfigRead, FRConfigUpdate
from app.services.audit_service import audit_log
from app.services.fr_config_service import FRConfigService

router = APIRouter()
logger = structlog.get_logger(__name__)


# ── GET /admin/fr-config ──────────────────────────────────────────────────────


@router.get(
    "/fr-config",
    response_model=FRConfigRead,
    summary="Get current FR configuration (Admin only)",
)
async def get_fr_config(
    _admin: AdminOnly,
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
) -> FRConfigRead:
    """Return the active facial recognition thresholds (Redis or static fallback)."""
    config = FRConfigService(redis)
    return FRConfigRead(**(await config.get_all()))


# ── PUT /admin/fr-config ──────────────────────────────────────────────────────


@router.put(
    "/fr-config",
    response_model=FRConfigRead,
    summary="Update FR configuration (Admin only)",
)
async def update_fr_config(
    body: FRConfigUpdate,
    admin: AdminOnly,
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FRConfigRead:
    """
    Persist new FR thresholds to Redis.  Changes take effect on the very next
    scan request — no server restart required.

    Security warning: If similarity_threshold falls below 0.70 the endpoint
    still succeeds but logs a warning-level audit entry alerting other admins.
    """
    config = FRConfigService(redis)
    previous = await config.get_all()

    await config.update(
        similarity_threshold=body.similarity_threshold,
        liveness_threshold=body.liveness_threshold,
        liveness_enabled=body.liveness_enabled,
    )
    updated = await config.get_all()

    # Determine whether this update crosses the security floor
    sim = updated["similarity_threshold"]
    security_warning = (
        f"similarity_threshold={sim:.2f} is below the recommended minimum "
        f"of {THRESHOLD_SECURITY_FLOOR}. False-accept rate may increase significantly."
        if isinstance(sim, float) and sim < THRESHOLD_SECURITY_FLOOR
        else None
    )

    audit_status = "warning" if security_warning else "success"
    await audit_log(
        db=db,
        action="FR_CONFIG_UPDATED",
        module="System",
        description=f"Updated facial recognition configuration (status: {audit_status})",
        resource_type="FRConfig",
        status=audit_status,
        details={
            "previous": previous,
            "updated": updated,
            "warning": security_warning,
        },
        current_user=admin,
    )
    await db.commit()

    if security_warning:
        logger.warning("fr_config_security_warning", admin_id=str(admin.id), warning=security_warning)
    else:
        logger.info("fr_config_updated", admin_id=str(admin.id), **{str(k): v for k, v in updated.items()})

    return FRConfigRead(**updated)
