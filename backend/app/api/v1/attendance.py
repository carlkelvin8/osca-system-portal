import base64
import ipaddress
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import AdminOnly, AdminOrCoach, CurrentUser, ScanStaff, StaffOnly, get_db, get_redis
from app.core.exceptions import NotFoundError
from app.models.attendance import (
    AttendanceRecord,
    AttendanceScanType,
    FaceEmbedding,
    ScanAttempt,
    ScanResult,
    Session,
)
from app.models.sanction import Sanction, SanctionStatus
from app.models.user import User, UserRole
from app.schemas.attendance import (
    AttendanceRecordRead,
    EnrollmentRequest,
    EnrollmentResponse,
    FaceScanRequest,
    FaceScanResponse,
    LatestAttendanceRead,
    ManualAttendanceCreate,
    ManualAttendanceUpdate,
    QrCheckInRequest,
    SessionCreate,
    SessionRead,
    SessionStatsRead,
    SessionUpdate,
)
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.audit_service import audit_log
from app.services.facial_recognition import FacialRecognitionService
from app.services.fr_config_service import FRConfigService

_CONSEC_FAIL_LIMIT = 3
_CONSEC_FAIL_WINDOW = 300

router = APIRouter()
logger = structlog.get_logger(__name__)


def _get_fr_service(request: Request) -> FacialRecognitionService:
    svc = getattr(request.app.state, "fr_service", None)
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Facial recognition service is not available. The model failed to load at startup.",
        )
    return svc


def _performed_by(user: User | None) -> str:
    if user is None:
        return "system"
    role = getattr(user, "role", None)
    return role.value if hasattr(role, "value") else str(role) if role else "system"


def _is_trusted_proxy_host(host: str | None) -> bool:
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


def _client_ip(request: Request) -> str | None:
    peer = request.client.host if request.client else None
    xff = request.headers.get("x-forwarded-for")
    if xff and _is_trusted_proxy_host(peer):
        first = next((p.strip() for p in xff.split(",") if p.strip()), None)
        if first:
            return first.split("%")[0].split(":")[0] if "%" in first else first
    return peer


def _parse_device(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    ua = user_agent

    if "Edg/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "SamsungBrowser" in ua:
        browser = "Samsung Internet"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    elif "Trident/" in ua or "MSIE" in ua:
        browser = "Internet Explorer"
    else:
        browser = None

    if "Windows" in ua:
        os_label = "Windows"
    elif "iPhone" in ua:
        os_label = "iPhone"
    elif "iPad" in ua:
        os_label = "iPad"
    elif "iPod" in ua:
        os_label = "iPod"
    elif "Android" in ua:
        os_label = "Android"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_label = "macOS"
    elif "Linux" in ua:
        os_label = "Linux"
    else:
        os_label = None

    parts = [p for p in (browser, os_label) if p]
    if not parts:
        return None
    return " • ".join(parts)[:200]


def _jsonable(data: dict) -> dict:
    import datetime as _dt

    out = {}
    for k, v in data.items():
        if isinstance(v, (_dt.date, _dt.datetime, _dt.time)) or isinstance(v, uuid.UUID):
            out[k] = str(v)
        elif isinstance(v, dict):
            out[k] = _jsonable(v)
        elif isinstance(v, list):
            out[k] = [_jsonable(i) if isinstance(i, dict) else i for i in v]
        else:
            out[k] = v
    return out


def _validate_coach_session_sport(current_user: User, sport_or_art: str | None) -> None:
    if current_user.role != UserRole.COACH:
        return
    if not current_user.assigned_sport or sport_or_art != current_user.assigned_sport:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coaches can only create/manage sessions for their assigned sport or art",
        )


async def _enforce_coach_session_scope(
    db: AsyncSession,
    current_user: User,
    session: Session,
    *,
    action: str = "ATTENDANCE_ATTEMPT_BLOCKED",
    method: str | None = None,
    scan_type: AttendanceScanType | None = None,
) -> None:
    if current_user.role != UserRole.COACH:
        return
    if not current_user.assigned_sport or session.sport_or_art != current_user.assigned_sport:
        await _attendance_audit(
            db=db,
            action=action,
            description=(
                f"Coach '{current_user.full_name}' blocked from session '{session.name}' "
                f"({session.sport_or_art or 'N/A'}) — assigned sport/art is "
                f"'{current_user.assigned_sport or 'N/A'}'"
            ),
            status="failure",
            method=method,
            result="blocked",
            failure_reason="Session is not in the coach's assigned sport or art",
            session=session,
            scan_type=scan_type,
            performer=current_user,
            resource_type="Session",
            resource_id=str(session.id),
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This session is not in your assigned sport or art",
        )


async def _attendance_audit(
    db: AsyncSession,
    *,
    action: str,
    description: str,
    status: str = "success",
    method: str | None = None,
    result: str = "success",
    failure_reason: str | None = None,
    student: User | None = None,
    session: Session | None = None,
    attendance_record: AttendanceRecord | None = None,
    scan_type: AttendanceScanType | None = None,
    performer: User | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    request: Request | None = None,
    ip_address: str | None = None,
) -> None:
    details: dict = {
        "student_name": student.full_name if student else None,
        "student_id": getattr(student, "student_id", None),
        "student_email": student.email if student else None,
        "sport_or_art": (
            (session.sport_or_art if session else None)
            or (getattr(student, "sport_or_art", None) if student else None)
        ),
        "session_name": session.name if session else None,
        "session_id": str(session.id) if session else None,
        "date_time": datetime.now(UTC).isoformat(),
        "attendance_status": attendance_record.status if attendance_record else None,
        "method": method,
        "scan_type": getattr(scan_type, "value", scan_type) if scan_type else None,
        "action": action,
        "performed_by": _performed_by(performer),
        "result": result,
        "failure_reason": failure_reason,
    }
    if previous_values:
        details["previous_values"] = previous_values
    if new_values:
        details["new_values"] = new_values

    await audit_log(
        db=db,
        action=action,
        module="Attendance",
        description=description,
        resource_type=resource_type,
        resource_id=resource_id or (str(attendance_record.id) if attendance_record else str(session.id) if session else None),
        previous_values=previous_values,
        new_values=new_values,
        details=details,
        status=status,
        failure_reason=failure_reason,
        current_user=performer,
        request=request,
        ip_address=ip_address,
    )


def _check_active_sanction(sanctions) -> Sanction | None:
    return sanctions[0] if sanctions else None


@router.post(
    "/sessions",
    response_model=SessionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new training/event session (Admin/Coach)",
)
async def create_session(
    body: SessionCreate,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRead:
    _validate_coach_session_sport(current_user, body.sport_or_art)

    session = Session(
        **body.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    await _attendance_audit(
        db=db,
        action="SESSION_CREATED",
        description=f"Created attendance session '{session.name}' ({session.sport_or_art or 'N/A'})",
        status="success",
        result="success",
        student=None,
        session=session,
        performer=current_user,
        resource_type="Session",
        resource_id=str(session.id),
        new_values={
            "name": session.name,
            "activity_type": session.activity_type.value,
            "sport_or_art": session.sport_or_art,
            "scheduled_start": str(session.scheduled_start),
            "scheduled_end": str(session.scheduled_end),
            "venue": session.venue,
            "is_active": session.is_active,
        },
    )

    result = SessionRead.model_validate(session)
    result.attendance_count = 0
    return result


@router.get("/sessions", response_model=PaginatedResponse[SessionRead], summary="List sessions")
async def list_sessions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sport_or_art: str | None = Query(None),
    is_active: bool | None = Query(None),
) -> PaginatedResponse[SessionRead]:
    if current_user.role == UserRole.PE_INSTRUCTOR:
        return PaginatedResponse(items=[], total=0, page=page, page_size=page_size, pages=0)

    query = select(Session)
    if current_user.role == UserRole.COACH and current_user.assigned_sport:
        query = query.where(Session.sport_or_art == current_user.assigned_sport)
    if current_user.role == UserRole.STUDENT and current_user.sport_or_art:
        query = query.where(Session.sport_or_art == current_user.sport_or_art)
    if sport_or_art:
        query = query.where(Session.sport_or_art == sport_or_art)

    if is_active is True:
        query = query.where(
            Session.is_active.is_(True),
            Session.scheduled_end
            + func.make_interval(0, 0, 0, 0, 0, Session.grace_period_minutes)
            >= datetime.now(UTC),
        )
    elif is_active is False:
        query = query.where(Session.is_active.is_(False))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Session.scheduled_start.desc())
    sessions = (await db.execute(query)).scalars().all()

    items = []
    for s in sessions:
        count_result = await db.execute(
            select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == s.id)
        )
        sr = SessionRead.model_validate(s)
        sr.attendance_count = count_result.scalar_one()
        items.append(sr)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


@router.get(
    "/sessions/{session_id}",
    response_model=SessionRead,
    summary="Get a single session by ID",
)
async def get_session(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRead:
    if current_user.role == UserRole.PE_INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PE Instructors are not allowed to access attendance",
        )
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_ACCESS_DENIED", method="manual"
    )

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


@router.get(
    "/sessions/{session_id}/stats",
    response_model=SessionStatsRead,
    summary="Get attendance counts (present/late/absent/total) for a session",
)
async def get_session_stats(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionStatsRead:
    if current_user.role == UserRole.PE_INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PE Instructors are not allowed to access attendance",
        )
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_STATS_ACCESS_DENIED", method="manual"
    )

    stats = {"present": 0, "late": 0, "absent": 0}
    total = 0
    rows = (
        await db.execute(
            select(AttendanceRecord.status, func.count(AttendanceRecord.id))
            .where(AttendanceRecord.session_id == session.id)
            .group_by(AttendanceRecord.status)
        )
    ).all()
    for status_value, count in rows:
        key = (status_value or "").lower()
        if key in stats:
            stats[key] = count
        total += count
    stats["total"] = total
    return SessionStatsRead(session_id=session.id, **stats)


@router.get(
    "/sessions/{session_id}/latest-attendance",
    response_model=LatestAttendanceRead,
    summary="Get the last successful attendance for a session (kiosk display)",
)
async def get_latest_attendance(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LatestAttendanceRead:
    if current_user.role == UserRole.PE_INSTRUCTOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PE Instructors are not allowed to access attendance",
        )
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_LATEST_ATTENDANCE_DENIED", method="manual"
    )

    def _response(scan_time=None, time_out=None, status_val=None, duration=None,
                  person_name=None, person_role=None, confidence=None, has_record=True):
        return LatestAttendanceRead(
            has_record=has_record,
            person_name=person_name,
            person_role=person_role,
            time=scan_time,
            time_out=time_out,
            duration_minutes=duration,
            status=status_val,
            session_name=session.name,
            session_sport_or_art=session.sport_or_art,
            confidence_score=confidence,
        )

    scan_row = (
        await db.execute(
            select(ScanAttempt, User)
            .join(User, User.id == ScanAttempt.matched_user_id)
            .where(
                ScanAttempt.session_id == session.id,
                ScanAttempt.result == ScanResult.SUCCESS,
            )
            .order_by(ScanAttempt.attempted_at.desc())
            .limit(1)
        )
    ).first()
    if scan_row:
        scan, scanned_user = scan_row

        record = None
        if scanned_user.role == UserRole.STUDENT:
            rec = await db.execute(
                select(AttendanceRecord)
                .where(
                    AttendanceRecord.session_id == session.id,
                    AttendanceRecord.student_id == scanned_user.id,
                )
                .order_by(AttendanceRecord.updated_at.desc())
                .limit(1)
            )
            record = rec.scalar_one_or_none()

        duration = None
        if record and record.time_in and record.time_out:
            duration = int((record.time_out - record.time_in).total_seconds() // 60)

        return _response(
            scan_time=scan.attempted_at,
            time_out=record.time_out if record else None,
            status_val=record.status if record else None,
            duration=duration,
            person_name=scanned_user.full_name,
            person_role=scanned_user.role.value if record is None else "student",
            confidence=scan.confidence_score,
        )

    rec_row = (
        await db.execute(
            select(AttendanceRecord, User)
            .join(User, User.id == AttendanceRecord.student_id)
            .where(AttendanceRecord.session_id == session.id)
            .order_by(AttendanceRecord.time_in.desc())
            .limit(1)
        )
    ).first()
    if rec_row:
        record, student = rec_row
        duration = None
        if record.time_in and record.time_out:
            duration = int((record.time_out - record.time_in).total_seconds() // 60)
        return _response(
            scan_time=record.time_in,
            time_out=record.time_out,
            status_val=record.status,
            duration=duration,
            person_name=student.full_name,
            person_role="student",
        )

    return _response(has_record=False)


@router.patch(
    "/sessions/{session_id}",
    response_model=SessionRead,
    summary="Update a session (Admin/Coach)",
)
async def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRead:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_ACCESS_DENIED", method="manual"
    )

    update_data = body.model_dump(exclude_unset=True)

    if "sport_or_art" in update_data:
        _validate_coach_session_sport(current_user, update_data["sport_or_art"])

    new_start = update_data.get("scheduled_start", session.scheduled_start)
    new_end = update_data.get("scheduled_end", session.scheduled_end)
    if new_end <= new_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_end must be after scheduled_start",
        )

    for field, value in update_data.items():
        setattr(session, field, value)

    await _attendance_audit(
        db=db,
        action="SESSION_UPDATED",
        description=f"Updated attendance session '{session.name}'",
        status="success",
        result="success",
        session=session,
        performer=current_user,
        resource_type="Session",
        resource_id=str(session_id),
        new_values=_jsonable(update_data),
    )
    await db.commit()
    await db.refresh(session)

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


@router.post(
    "/sessions/{session_id}/end",
    response_model=SessionRead,
    summary="Mark a session as ended/closed (Admin/Coach)",
)
async def end_session(
    session_id: uuid.UUID,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRead:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))
    if not session.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already closed",
        )

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_ACCESS_DENIED", method="manual"
    )

    session.is_active = False
    await _attendance_audit(
        db=db,
        action="SESSION_CLOSED",
        description=f"Closed attendance session '{session.name}'",
        status="success",
        result="success",
        session=session,
        performer=current_user,
        resource_type="Session",
        resource_id=str(session_id),
        previous_values={"is_active": True},
        new_values={"is_active": False},
    )
    await db.commit()
    await db.refresh(session)

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


@router.post(
    "/sessions/{session_id}/open",
    response_model=SessionRead,
    summary="Re-open a closed session (Admin/Coach)",
)
async def open_session(
    session_id: uuid.UUID,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionRead:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))
    if session.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already open",
        )

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_ACCESS_DENIED", method="manual"
    )

    session.is_active = True
    await _attendance_audit(
        db=db,
        action="SESSION_OPENED",
        description=f"Re-opened attendance session '{session.name}'",
        status="success",
        result="success",
        session=session,
        performer=current_user,
        resource_type="Session",
        resource_id=str(session_id),
        previous_values={"is_active": False},
        new_values={"is_active": True},
    )
    await db.commit()
    await db.refresh(session)

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


@router.delete(
    "/sessions/{session_id}",
    response_model=MessageResponse,
    summary="Delete a session and its attendance records (Admin/Coach)",
)
async def delete_session(
    session_id: uuid.UUID,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    await _enforce_coach_session_scope(
        db, current_user, session, action="SESSION_ACCESS_DENIED", method="manual"
    )

    record_count = (
        await db.execute(
            select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
        )
    ).scalar_one()

    await _attendance_audit(
        db=db,
        action="SESSION_DELETED",
        description=f"Deleted attendance session '{session.name}' with {record_count} attendance record(s)",
        status="success",
        result="success",
        session=session,
        performer=current_user,
        resource_type="Session",
        resource_id=str(session_id),
        previous_values={
            "name": session.name,
            "sport_or_art": session.sport_or_art,
            "scheduled_start": str(session.scheduled_start),
            "scheduled_end": str(session.scheduled_end),
            "is_active": session.is_active,
            "attendance_records_count": int(record_count),
        },
    )
    await db.delete(session)
    await db.commit()

    return MessageResponse(message=f"Session '{session.name}' deleted")


@router.post(
    "/enroll",
    response_model=EnrollmentResponse,
    summary="Enroll a face (Admin enrolls anyone; Student enrolls themselves only)",
)
async def enroll_face(
    body: EnrollmentRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    fr_service: Annotated[FacialRecognitionService, Depends(_get_fr_service)],
) -> EnrollmentResponse:
    is_self = current_user.id == body.user_id
    if not is_self and current_user.role == UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students can only enroll their own face.",
        )

    result = await db.execute(select(User).where(User.id == body.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(body.user_id))

    if not is_self and current_user.role == UserRole.COACH:
        if user.role != UserRole.STUDENT or user.sport_or_art != current_user.assigned_sport:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Coaches can only enroll students from their assigned sport or art",
            )
    if not user.biometric_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has not provided biometric consent (R.A. 10173)",
        )

    images_bytes = []
    for img_b64 in body.images_base64:
        try:
            images_bytes.append(base64.b64decode(img_b64))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")

    try:
        embedding, model_used, minio_keys = await fr_service.enroll_face(
            user_id=str(body.user_id),
            images_bytes=images_bytes,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("face_enroll_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Face enrollment failed due to an internal error.")

    existing = await db.execute(select(FaceEmbedding).where(FaceEmbedding.user_id == body.user_id))
    face_emb = existing.scalar_one_or_none()
    if face_emb:
        face_emb.embedding = embedding
        face_emb.images_used = len(images_bytes)
        face_emb.model_used = model_used
        face_emb.minio_image_keys = ",".join(minio_keys)
        face_emb.updated_at = datetime.now(UTC)
    else:
        face_emb = FaceEmbedding(
            user_id=body.user_id,
            embedding=embedding,
            model_used=model_used,
            images_used=len(images_bytes),
            minio_image_keys=",".join(minio_keys),
        )
        db.add(face_emb)

    user.is_face_enrolled = True
    await audit_log(
        db=db,
        action="FACE_ENROLLED",
        module="Attendance",
        description=f"Enrolled face biometrics for {user.full_name}",
        resource_type="FaceEmbedding",
        resource_id=str(face_emb.id) if face_emb.id else None,
        details={"model": model_used, "images_count": len(images_bytes)},
        current_user=current_user,
    )
    await db.commit()
    await db.refresh(face_emb)

    logger.info("face_enrolled", user_id=str(body.user_id), model=model_used)
    return EnrollmentResponse(
        success=True,
        user_id=body.user_id,
        embedding_id=face_emb.id,
        images_processed=len(images_bytes),
        message="Face enrolled successfully",
    )


@router.post(
    "/scan",
    response_model=FaceScanResponse,
    summary="Attendance Scan: time-in or time-out (Admin / Coach / PE Instructor only)",
)
async def face_scan(
    body: FaceScanRequest,
    current_staff: ScanStaff,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    fr_service: Annotated[FacialRecognitionService, Depends(_get_fr_service)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
) -> FaceScanResponse:
    start_time = time.monotonic()

    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    session_result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_FAILED",
            description="Attendance scan attempted for a non-existent session",
            status="failure",
            method="facial_recognition",
            result="failed",
            failure_reason="Session not found",
            session=None,
            scan_type=body.scan_type,
            performer=current_staff,
            resource_type="Session",
            resource_id=str(body.session_id),
        )
        await db.commit()
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_AFTER_SESSION_CLOSED",
            description=f"Attendance attempt blocked: session '{session.name}' is closed",
            status="failure",
            method="facial_recognition",
            result="blocked",
            failure_reason="Session is closed",
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="Session is not active")

    if current_staff.role == UserRole.PE_INSTRUCTOR:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_BLOCKED",
            description=f"Attendance scan blocked for PE Instructor '{current_staff.full_name}'",
            status="failure",
            method="facial_recognition",
            result="blocked",
            failure_reason="PE Instructors are not allowed to scan attendance",
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PE Instructors are not allowed to scan attendance",
        )

    await _enforce_coach_session_scope(
        db, current_staff, session,
        action="ATTENDANCE_ATTEMPT_BLOCKED",
        method="facial_recognition",
        scan_type=body.scan_type,
    )

    if current_staff.role == UserRole.STUDENT and current_staff.sport_or_art and session.sport_or_art:
        if current_staff.sport_or_art != session.sport_or_art:
            await _attendance_audit(
                db=db,
                action="ATTENDANCE_ATTEMPT_INELIGIBLE",
                description=(
                    f"Attendance blocked for {current_staff.full_name}: session '{session.name}' "
                    f"does not match assigned sport/art '{current_staff.sport_or_art}'"
                ),
                status="failure",
                method="facial_recognition",
                result="blocked",
                failure_reason="Session does not match assigned sport or art",
                student=current_staff,
                session=session,
                scan_type=body.scan_type,
                performer=current_staff,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This session does not match your assigned sport or art",
            )

    emb_result = await db.execute(
        select(FaceEmbedding).join(User).where(User.is_active == True, User.is_face_enrolled == True)
    )
    all_embeddings = emb_result.scalars().all()

    if not all_embeddings:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_FAILED",
            description="No enrolled students in system",
            status="warning",
            method="facial_recognition",
            result="failed",
            failure_reason="No enrolled students in system",
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        return FaceScanResponse(
            result=ScanResult.NO_FACE_DETECTED,
            processing_time_ms=int((time.monotonic() - start_time) * 1000),
            message="No enrolled students in system",
        )

    fr_config = FRConfigService(redis)
    sim_threshold = await fr_config.get_similarity_threshold()
    live_threshold = await fr_config.get_liveness_threshold()
    live_enabled = await fr_config.get_liveness_enabled()

    match_result = await fr_service.identify_face(
        image_bytes=image_bytes,
        stored_embeddings=[(emb.user_id, emb.embedding) for emb in all_embeddings],
        similarity_threshold=sim_threshold,
        liveness_threshold=live_threshold,
        liveness_enabled=live_enabled,
    )

    processing_ms = int((time.monotonic() - start_time) * 1000)
    kiosk_ip = request.client.host if request.client else "unknown"

    scan_attempt = ScanAttempt(
        scan_type=body.scan_type,
        result=match_result.result,
        matched_user_id=match_result.user_id,
        session_id=body.session_id,
        confidence_score=match_result.confidence,
        liveness_score=match_result.liveness_score,
        kiosk_ip=kiosk_ip,
        processing_time_ms=processing_ms,
        failure_reason=match_result.failure_reason,
    )
    db.add(scan_attempt)

    if match_result.result != ScanResult.SUCCESS:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_FAILED",
            description=(
                f"Facial recognition failed: "
                f"{match_result.failure_reason or match_result.result.value}"
            ),
            status="failure",
            method="facial_recognition",
            result="failed",
            failure_reason=match_result.failure_reason or match_result.result.value,
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )

        consec_key = f"fr_consec_fails:{kiosk_ip}"
        failure_count = await redis.incr(consec_key)
        await redis.expire(consec_key, _CONSEC_FAIL_WINDOW)

        if failure_count >= _CONSEC_FAIL_LIMIT:
            await audit_log(
                db=db,
                action="FR_CONSECUTIVE_FAILURES",
                module="Attendance",
                description=f"Facial recognition alert: {int(failure_count)} consecutive failures from kiosk {kiosk_ip}",
                resource_type="ScanAttempt",
                status="warning",
                details={
                    "kiosk_ip": kiosk_ip,
                    "failure_count": int(failure_count),
                    "last_result": match_result.result,
                    "session_name": session.name,
                },
                ip_address=kiosk_ip,
            )
            await redis.delete(consec_key)
            logger.warning(
                "fr_consecutive_failures_alert",
                kiosk_ip=kiosk_ip,
                count=failure_count,
            )

        await db.commit()
        return FaceScanResponse(
            result=match_result.result,
            confidence_score=match_result.confidence,
            liveness_score=match_result.liveness_score,
            processing_time_ms=processing_ms,
            message=match_result.failure_reason or "Recognition failed",
        )

    await redis.delete(f"fr_consec_fails:{kiosk_ip}")

    user_id = match_result.user_id
    matched_user = await db.get(User, user_id)

    if not matched_user or not matched_user.is_active:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_INACTIVE_ACCOUNT",
            description="Attendance attempt blocked: student account is inactive",
            status="failure",
            method="facial_recognition",
            result="blocked",
            failure_reason="Student account is inactive",
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        return FaceScanResponse(
            result=ScanResult.FAILED_RECOGNITION,
            processing_time_ms=processing_ms,
            message="Student account is inactive",
        )

    if matched_user.role != UserRole.STUDENT:
        await _attendance_audit(
            db=db,
            action="FACE_RECOGNIZED_STAFF",
            description=(
                f"Face recognized for {matched_user.full_name} "
                f"({matched_user.role.value}) during session '{session.name}' — "
                "no attendance record created"
            ),
            status="success",
            method="facial_recognition",
            result="recognized",
            student=matched_user,
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
            new_values={
                "matched_user_id": str(user_id),
                "role": matched_user.role.value,
                "confidence": round(match_result.confidence or 0, 4),
                "attendance_recorded": False,
            },
        )
        await db.commit()
        logger.info(
            "face_recognized_staff",
            user_id=str(user_id),
            role=matched_user.role.value,
            confidence=match_result.confidence,
            processing_ms=processing_ms,
        )
        return FaceScanResponse(
            result=ScanResult.SUCCESS,
            matched_user_id=user_id,
            matched_user_name=matched_user.full_name,
            matched_user_role=matched_user.role.value,
            confidence_score=match_result.confidence,
            liveness_score=match_result.liveness_score,
            processing_time_ms=processing_ms,
            message="Face Recognized",
        )

    if matched_user.sport_or_art and session.sport_or_art and matched_user.sport_or_art != session.sport_or_art:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_INELIGIBLE",
            description=(
                f"Attendance blocked for {matched_user.full_name}: session '{session.name}' "
                f"is '{session.sport_or_art}' but student is assigned to '{matched_user.sport_or_art}'"
            ),
            status="failure",
            method="facial_recognition",
            result="blocked",
            failure_reason="Student not assigned to this sport/art",
            student=matched_user,
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        return FaceScanResponse(
            result=ScanResult.FAILED_RECOGNITION,
            matched_user_id=user_id,
            matched_user_name=matched_user.full_name,
            confidence_score=match_result.confidence,
            liveness_score=match_result.liveness_score,
            processing_time_ms=processing_ms,
            message="You are not assigned to this Sport/Art",
        )

    active_sanction_result = await db.execute(
        select(Sanction)
        .where(
            Sanction.student_id == user_id,
            Sanction.status == SanctionStatus.ACTIVE,
            (Sanction.end_date.is_(None)) | (Sanction.end_date >= datetime.now(UTC).date()),
        )
        .order_by(Sanction.created_at.desc())
    )
    active_sanction = _check_active_sanction(active_sanction_result.scalars().all())
    if active_sanction:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_BLOCKED_SANCTION",
            description=(
                f"Attendance attempt blocked for {matched_user.full_name}: "
                f"active sanction ('{active_sanction.violation_type.value}')"
            ),
            status="failure",
            method="facial_recognition",
            result="blocked",
            failure_reason=f"Active sanction: {active_sanction.violation_type.value}",
            student=matched_user,
            session=session,
            scan_type=body.scan_type,
            performer=current_staff,
        )
        await db.commit()
        return FaceScanResponse(
            result=ScanResult.FAILED_RECOGNITION,
            matched_user_id=user_id,
            matched_user_name=matched_user.full_name,
            confidence_score=match_result.confidence,
            liveness_score=match_result.liveness_score,
            processing_time_ms=processing_ms,
            message="Attendance blocked: student has an active sanction",
        )

    att_result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == user_id,
            AttendanceRecord.session_id == body.session_id,
        )
    )
    record = att_result.scalar_one_or_none()

    if body.scan_type == AttendanceScanType.TIME_IN:
        if record:
            await _attendance_audit(
                db=db,
                action="ATTENDANCE_DUPLICATE_ATTEMPT",
                description=f"Duplicate time-in attempt for {matched_user.full_name} in session '{session.name}'",
                status="warning",
                method="facial_recognition",
                result="duplicate",
                failure_reason="Already timed in for this session",
                student=matched_user,
                session=session,
                attendance_record=record,
                scan_type=body.scan_type,
                performer=current_staff,
            )
            await db.commit()
            return FaceScanResponse(
                result=ScanResult.SUCCESS,
                matched_user_id=user_id,
                matched_user_name=matched_user.full_name,
                matched_user_role=matched_user.role.value,
                confidence_score=match_result.confidence,
                liveness_score=match_result.liveness_score,
                attendance_record_id=record.id,
                processing_time_ms=processing_ms,
                message="Already timed in for this session",
            )
        now = datetime.now(UTC)
        sess_start = session.scheduled_start if session.scheduled_start.tzinfo else session.scheduled_start.replace(tzinfo=UTC)
        sess_end = session.scheduled_end if session.scheduled_end.tzinfo else session.scheduled_end.replace(tzinfo=UTC)

        if now < sess_start:
            await _attendance_audit(
                db=db,
                action="ATTENDANCE_ATTEMPT_BEFORE_SESSION",
                description=(
                    f"Time-in attempt before session start for {matched_user.full_name} "
                    f"(session '{session.name}' starts {sess_start.isoformat()})"
                ),
                status="failure",
                method="facial_recognition",
                result="blocked",
                failure_reason="Attendance has not started yet",
                student=matched_user,
                session=session,
                scan_type=body.scan_type,
                performer=current_staff,
            )
            await db.commit()
            return FaceScanResponse(
                result=ScanResult.FAILED_RECOGNITION,
                matched_user_id=user_id,
                matched_user_name=matched_user.full_name,
                confidence_score=match_result.confidence,
                liveness_score=match_result.liveness_score,
                processing_time_ms=processing_ms,
                message="Attendance has not started yet",
            )

        if now >= sess_end:
            await _attendance_audit(
                db=db,
                action="ATTENDANCE_ATTEMPT_AFTER_SESSION_CLOSED",
                description=(
                    f"Time-in attempt after session end for {matched_user.full_name} "
                    f"(session '{session.name}' ended {sess_end.isoformat()})"
                ),
                status="failure",
                method="facial_recognition",
                result="blocked",
                failure_reason="Attendance period has ended",
                student=matched_user,
                session=session,
                scan_type=body.scan_type,
                performer=current_staff,
            )
            await db.commit()
            return FaceScanResponse(
                result=ScanResult.FAILED_RECOGNITION,
                matched_user_id=user_id,
                matched_user_name=matched_user.full_name,
                confidence_score=match_result.confidence,
                liveness_score=match_result.liveness_score,
                processing_time_ms=processing_ms,
                message="Attendance period has ended",
            )

        grace_deadline = sess_start + timedelta(minutes=session.grace_period_minutes)
        att_status = "present" if now <= grace_deadline else "late"
        record = AttendanceRecord(
            student_id=user_id,
            session_id=body.session_id,
            time_in=now,
            time_in_confidence=match_result.confidence,
            time_in_liveness_score=match_result.liveness_score,
            status=att_status,
            ip_address=_client_ip(request),
            device=_parse_device(request.headers.get("user-agent")),
        )
        db.add(record)

    elif body.scan_type == AttendanceScanType.TIME_OUT:
        if not record or not record.time_in:
            active_in_result = await db.execute(
                select(AttendanceRecord.student_id).where(
                    AttendanceRecord.session_id == body.session_id,
                    AttendanceRecord.time_in.isnot(None),
                    AttendanceRecord.time_out.is_(None),
                )
            )
            active_ids = active_in_result.scalars().all()
            if active_ids:
                emb_result2 = await db.execute(
                    select(FaceEmbedding).where(FaceEmbedding.user_id.in_(active_ids))
                )
                session_embs = emb_result2.scalars().all()
                if session_embs:
                    fb_result = await fr_service.identify_face(
                        image_bytes=image_bytes,
                        stored_embeddings=[(e.user_id, e.embedding) for e in session_embs],
                        similarity_threshold=sim_threshold,
                        liveness_threshold=live_threshold,
                        liveness_enabled=live_enabled,
                    )
                    if fb_result.result == ScanResult.SUCCESS:
                        fb_rec = await db.execute(
                            select(AttendanceRecord).where(
                                AttendanceRecord.student_id == fb_result.user_id,
                                AttendanceRecord.session_id == body.session_id,
                            )
                        )
                        record = fb_rec.scalar_one_or_none()
                        if record and record.time_in:
                            match_result = fb_result
                            user_id = fb_result.user_id
                            matched_user = await db.get(User, user_id)
            if not record or not record.time_in:
                await _attendance_audit(
                    db=db,
                    action="ATTENDANCE_RECORDING_FAILED",
                    description=f"Time-out attempted without a time-in record for {matched_user.full_name} in session '{session.name}'",
                    status="failure",
                    method="facial_recognition",
                    result="failed",
                    failure_reason="No time-in record found for this session",
                    student=matched_user,
                    session=session,
                    scan_type=body.scan_type,
                    performer=current_staff,
                )
                await db.commit()
                return FaceScanResponse(
                    result=ScanResult.FAILED_RECOGNITION,
                    processing_time_ms=processing_ms,
                    message="No time-in record found for this session",
                )
        now = datetime.now(UTC)
        record.time_out = now
        record.time_out_confidence = match_result.confidence
        record.time_out_liveness_score = match_result.liveness_score
        record.duration_minutes = int((now - record.time_in).total_seconds() / 60)
        record.is_complete = True

    await db.commit()
    await db.refresh(record)

    is_time_in = body.scan_type == AttendanceScanType.TIME_IN
    await _attendance_audit(
        db=db,
        action="ATTENDANCE_TIME_IN" if is_time_in else "ATTENDANCE_TIME_OUT",
        description=(
            f"{matched_user.full_name} checked {'in' if is_time_in else 'out'} "
            f"(facial recognition) for session '{session.name}' — {record.status}"
        ),
        status="success",
        method="facial_recognition",
        result="success",
        student=matched_user,
        session=session,
        attendance_record=record,
        scan_type=body.scan_type,
        performer=current_staff,
        resource_type="AttendanceRecord",
        resource_id=str(record.id),
        new_values={
            "time_in": str(record.time_in) if record.time_in else None,
            "time_out": str(record.time_out) if record.time_out else None,
            "status": record.status,
            "confidence": round(match_result.confidence or 0, 4),
        },
    )
    logger.info(
        "face_scan_success",
        user_id=str(user_id),
        scan_type=body.scan_type,
        confidence=match_result.confidence,
        processing_ms=processing_ms,
    )

    return FaceScanResponse(
        result=ScanResult.SUCCESS,
        matched_user_id=user_id,
        matched_user_name=matched_user.full_name if matched_user else None,
        matched_user_role=matched_user.role.value if matched_user else None,
        confidence_score=match_result.confidence,
        liveness_score=match_result.liveness_score,
        attendance_record_id=record.id,
        processing_time_ms=processing_ms,
        message=f"{'Time-in' if body.scan_type == AttendanceScanType.TIME_IN else 'Time-out'} recorded",
    )


@router.get(
    "/records",
    response_model=PaginatedResponse[AttendanceRecordRead],
    summary="Get attendance records",
)
async def get_attendance_records(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    session_id: uuid.UUID | None = Query(None),
    student_id: uuid.UUID | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[AttendanceRecordRead]:
    query = (
        select(AttendanceRecord, Session)
        .join(Session, AttendanceRecord.session_id == Session.id)
    )

    if current_user.role == UserRole.STUDENT:
        query = query.where(AttendanceRecord.student_id == current_user.id)
    elif student_id:
        query = query.where(AttendanceRecord.student_id == student_id)

    if current_user.role == UserRole.COACH and current_user.assigned_sport:
        query = query.where(Session.sport_or_art == current_user.assigned_sport)

    if session_id:
        query = query.where(AttendanceRecord.session_id == session_id)

    if date_from:
        query = query.where(AttendanceRecord.time_in >= date_from)
    if date_to:
        query = query.where(AttendanceRecord.time_in <= date_to)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(AttendanceRecord.time_in.desc())
    query = query.options(selectinload(AttendanceRecord.student))
    rows = (await db.execute(query)).all()

    items = []
    for r, s in rows:
        ar = AttendanceRecordRead.model_validate(r)
        if r.student:
            ar.student_name = r.student.full_name
            ar.student_number = r.student.student_id
        if s:
            ar.session_name = s.name
            ar.session_sport_or_art = s.sport_or_art
        items.append(ar)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


async def _load_manual_context(
    db: AsyncSession,
    session_id: uuid.UUID,
    student_id: uuid.UUID,
) -> tuple[Session, User]:
    sres = await db.execute(select(Session).where(Session.id == session_id))
    session = sres.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    ures = await db.execute(select(User).where(User.id == student_id))
    student = ures.scalar_one_or_none()
    if not student:
        raise NotFoundError("User", str(student_id))

    return session, student


@router.post(
    "/manual",
    response_model=AttendanceRecordRead,
    status_code=status.HTTP_201_CREATED,
    summary="Manually add an attendance record (Admin/Staff/Coach)",
)
async def add_manual_attendance(
    body: ManualAttendanceCreate,
    current_user: AdminOrCoach,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttendanceRecordRead:
    session, student = await _load_manual_context(db, body.session_id, body.student_id)

    await _enforce_coach_session_scope(
        db, current_user, session, action="MANUAL_ATTENDANCE_BLOCKED", method="manual"
    )

    dup = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == body.student_id,
            AttendanceRecord.session_id == body.session_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance record already exists for this student in this session",
        )

    if not body.time_in and not body.time_out and not body.status:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one of: time_in, time_out, or status",
        )

    now = datetime.now(UTC)
    record = AttendanceRecord(
        student_id=body.student_id,
        session_id=body.session_id,
        time_in=body.time_in or (now if body.status in ("present", "late") else None),
        time_out=body.time_out,
        status=body.status or ("present" if body.time_in else None),
        notes=body.notes,
        ip_address=_client_ip(request),
        device=_parse_device(request.headers.get("user-agent")),
    )
    if record.time_out and record.time_in:
        record.duration_minutes = int((record.time_out - record.time_in).total_seconds() / 60)
        record.is_complete = True

    db.add(record)
    await db.commit()
    await db.refresh(record)

    await _attendance_audit(
        db=db,
        action="MANUAL_ATTENDANCE_ADDED",
        description=(
            f"Manually added attendance for {student.full_name} in session '{session.name}'"
            f" ({record.status})"
        ),
        status="success",
        method="manual",
        result="success",
        student=student,
        session=session,
        attendance_record=record,
        performer=current_user,
        resource_type="AttendanceRecord",
        resource_id=str(record.id),
        new_values={
            "time_in": str(record.time_in) if record.time_in else None,
            "time_out": str(record.time_out) if record.time_out else None,
            "status": record.status,
        },
    )

    if record.time_in:
        await _attendance_audit(
            db=db,
            action="MANUAL_TIME_IN",
            description=f"Manual time-in recorded for {student.full_name} at {record.time_in.isoformat()}",
            status="success",
            method="manual",
            result="success",
            student=student,
            session=session,
            attendance_record=record,
            performer=current_user,
            resource_type="AttendanceRecord",
            resource_id=str(record.id),
        )
    if record.time_out:
        await _attendance_audit(
            db=db,
            action="MANUAL_TIME_OUT",
            description=f"Manual time-out recorded for {student.full_name} at {record.time_out.isoformat()}",
            status="success",
            method="manual",
            result="success",
            student=student,
            session=session,
            attendance_record=record,
            performer=current_user,
            resource_type="AttendanceRecord",
            resource_id=str(record.id),
        )
    await db.commit()

    return _record_to_read(record, session, student)


@router.patch(
    "/manual/{record_id}",
    response_model=AttendanceRecordRead,
    summary="Edit a manual attendance record (Admin/Staff/Coach)",
)
async def edit_manual_attendance(
    record_id: uuid.UUID,
    body: ManualAttendanceUpdate,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttendanceRecordRead:
    rres = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.id == record_id).options(selectinload(AttendanceRecord.student))
    )
    record = rres.scalar_one_or_none()
    if not record:
        raise NotFoundError("AttendanceRecord", str(record_id))

    sres = await db.execute(select(Session).where(Session.id == record.session_id))
    session = sres.scalar_one_or_none()

    if current_user.role == UserRole.COACH:
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This session is not in your assigned sport or art",
            )
        await _enforce_coach_session_scope(
            db, current_user, session, action="MANUAL_ATTENDANCE_BLOCKED", method="manual"
        )

    old_values = {
        "time_in": str(record.time_in) if record.time_in else None,
        "time_out": str(record.time_out) if record.time_out else None,
        "status": record.status,
        "notes": record.notes,
    }

    had_time_out = record.time_out is not None
    prev_status = record.status

    update_data = body.model_dump(exclude_unset=True)
    if "time_in" in update_data and update_data["time_in"]:
        record.time_in = update_data["time_in"]
        record.status = record.status or "present"
    if "time_out" in update_data and update_data["time_out"]:
        record.time_out = update_data["time_out"]
    if "status" in update_data and update_data["status"]:
        record.status = update_data["status"]
    if "notes" in update_data:
        record.notes = update_data["notes"]

    if record.time_in and record.time_out:
        record.duration_minutes = int((record.time_out - record.time_in).total_seconds() / 60)
        record.is_complete = True

    await db.commit()
    await db.refresh(record)

    await _attendance_audit(
        db=db,
        action="MANUAL_ATTENDANCE_EDITED",
        description=f"Edited attendance record for {record.student.full_name} in session '{session.name if session else ''}'",
        status="success",
        method="manual",
        result="success",
        student=record.student,
        session=session,
        attendance_record=record,
        performer=current_user,
        resource_type="AttendanceRecord",
        resource_id=str(record.id),
        previous_values=old_values,
        new_values={
            "time_in": str(record.time_in) if record.time_in else None,
            "time_out": str(record.time_out) if record.time_out else None,
            "status": record.status,
        },
    )

    if update_data.get("status") and prev_status != update_data["status"]:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_STATUS_CHANGED",
            description=f"Attendance status changed for {record.student.full_name}: {prev_status} → {record.status}",
            status="success",
            method="manual",
            result="success",
            student=record.student,
            session=session,
            attendance_record=record,
            performer=current_user,
            resource_type="AttendanceRecord",
            resource_id=str(record.id),
            previous_values={"status": prev_status},
            new_values={"status": record.status},
        )
    if update_data.get("time_out") and not had_time_out and record.time_out:
        await _attendance_audit(
            db=db,
            action="MANUAL_TIME_OUT",
            description=f"Manual time-out recorded for {record.student.full_name} at {record.time_out.isoformat()}",
            status="success",
            method="manual",
            result="success",
            student=record.student,
            session=session,
            attendance_record=record,
            performer=current_user,
            resource_type="AttendanceRecord",
            resource_id=str(record.id),
        )
    if update_data.get("time_in") and record.time_in:
        await _attendance_audit(
            db=db,
            action="MANUAL_TIME_IN",
            description=f"Manual time-in recorded for {record.student.full_name} at {record.time_in.isoformat()}",
            status="success",
            method="manual",
            result="success",
            student=record.student,
            session=session,
            attendance_record=record,
            performer=current_user,
            resource_type="AttendanceRecord",
            resource_id=str(record.id),
        )
    await db.commit()

    return _record_to_read(record, session, record.student)


@router.delete(
    "/manual/{record_id}",
    response_model=MessageResponse,
    summary="Delete a manual attendance record (Admin/Staff/Coach)",
)
async def delete_manual_attendance(
    record_id: uuid.UUID,
    current_user: AdminOrCoach,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    rres = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.id == record_id).options(selectinload(AttendanceRecord.student))
    )
    record = rres.scalar_one_or_none()
    if not record:
        raise NotFoundError("AttendanceRecord", str(record_id))

    sres = await db.execute(select(Session).where(Session.id == record.session_id))
    session = sres.scalar_one_or_none()

    if current_user.role == UserRole.COACH:
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This session is not in your assigned sport or art",
            )
        await _enforce_coach_session_scope(
            db, current_user, session, action="MANUAL_ATTENDANCE_BLOCKED", method="manual"
        )

    await _attendance_audit(
        db=db,
        action="MANUAL_ATTENDANCE_DELETED",
        description=f"Deleted attendance record for {record.student.full_name} in session '{session.name if session else ''}'",
        status="success",
        method="manual",
        result="success",
        student=record.student,
        session=session,
        attendance_record=record,
        performer=current_user,
        resource_type="AttendanceRecord",
        resource_id=str(record_id),
        previous_values={
            "time_in": str(record.time_in) if record.time_in else None,
            "time_out": str(record.time_out) if record.time_out else None,
            "status": record.status,
        },
    )
    await db.delete(record)
    await db.commit()

    return MessageResponse(message="Attendance record deleted")


def _record_to_read(record: AttendanceRecord, session: Session | None, student: User | None) -> AttendanceRecordRead:
    ar = AttendanceRecordRead.model_validate(record)
    if student:
        ar.student_name = student.full_name
        ar.student_number = student.student_id
    if session:
        ar.session_name = session.name
        ar.session_sport_or_art = session.sport_or_art
    return ar


def _parse_student_qr(qr_code: str) -> uuid.UUID | None:
    raw = qr_code.strip()
    if raw.upper().startswith("STU-"):
        raw = raw[4:].strip()
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


@router.post(
    "/qr/check-in",
    response_model=AttendanceRecordRead,
    status_code=status.HTTP_201_CREATED,
    summary="Student QR check-in to an active session",
)
async def qr_check_in(
    body: QrCheckInRequest,
    current_user: ScanStaff,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AttendanceRecordRead:
    student_id = _parse_student_qr(body.qr_code)
    if student_id is None:
        await _attendance_audit(
            db=db,
            action="QR_CODE_VALIDATION_FAILED",
            description=f"QR code validation failed: '{body.qr_code}' is not a valid student QR",
            status="failure",
            method="qr_code",
            result="failed",
            failure_reason="Invalid QR code format",
            performer=current_user,
            resource_type="Session",
            resource_id=str(body.session_id),
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid student QR code",
        )

    ures = await db.execute(select(User).where(User.id == student_id))
    student = ures.scalar_one_or_none()
    if not student:
        await _attendance_audit(
            db=db,
            action="QR_CODE_VALIDATION_FAILED",
            description=f"QR code validation failed: no student matches QR '{body.qr_code}'",
            status="failure",
            method="qr_code",
            result="failed",
            failure_reason="Student not found",
            performer=current_user,
            resource_type="Session",
            resource_id=str(body.session_id),
        )
        await db.commit()
        raise HTTPException(status_code=404, detail="Student not found")

    sres = await db.execute(select(Session).where(Session.id == body.session_id))
    session = sres.scalar_one_or_none()
    if not session:
        await _attendance_audit(
            db=db,
            action="INVALID_SESSION_QR",
            description=f"QR check-in failed: session '{body.session_id}' not found",
            status="failure",
            method="qr_code",
            result="failed",
            failure_reason="Session not found",
            student=student,
            performer=current_user,
            resource_type="Session",
            resource_id=str(body.session_id),
        )
        await db.commit()
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_AFTER_SESSION_CLOSED",
            description=f"QR check-in blocked for {student.full_name}: session '{session.name}' is closed",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason="Session is closed",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="Session is not active")

    await _enforce_coach_session_scope(
        db, current_user, session, action="ATTENDANCE_ATTEMPT_BLOCKED", method="qr_code"
    )

    if not student.is_active:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_INACTIVE_ACCOUNT",
            description=f"QR check-in blocked for {student.full_name}: account is inactive",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason="Student account is inactive",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=403, detail="Student account is inactive")

    if student.sport_or_art and session.sport_or_art and student.sport_or_art != session.sport_or_art:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_INELIGIBLE",
            description=f"QR check-in blocked for {student.full_name}: session '{session.name}' does not match sport/art '{student.sport_or_art}'",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason="Session does not match assigned sport or art",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=403, detail="This session does not match your assigned sport or art")

    active_sanction_result = await db.execute(
        select(Sanction)
        .where(
            Sanction.student_id == student.id,
            Sanction.status == SanctionStatus.ACTIVE,
            (Sanction.end_date.is_(None)) | (Sanction.end_date >= datetime.now(UTC).date()),
        )
        .order_by(Sanction.created_at.desc())
    )
    active_sanction = _check_active_sanction(active_sanction_result.scalars().all())
    if active_sanction:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_BLOCKED_SANCTION",
            description=f"QR check-in blocked for {student.full_name}: active sanction ('{active_sanction.violation_type.value}')",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason=f"Active sanction: {active_sanction.violation_type.value}",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=403, detail="Attendance blocked: student has an active sanction")

    dup = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == student.id,
            AttendanceRecord.session_id == session.id,
        )
    )
    existing = dup.scalar_one_or_none()
    if existing:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_DUPLICATE_ATTEMPT",
            description=f"Duplicate QR check-in attempt for {student.full_name} in session '{session.name}'",
            status="warning",
            method="qr_code",
            result="duplicate",
            failure_reason="Already checked in for this session",
            student=student,
            session=session,
            attendance_record=existing,
            performer=current_user,
        )
        await db.commit()
        return _record_to_read(existing, session, student)

    now = datetime.now(UTC)
    sess_start_qr = session.scheduled_start if session.scheduled_start.tzinfo else session.scheduled_start.replace(tzinfo=UTC)
    sess_end_qr = session.scheduled_end if session.scheduled_end.tzinfo else session.scheduled_end.replace(tzinfo=UTC)

    if now < sess_start_qr:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_BEFORE_SESSION",
            description=f"QR check-in before session start for {student.full_name}: session '{session.name}' starts {sess_start_qr.isoformat()}",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason="Attendance has not started yet",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="Attendance has not started yet")

    if now >= sess_end_qr:
        await _attendance_audit(
            db=db,
            action="ATTENDANCE_ATTEMPT_AFTER_SESSION_CLOSED",
            description=f"QR check-in after session end for {student.full_name}: session '{session.name}' ended {sess_end_qr.isoformat()}",
            status="failure",
            method="qr_code",
            result="blocked",
            failure_reason="Attendance period has ended",
            student=student,
            session=session,
            performer=current_user,
        )
        await db.commit()
        raise HTTPException(status_code=400, detail="Attendance period has ended")

    grace_deadline = sess_start_qr + timedelta(minutes=session.grace_period_minutes)
    att_status = "present" if now <= grace_deadline else "late"
    record = AttendanceRecord(
        student_id=student.id,
        session_id=session.id,
        time_in=now,
        status=att_status,
        notes=f"QR check-in by {current_user.full_name}",
        ip_address=_client_ip(request),
        device=_parse_device(request.headers.get("user-agent")),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    await _attendance_audit(
        db=db,
        action="ATTENDANCE_TIME_IN",
        description=f"{student.full_name} checked in (QR code) for session '{session.name}' — {record.status}",
        status="success",
        method="qr_code",
        result="success",
        student=student,
        session=session,
        attendance_record=record,
        performer=current_user,
        resource_type="AttendanceRecord",
        resource_id=str(record.id),
        new_values={
            "time_in": str(record.time_in) if record.time_in else None,
            "status": record.status,
        },
    )
    await db.commit()

    return _record_to_read(record, session, student)
