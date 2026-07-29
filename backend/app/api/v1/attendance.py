"""
Attendance endpoints: sessions, kiosk face-scan, facial enrollment, records.
"""
import base64
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.models.audit import AuditLog
from app.models.user import User, UserRole
from app.schemas.attendance import (
    AttendanceRecordRead,
    EnrollmentRequest,
    EnrollmentResponse,
    FaceScanRequest,
    FaceScanResponse,
    SessionCreate,
    SessionRead,
    SessionUpdate,
)
from app.schemas.common import MessageResponse, PaginatedResponse
from app.services.facial_recognition import FacialRecognitionService
from app.services.fr_config_service import FRConfigService

# Number of consecutive scan failures from one kiosk IP that triggers an admin alert
_CONSEC_FAIL_LIMIT = 3
# TTL for the consecutive-failure counter key (seconds)
_CONSEC_FAIL_WINDOW = 300

router = APIRouter()
logger = structlog.get_logger(__name__)


def _get_fr_service(request: Request) -> FacialRecognitionService:
    """Retrieve pre-warmed FR service from app state."""
    svc = getattr(request.app.state, "fr_service", None)
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Facial recognition service is not available. The model failed to load at startup.",
        )
    return svc


# ── Sessions ──────────────────────────────────────────────────────────────────

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
    session = Session(
        **body.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

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
    query = select(Session)
    # Coaches only see their assigned sport's sessions
    if current_user.role == UserRole.COACH and current_user.assigned_sport:
        query = query.where(Session.sport_or_art == current_user.assigned_sport)
    if sport_or_art:
        query = query.where(Session.sport_or_art == sport_or_art)
    if is_active is not None:
        query = query.where(Session.is_active == is_active)

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
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFoundError("Session", str(session_id))

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


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

    update_data = body.model_dump(exclude_unset=True)

    # Validate scheduled_end > scheduled_start if both are being set
    new_start = update_data.get("scheduled_start", session.scheduled_start)
    new_end = update_data.get("scheduled_end", session.scheduled_end)
    if new_end <= new_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_end must be after scheduled_start",
        )

    for field, value in update_data.items():
        setattr(session, field, value)

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

    session.is_active = False
    await db.commit()
    await db.refresh(session)

    count_result = await db.execute(
        select(func.count(AttendanceRecord.id)).where(AttendanceRecord.session_id == session.id)
    )
    sr = SessionRead.model_validate(session)
    sr.attendance_count = count_result.scalar_one()
    return sr


# ── Face Enrollment ───────────────────────────────────────────────────────────

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
    # Students can only enroll their own face — admins may enroll anyone
    if current_user.role == UserRole.STUDENT and current_user.id != body.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students can only enroll their own face.",
        )

    # Verify user exists and has given consent
    result = await db.execute(select(User).where(User.id == body.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("User", str(body.user_id))
    if not user.biometric_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student has not provided biometric consent (R.A. 10173)",
        )

    # Decode images
    images_bytes = []
    for img_b64 in body.images_base64:
        try:
            images_bytes.append(base64.b64decode(img_b64))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")

    # Generate embedding
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

    # Upsert embedding
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
    db.add(AuditLog(
        user_id=body.user_id,
        action="FACE_ENROLLED",
        resource_type="FaceEmbedding",
        resource_id=str(face_emb.id) if face_emb.id else None,
        status="success",
        details={"model": model_used, "images_count": len(images_bytes)},
    ))
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


# ── Kiosk Face Scan ────────────────────────────────────────────────────────────

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

    # Decode image
    try:
        image_bytes = base64.b64decode(body.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    # Verify session exists and is active
    session_result = await db.execute(
        select(Session).where(Session.id == body.session_id, Session.is_active == True)
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or not active")

    # Fetch all embeddings for comparison
    emb_result = await db.execute(
        select(FaceEmbedding).join(User).where(User.is_active == True, User.is_face_enrolled == True)
    )
    all_embeddings = emb_result.scalars().all()

    if not all_embeddings:
        return FaceScanResponse(
            result=ScanResult.NO_FACE_DETECTED,
            processing_time_ms=int((time.monotonic() - start_time) * 1000),
            message="No enrolled students in system",
        )

    # Resolve runtime FR thresholds from Redis (US-007: admin-configurable)
    fr_config = FRConfigService(redis)
    sim_threshold = await fr_config.get_similarity_threshold()
    live_threshold = await fr_config.get_liveness_threshold()
    live_enabled = await fr_config.get_liveness_enabled()

    # Run facial recognition with runtime thresholds
    match_result = await fr_service.identify_face(
        image_bytes=image_bytes,
        stored_embeddings=[(emb.user_id, emb.embedding) for emb in all_embeddings],
        similarity_threshold=sim_threshold,
        liveness_threshold=live_threshold,
        liveness_enabled=live_enabled,
    )

    processing_ms = int((time.monotonic() - start_time) * 1000)
    kiosk_ip = request.client.host if request.client else "unknown"

    # Log scan attempt
    scan_attempt = ScanAttempt(
        scan_type=body.scan_type,
        result=match_result.result,
        matched_user_id=match_result.user_id,
        confidence_score=match_result.confidence,
        liveness_score=match_result.liveness_score,
        kiosk_ip=kiosk_ip,
        processing_time_ms=processing_ms,
        failure_reason=match_result.failure_reason,
    )
    db.add(scan_attempt)

    if match_result.result != ScanResult.SUCCESS:
        # ── Consecutive-failure tracking (US-005 AC: alert on 3 failures) ───
        consec_key = f"fr_consec_fails:{kiosk_ip}"
        failure_count = await redis.incr(consec_key)
        await redis.expire(consec_key, _CONSEC_FAIL_WINDOW)

        if failure_count >= _CONSEC_FAIL_LIMIT:
            db.add(
                AuditLog(
                    action="FR_CONSECUTIVE_FAILURES",
                    resource_type="ScanAttempt",
                    ip_address=kiosk_ip,
                    status="warning",
                    details={
                        "kiosk_ip": kiosk_ip,
                        "failure_count": int(failure_count),
                        "last_result": match_result.result,
                    },
                )
            )
            await redis.delete(consec_key)  # reset so next N failures trigger a fresh alert
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

    # Update attendance record
    user_id = match_result.user_id
    att_result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == user_id,
            AttendanceRecord.session_id == body.session_id,
        )
    )
    record = att_result.scalar_one_or_none()

    if body.scan_type == AttendanceScanType.TIME_IN:
        if record:
            # Already timed in — idempotent response
            matched_user = await db.get(User, user_id)
            return FaceScanResponse(
                result=ScanResult.SUCCESS,
                matched_user_id=user_id,
                matched_user_name=matched_user.full_name if matched_user else None,
                confidence_score=match_result.confidence,
                liveness_score=match_result.liveness_score,
                attendance_record_id=record.id,
                processing_time_ms=processing_ms,
                message="Already timed in for this session",
            )
        now = datetime.now(UTC)
        grace_deadline = session.scheduled_start + timedelta(minutes=session.grace_period_minutes)
        att_status = "present" if now <= grace_deadline else "late"
        record = AttendanceRecord(
            student_id=user_id,
            session_id=body.session_id,
            time_in=now,
            time_in_confidence=match_result.confidence,
            time_in_liveness_score=match_result.liveness_score,
            status=att_status,
        )
        db.add(record)

    elif body.scan_type == AttendanceScanType.TIME_OUT:
        if not record or not record.time_in:
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

    # Reset consecutive-failure counter on success
    await redis.delete(f"fr_consec_fails:{kiosk_ip}")

    await db.commit()
    await db.refresh(record)

    matched_user = await db.get(User, user_id)
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
        confidence_score=match_result.confidence,
        liveness_score=match_result.liveness_score,
        attendance_record_id=record.id,
        processing_time_ms=processing_ms,
        message=f"{'Time-in' if body.scan_type == AttendanceScanType.TIME_IN else 'Time-out'} recorded",
    )


# ── Attendance Records ─────────────────────────────────────────────────────────

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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PaginatedResponse[AttendanceRecordRead]:
    query = select(AttendanceRecord)

    # Students only see their own records
    if current_user.role == UserRole.STUDENT:
        query = query.where(AttendanceRecord.student_id == current_user.id)
    elif student_id:
        query = query.where(AttendanceRecord.student_id == student_id)

    if session_id:
        query = query.where(AttendanceRecord.session_id == session_id)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(AttendanceRecord.time_in.desc())
    records = (await db.execute(query)).scalars().all()

    items = []
    for r in records:
        ar = AttendanceRecordRead.model_validate(r)
        student = await db.get(User, r.student_id)
        if student:
            ar.student_name = student.full_name
            ar.student_number = student.student_id
        items.append(ar)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)
