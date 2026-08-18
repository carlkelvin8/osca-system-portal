import uuid
from datetime import date as _date, datetime as _datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import AdminOrCoach, CurrentUser, get_db
from app.models.eligibility import AthleteEligibility
from app.models.user import User, UserRole
from app.schemas.common import PaginatedResponse
from app.schemas.eligibility import EligibilityCreate, EligibilityUpdate, EligibilityRead
from app.schemas.user import UserSummary
from app.services.audit_service import audit_log
from app.services.storage_service import StorageService

router = APIRouter()
_storage = StorageService()


def _jsonable(d: dict) -> dict:
    def conv(v):
        if isinstance(v, (uuid.UUID, _date, _datetime)):
            return str(v)
        return v
    return {k: conv(v) for k, v in d.items()}


def _attach_student(item: EligibilityRead, record: AthleteEligibility) -> EligibilityRead:
    stu = record.student
    if stu is not None:
        item.student_registered_id = stu.student_id
        item.student_full_name = stu.full_name
    return item


@router.get("", response_model=PaginatedResponse[EligibilityRead], summary="List eligibility records")
async def list_eligibility(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    student_id: uuid.UUID | None = None,
    current_only: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    query = select(AthleteEligibility).options(selectinload(AthleteEligibility.student))

    if current_user.role == UserRole.STUDENT:
        query = query.where(AthleteEligibility.student_id == current_user.id)
    elif student_id:
        query = query.where(AthleteEligibility.student_id == student_id)

    if current_only:
        query = query.where(AthleteEligibility.is_current == True)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(AthleteEligibility.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = []
    for r in result.scalars().all():
        items.append(_attach_student(EligibilityRead.model_validate(r), r))

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=EligibilityRead, status_code=status.HTTP_201_CREATED, summary="Create eligibility record (Admin/Coach)")
async def create_eligibility(
    body: EligibilityCreate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    record = AthleteEligibility(**body.model_dump(), created_by_id=user.id)
    db.add(record)
    await db.flush()
    await db.refresh(record)
    await audit_log(
        db=db,
        action="ELIGIBILITY_CREATED",
        module="Eligibility",
        description=f"Created eligibility record for student {body.student_id}",
        resource_type="AthleteEligibility",
        resource_id=str(record.id),
        new_values=_jsonable(body.model_dump()),
        current_user=user,
    )
    await db.commit()
    record = (await db.execute(
        select(AthleteEligibility)
        .options(selectinload(AthleteEligibility.student))
        .where(AthleteEligibility.id == record.id)
    )).scalar_one()
    return _attach_student(EligibilityRead.model_validate(record), record)


@router.get("/students", response_model=PaginatedResponse[UserSummary], summary="List active students (Admin/Coach)")
async def list_students(
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=100),
):
    query = select(User).where(User.role == UserRole.STUDENT, User.is_active == True)
    if search:
        like = f"%{search.lower()}%"
        query = query.where(
            func.lower(User.first_name).ilike(like)
            | func.lower(User.last_name).ilike(like)
            | func.lower(User.email).ilike(like)
            | User.student_id.ilike(like)
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(User.last_name, User.first_name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        summary = UserSummary.model_validate(u)
        try:
            summary.profile_picture_url = _storage.resolve_profile_picture_url(u.profile_picture_url)
        except Exception:
            pass
        items.append(summary)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.patch("/{record_id}", response_model=EligibilityRead, summary="Update eligibility (Admin/Coach)")
async def update_eligibility(
    record_id: uuid.UUID,
    body: EligibilityUpdate,
    user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AthleteEligibility).where(AthleteEligibility.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    updates = body.model_dump(exclude_unset=True)

    if updates.get("medical_clearance") is True and not record.medical_clearance:
        record.cleared_by_id = user.id
        record.cleared_at = _datetime.now(UTC)

    for k, v in updates.items():
        setattr(record, k, v)

    await audit_log(
        db=db,
        action="ELIGIBILITY_UPDATED",
        module="Eligibility",
        description=f"Updated eligibility record for student {record.student_id}",
        resource_type="AthleteEligibility",
        resource_id=str(record_id),
        new_values=_jsonable(updates),
        current_user=user,
    )
    await db.flush()
    record = (await db.execute(
        select(AthleteEligibility)
        .options(selectinload(AthleteEligibility.student))
        .where(AthleteEligibility.id == record.id)
    )).scalar_one()
    return _attach_student(EligibilityRead.model_validate(record), record)
