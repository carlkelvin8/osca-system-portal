"""Facility monitoring endpoints."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOnly, AdminOrCoach, CurrentUser, get_db
from app.models.facility import Facility, FacilitySchedule
from app.schemas.facility import (
    FacilityCreate, FacilityUpdate, FacilityRead,
    ScheduleCreate, ScheduleRead,
)
from app.schemas.common import PaginatedResponse
from app.services.audit_service import audit_log

router = APIRouter()


@router.get("", response_model=PaginatedResponse[FacilityRead], summary="List facilities")
async def list_facilities(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: str | None = None,
):
    query = select(Facility).where(Facility.is_active == True)
    if status_filter:
        query = query.where(Facility.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Facility.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [FacilityRead.model_validate(r) for r in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=FacilityRead, status_code=status.HTTP_201_CREATED, summary="Create facility (Admin)")
async def create_facility(
    body: FacilityCreate,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    facility = Facility(**body.model_dump())
    db.add(facility)
    await db.flush()
    await db.refresh(facility)
    await audit_log(
        db=db,
        action="FACILITY_CREATED",
        module="Facilities",
        description=f"Created facility '{body.name}'",
        resource_type="Facility",
        resource_id=str(facility.id),
        new_values=body.model_dump(),
        current_user=admin,
    )
    await db.commit()
    return FacilityRead.model_validate(facility)


@router.patch("/{facility_id}", response_model=FacilityRead, summary="Update facility (Admin)")
async def update_facility(
    facility_id: uuid.UUID,
    body: FacilityUpdate,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Facility).where(Facility.id == facility_id))
    facility = result.scalar_one_or_none()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(facility, k, v)
    await audit_log(
        db=db,
        action="FACILITY_UPDATED",
        module="Facilities",
        description=f"Updated facility '{facility.name}'",
        resource_type="Facility",
        resource_id=str(facility_id),
        new_values=updates,
        current_user=admin,
    )
    await db.flush()
    await db.refresh(facility)
    return FacilityRead.model_validate(facility)


# ── Schedules ──

@router.get("/schedules", response_model=list[ScheduleRead], summary="List facility schedules")
async def list_schedules(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    facility_id: uuid.UUID | None = None,
):
    query = select(FacilitySchedule).order_by(FacilitySchedule.scheduled_date.desc())
    if facility_id:
        query = query.where(FacilitySchedule.facility_id == facility_id)
    result = await db.execute(query.limit(100))
    return [ScheduleRead.model_validate(r) for r in result.scalars().all()]


@router.post("/schedules", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED, summary="Book facility schedule")
async def create_schedule(
    body: ScheduleCreate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    schedule = FacilitySchedule(**body.model_dump(), booked_by_id=user.id)
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    await audit_log(
        db=db,
        action="FACILITY_SCHEDULE_CREATED",
        module="Facilities",
        description=f"Booked facility schedule for {body.facility_id} on {body.scheduled_date}",
        resource_type="FacilitySchedule",
        resource_id=str(schedule.id),
        new_values=body.model_dump(),
        current_user=user,
    )
    await db.commit()
    return ScheduleRead.model_validate(schedule)
