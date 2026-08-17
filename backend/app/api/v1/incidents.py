import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOrCoach, CurrentUser, get_db
from app.models.incident import Incident, IncidentStatus
from app.models.user import UserRole
from app.schemas.incident import IncidentCreate, IncidentUpdate, IncidentRead
from app.schemas.common import PaginatedResponse
from app.services.audit_service import audit_log

router = APIRouter()


def _jsonable(d: dict) -> dict:
    from datetime import date as _date, datetime as _datetime, time as _time

    def conv(v):
        if isinstance(v, (uuid.UUID, _date, _datetime, _time)):
            return str(v)
        return v

    return {k: conv(v) for k, v in d.items()}


@router.get("", response_model=PaginatedResponse[IncidentRead], summary="List incidents")
async def list_incidents(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    category: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    query = select(Incident)

    if current_user.role == UserRole.STUDENT:
        query = query.where(Incident.involved_student_id == current_user.id)

    if status_filter:
        query = query.where(Incident.status == status_filter)
    if category:
        query = query.where(Incident.category == category)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Incident.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [IncidentRead.model_validate(r) for r in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=IncidentRead, status_code=status.HTTP_201_CREATED, summary="Report incident")
async def create_incident(
    body: IncidentCreate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    incident = Incident(**body.model_dump(), reported_by_id=user.id)
    db.add(incident)
    await db.flush()
    await db.refresh(incident)
    await audit_log(
        db=db,
        action="INCIDENT_CREATED",
        module="Incidents",
        description=f"Reported incident involving student {body.involved_student_id} ({body.category})",
        resource_type="Incident",
        resource_id=str(incident.id),
        new_values=_jsonable(body.model_dump()),
        current_user=user,
    )
    await db.commit()
    return IncidentRead.model_validate(incident)


@router.patch("/{incident_id}", response_model=IncidentRead, summary="Update/resolve incident")
async def update_incident(
    incident_id: uuid.UUID,
    body: IncidentUpdate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    updates = body.model_dump(exclude_unset=True)

    if updates.get("status") == IncidentStatus.RESOLVED and incident.status != IncidentStatus.RESOLVED:
        incident.resolved_by_id = user.id
        incident.resolved_at = datetime.now(UTC)

    for k, v in updates.items():
        setattr(incident, k, v)

    await audit_log(
        db=db,
        action="INCIDENT_UPDATED",
        module="Incidents",
        description=f"Updated incident (status: {incident.status.value if hasattr(incident.status, 'value') else incident.status})",
        resource_type="Incident",
        resource_id=str(incident_id),
        new_values=_jsonable(updates),
        current_user=user,
    )
    await db.flush()
    await db.refresh(incident)
    return IncidentRead.model_validate(incident)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete incident")
async def delete_incident(
    incident_id: uuid.UUID,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    await audit_log(
        db=db,
        action="INCIDENT_DELETED",
        module="Incidents",
        description=f"Deleted incident: {incident.title}",
        resource_type="Incident",
        resource_id=str(incident_id),
        new_values=_jsonable({"title": incident.title, "category": incident.category.value if hasattr(incident.category, "value") else incident.category}),
        current_user=user,
    )
    await db.delete(incident)
    await db.flush()
