import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOrCoach, CurrentUser, get_db
from app.models.sanction import Sanction, SanctionStatus
from app.models.user import UserRole
from app.schemas.sanction import SanctionCreate, SanctionUpdate, SanctionRead
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


@router.get("", response_model=PaginatedResponse[SanctionRead], summary="List sanctions")
async def list_sanctions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    query = select(Sanction)

    if current_user.role == UserRole.STUDENT:
        query = query.where(Sanction.student_id == current_user.id)
    elif student_id:
        query = query.where(Sanction.student_id == student_id)

    if status_filter:
        query = query.where(Sanction.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Sanction.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [SanctionRead.model_validate(r) for r in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=SanctionRead, status_code=status.HTTP_201_CREATED, summary="Issue sanction (Coach/Admin)")
async def create_sanction(
    body: SanctionCreate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    sanction = Sanction(**body.model_dump(), issued_by_id=user.id)
    db.add(sanction)
    await db.flush()
    await db.refresh(sanction)
    await audit_log(
        db=db,
        action="SANCTION_CREATED",
        module="Sanctions",
        description=f"Issued sanction to student {body.student_id} ({body.violation_type})",
        resource_type="Sanction",
        resource_id=str(sanction.id),
        new_values=_jsonable(body.model_dump()),
        current_user=user,
    )
    await db.commit()
    return SanctionRead.model_validate(sanction)


@router.patch("/{sanction_id}", response_model=SanctionRead, summary="Update sanction (Coach/Admin)")
async def update_sanction(
    sanction_id: uuid.UUID,
    body: SanctionUpdate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Sanction).where(Sanction.id == sanction_id))
    sanction = result.scalar_one_or_none()
    if not sanction:
        raise HTTPException(status_code=404, detail="Sanction not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(sanction, k, v)

    await audit_log(
        db=db,
        action="SANCTION_UPDATED",
        module="Sanctions",
        description=f"Updated sanction for student {sanction.student_id}",
        resource_type="Sanction",
        resource_id=str(sanction_id),
        new_values=_jsonable(updates),
        current_user=user,
    )
    await db.flush()
    await db.refresh(sanction)
    return SanctionRead.model_validate(sanction)


@router.post("/{sanction_id}/acknowledge", response_model=SanctionRead, summary="Student acknowledges sanction")
async def acknowledge_sanction(
    sanction_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Sanction).where(Sanction.id == sanction_id))
    sanction = result.scalar_one_or_none()
    if not sanction:
        raise HTTPException(status_code=404, detail="Sanction not found")

    if sanction.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only acknowledge your own sanctions")

    sanction.acknowledged_by_student = True
    sanction.acknowledged_at = datetime.now(UTC)
    await audit_log(
        db=db,
        action="SANCTION_ACKNOWLEDGED",
        module="Sanctions",
        description="Student acknowledged sanction",
        resource_type="Sanction",
        resource_id=str(sanction_id),
        current_user=current_user,
    )
    await db.flush()
    await db.refresh(sanction)
    return SanctionRead.model_validate(sanction)
