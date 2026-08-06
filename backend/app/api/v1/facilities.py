"""Facility monitoring + venue reservation endpoints.

Permissions:
- View venues / reservations   : Admin, Director, Staff, Coach, PE Instructor
- Manage venues / reservations : Admin, Director, Staff
- Submit reservations          : Coach, PE Instructor
- Students                     : no access
"""
import uuid
from datetime import date as dt_date, datetime as dt_datetime, time as dt_time
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import (
    AdminOnly,
    AdminOrCoach,
    CoachOrPe,
    CurrentUser,
    get_db,
)
from app.models.facility import Facility, FacilitySchedule, FacilityStatus
from app.models.reservation import ReservationStatus, VenueReservationRequest
from app.models.user import User, UserRole
from app.schemas.common import PaginatedResponse
from app.schemas.facility import (
    FacilityCreate, FacilityUpdate, FacilityRead,
    ScheduleCreate, ScheduleRead,
    ReservationCreate, ReservationRead, ReservationReject,
)
from app.services.audit_service import audit_log
from app.services.notification_service import notify_users, notify_venue_managers
from app.services.storage_service import StorageService

router = APIRouter()

_storage = StorageService()

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EDITOR_ROLES = (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF)


def _jsonable(d: dict) -> dict:
    """Convert UUID / date / time / datetime values to strings for JSONB audit columns."""
    from datetime import date as _date, datetime as _datetime, time as _time

    def conv(v):
        if isinstance(v, (uuid.UUID, _date, _datetime, _time)):
            return str(v)
        return v

    return {k: conv(v) for k, v in d.items()}


def _read_facility(f: Facility) -> FacilityRead:
    r = FacilityRead.model_validate(f)
    r.image_url = _storage.resolve_venue_image_url(f.image)
    return r


def _has_overlap(db_start: dt_time, db_end: dt_time, start: dt_time, end: dt_time) -> bool:
    return start < db_end and end > db_start


async def _conflicting_reservation(
    db: AsyncSession,
    *,
    facility_id: uuid.UUID,
    reservation_date,
    start_time: dt_time,
    end_time: dt_time,
    exclude_id: uuid.UUID | None = None,
    statuses: tuple[ReservationStatus, ...] | None = None,
) -> VenueReservationRequest | None:
    """Return an existing reservation that overlaps the given slot."""
    statuses = statuses or (ReservationStatus.PENDING, ReservationStatus.APPROVED)
    q = select(VenueReservationRequest).where(
        VenueReservationRequest.facility_id == facility_id,
        VenueReservationRequest.reservation_date == reservation_date,
        VenueReservationRequest.status.in_(statuses),
    )
    if exclude_id:
        q = q.where(VenueReservationRequest.id != exclude_id)
    result = await db.execute(q)
    existing = result.scalars().all()
    for ex in existing:
        if _has_overlap(ex.start_time, ex.end_time, start_time, end_time):
            return ex
    return None


@router.get("", response_model=PaginatedResponse[FacilityRead], summary="List facilities")
async def list_facilities(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: str | None = None,
):
    if current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Access denied.")

    query = select(Facility).where(Facility.is_active == True)  # noqa: E712
    if status_filter:
        query = query.where(Facility.status == status_filter)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(Facility.name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [_read_facility(r) for r in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("", response_model=FacilityRead, status_code=status.HTTP_201_CREATED, summary="Create facility (Admin/Director/Staff)")
async def create_facility(
    body: FacilityCreate,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await db.execute(select(Facility).where(Facility.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"A venue named '{body.name}' already exists.")

    facility = Facility(**body.model_dump())
    db.add(facility)
    await db.flush()
    await db.refresh(facility)
    await audit_log(
        db=db,
        action="FACILITY_CREATED",
        module="Facilities",
        description=f"Created venue '{body.name}'",
        resource_type="Facility",
        resource_id=str(facility.id),
        new_values=_jsonable(body.model_dump()),
        current_user=admin,
    )
    await db.commit()
    return _read_facility(facility)


@router.patch("/{facility_id}", response_model=FacilityRead, summary="Update facility (Admin/Director/Staff)")
async def update_facility(
    facility_id: uuid.UUID,
    body: FacilityUpdate,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    facility = await db.get(Facility, facility_id)
    if not facility or not facility.is_active:
        raise HTTPException(status_code=404, detail="Facility not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    status_changed = "status" in updates and updates["status"] != facility.status

    for k, v in updates.items():
        setattr(facility, k, v)

    await audit_log(
        db=db,
        action="FACILITY_UPDATED",
        module="Facilities",
        description=f"Updated venue '{facility.name}'",
        resource_type="Facility",
        resource_id=str(facility_id),
        new_values=updates,
        current_user=admin,
    )
    if status_changed:
        await audit_log(
            db=db,
            action="FACILITY_STATUS_UPDATED",
            module="Facilities",
            description=f"Venue '{facility.name}' status set to {updates['status']}",
            resource_type="Facility",
            resource_id=str(facility_id),
            new_values={"status": updates["status"]},
            current_user=admin,
        )
    await db.flush()
    await db.refresh(facility)
    return _read_facility(facility)


@router.delete("/{facility_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete facility (Admin/Director/Staff)")
async def delete_facility(
    facility_id: uuid.UUID,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    facility = await db.get(Facility, facility_id)
    if not facility or not facility.is_active:
        raise HTTPException(status_code=404, detail="Facility not found")

    # Soft delete — keep history/FKs intact.
    facility.is_active = False
    await audit_log(
        db=db,
        action="FACILITY_DELETED",
        module="Facilities",
        description=f"Deleted venue '{facility.name}'",
        resource_type="Facility",
        resource_id=str(facility_id),
        current_user=admin,
    )
    await db.commit()
    return None


@router.post("/{facility_id}/image", response_model=FacilityRead, summary="Upload venue image (Admin/Director/Staff)")
async def upload_facility_image(
    facility_id: uuid.UUID,
    file: UploadFile = File(...),
    admin: AdminOnly = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    facility = await db.get(Facility, facility_id)
    if not facility or not facility.is_active:
        raise HTTPException(status_code=404, detail="Facility not found")

    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are allowed.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")

    ext = "jpg" if "jpeg" in (file.content_type or "") else ("webp" if "webp" in (file.content_type or "") else "png")
    key = f"facilities/{facility_id}/image.{ext}"
    await _storage.upload_bytes(
        bucket="osca-reports",
        key=key,
        data=contents,
        content_type=file.content_type,
    )
    facility.image = key
    await audit_log(
        db=db,
        action="FACILITY_IMAGE_UPLOADED",
        module="Facilities",
        description=f"Updated image for venue '{facility.name}'",
        resource_type="Facility",
        resource_id=str(facility_id),
        current_user=admin,
    )
    await db.commit()
    await db.refresh(facility)
    return _read_facility(facility)


# ── Venue Reservation Requests ──────────────────────────────────────────────

@router.get("/reservations", response_model=PaginatedResponse[ReservationRead], summary="List venue reservation requests")
async def list_reservations(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: str | None = Query(None),
    facility_id: uuid.UUID | None = Query(None),
):
    if current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Access denied.")

    query = select(VenueReservationRequest)
    if current_user.role not in _EDITOR_ROLES:
        # Coach / PE Instructor — own requests only
        query = query.where(VenueReservationRequest.requester_id == current_user.id)
    if status_filter:
        query = query.where(VenueReservationRequest.status == status_filter)
    if facility_id:
        query = query.where(VenueReservationRequest.facility_id == facility_id)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(VenueReservationRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()

    items = []
    for r in rows:
        item = ReservationRead.model_validate(r)
        facility = await db.get(Facility, r.facility_id)
        requester = await db.get(User, r.requester_id)
        item.facility_name = facility.name if facility else None
        item.requester_name = requester.full_name if requester else None
        item.requester_role = requester.role.value if requester else None
        items.append(item)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.post("/reservations", response_model=ReservationRead, status_code=status.HTTP_201_CREATED, summary="Submit venue reservation request (Coach/PE Instructor)")
async def create_reservation(
    body: ReservationCreate,
    user: CoachOrPe,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    facility = await db.get(Facility, body.facility_id)
    if not facility or not facility.is_active:
        raise HTTPException(status_code=404, detail="Venue not found.")

    if body.end_time <= body.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    if facility.status in (FacilityStatus.MAINTENANCE, FacilityStatus.CLOSED):
        label = facility.status.value.replace("_", " ").title()
        raise HTTPException(
            status_code=409,
            detail=f"This venue is currently {label} and cannot be reserved.",
        )

    conflicting = await _conflicting_reservation(
        db,
        facility_id=body.facility_id,
        reservation_date=body.reservation_date,
        start_time=body.start_time,
        end_time=body.end_time,
    )
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail="A request already exists for this venue on the same date and time. Please choose another slot.",
        )

    request = VenueReservationRequest(**body.model_dump(), requester_id=user.id)
    db.add(request)
    await db.flush()
    await db.refresh(request)

    await audit_log(
        db=db,
        action="VENUE_REQUEST_SUBMITTED",
        module="Facilities",
        description=f"{user.full_name} requested venue '{facility.name}' on {body.reservation_date} {body.start_time}–{body.end_time}",
        resource_type="VenueReservationRequest",
        resource_id=str(request.id),
        new_values=_jsonable(body.model_dump()),
        current_user=user,
    )
    await notify_venue_managers(
        db,
        title="New venue reservation request",
        message=f"{user.full_name} ({user.role.value.replace('_', ' ').title()}) requested {facility.name} on {body.reservation_date} from {body.start_time} to {body.end_time}.",
        notification_type="info",
        reference_type="VenueReservationRequest",
        reference_id=request.id,
    )
    await db.commit()

    item = ReservationRead.model_validate(request)
    item.facility_name = facility.name
    item.requester_name = user.full_name
    item.requester_role = user.role.value
    return item


@router.patch("/reservations/{request_id}/approve", response_model=ReservationRead, summary="Approve venue reservation (Admin/Director/Staff)")
async def approve_reservation(
    request_id: uuid.UUID,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await db.get(VenueReservationRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Reservation request not found.")
    if request.status != ReservationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only pending requests can be approved.")

    facility = await db.get(Facility, request.facility_id)
    if not facility or not facility.is_active:
        raise HTTPException(status_code=409, detail="The venue is no longer available.")

    if facility.status in (FacilityStatus.MAINTENANCE, FacilityStatus.CLOSED):
        label = facility.status.value.replace("_", " ").title()
        raise HTTPException(
            status_code=409,
            detail=f"Cannot approve — the venue is currently {label}.",
        )

    conflicting = await _conflicting_reservation(
        db,
        facility_id=request.facility_id,
        reservation_date=request.reservation_date,
        start_time=request.start_time,
        end_time=request.end_time,
        exclude_id=request.id,
        statuses=(ReservationStatus.APPROVED,),
    )
    if conflicting:
        raise HTTPException(
            status_code=409,
            detail="Cannot approve — another approved reservation overlaps this schedule.",
        )

    request.status = ReservationStatus.APPROVED
    await db.flush()

    await audit_log(
        db=db,
        action="VENUE_REQUEST_APPROVED",
        module="Facilities",
        description=f"Approved reservation for '{facility.name}' on {request.reservation_date}",
        resource_type="VenueReservationRequest",
        resource_id=str(request.id),
        current_user=admin,
    )
    await notify_users(
        db,
        recipient_ids=[request.requester_id],
        title="Venue reservation approved",
        message=f"Your reservation for {facility.name} on {request.reservation_date} ({request.start_time}–{request.end_time}) has been approved.",
        notification_type="success",
        reference_type="VenueReservationRequest",
        reference_id=request.id,
    )
    await db.commit()
    await db.refresh(request)

    item = ReservationRead.model_validate(request)
    item.facility_name = facility.name
    requester = await db.get(User, request.requester_id)
    item.requester_name = requester.full_name if requester else None
    item.requester_role = requester.role.value if requester else None
    return item


@router.patch("/reservations/{request_id}/reject", response_model=ReservationRead, summary="Reject venue reservation (Admin/Director/Staff)")
async def reject_reservation(
    request_id: uuid.UUID,
    body: ReservationReject,
    admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    request = await db.get(VenueReservationRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Reservation request not found.")
    if request.status != ReservationStatus.PENDING:
        raise HTTPException(status_code=409, detail="Only pending requests can be rejected.")

    request.status = ReservationStatus.REJECTED
    request.rejection_reason = body.rejection_reason
    facility = await db.get(Facility, request.facility_id)
    facility_name = facility.name if facility else "the venue"
    await db.flush()

    await audit_log(
        db=db,
        action="VENUE_REQUEST_REJECTED",
        module="Facilities",
        description=f"Rejected reservation for '{facility_name}' on {request.reservation_date}",
        resource_type="VenueReservationRequest",
        resource_id=str(request.id),
        new_values={"rejection_reason": body.rejection_reason} if body.rejection_reason else None,
        current_user=admin,
    )
    await notify_users(
        db,
        recipient_ids=[request.requester_id],
        title="Venue reservation rejected",
        message=(
            f"Your reservation for {facility_name} on {request.reservation_date} was rejected."
            + (f" Reason: {body.rejection_reason}" if body.rejection_reason else "")
        ),
        notification_type="error",
        reference_type="VenueReservationRequest",
        reference_id=request.id,
    )
    await db.commit()
    await db.refresh(request)

    item = ReservationRead.model_validate(request)
    item.facility_name = facility_name
    requester = await db.get(User, request.requester_id)
    item.requester_name = requester.full_name if requester else None
    item.requester_role = requester.role.value if requester else None
    return item


@router.get("/{facility_id}/reservations", response_model=list[ReservationRead], summary="List upcoming reservations for a venue")
async def list_venue_reservations(
    facility_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return upcoming reservations (today onward) for a venue, any status, for non-students."""
    if current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Access denied.")

    facility = await db.get(Facility, facility_id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found.")

    today = datetime.now().date()
    query = (
        select(VenueReservationRequest)
        .where(
            VenueReservationRequest.facility_id == facility_id,
            VenueReservationRequest.reservation_date >= today,
        )
        .order_by(
            VenueReservationRequest.reservation_date.asc(),
            VenueReservationRequest.start_time.asc(),
        )
    )
    result = await db.execute(query.limit(50))
    rows = result.scalars().all()

    items = []
    for r in rows:
        item = ReservationRead.model_validate(r)
        item.facility_name = facility.name
        requester = await db.get(User, r.requester_id)
        item.requester_name = requester.full_name if requester else None
        item.requester_role = requester.role.value if requester else None
        items.append(item)
    return items


# ── Schedules (legacy, no longer surfaced in the UI) ───────────────────────

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
        new_values=_jsonable(body.model_dump()),
        current_user=user,
    )
    await db.commit()
    return ScheduleRead.model_validate(schedule)
