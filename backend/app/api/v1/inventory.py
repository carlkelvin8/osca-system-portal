"""
Inventory endpoints: equipment CRUD, borrowing IDs, borrow/return workflow,
equipment request/approval flow, and staff-assisted borrow with QR workflow.
"""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import AdminOnly, CurrentUser, get_db
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models.audit import AuditLog
from app.models.eligibility import AthleteEligibility
from app.models.inventory import (
    BorrowingID,
    BorrowTransaction,
    BorrowTransactionItem,
    Equipment,
    EquipmentCategory,
    EquipmentRequest,
    EquipmentRequestItem,
    RequestStatus,
    TransactionStatus,
)
from app.models.sanction import Sanction
from app.models.user import User, UserRole
from app.schemas.common import MessageResponse, PaginatedResponse
from app.schemas.inventory import (
    ApproveRequestBody,
    BorrowingIDRead,
    BorrowItemRequest,
    BorrowTransactionCreate,
    BorrowTransactionItemRead,
    BorrowTransactionRead,
    EquipmentCreate,
    EquipmentRead,
    EquipmentRequestCreate,
    EquipmentRequestItemRead,
    EquipmentRequestRead,
    EquipmentUpdate,
    RejectRequestBody,
    REQUEST_QR_EXPIRY_MINUTES,
    RequesterActiveBorrow,
    ReturnRequest,
    ScanBorrowingIDResponse,
    StaffBorrowCreateRequest,
    TransactionQRRead,
    TransactionReleaseRequest,
    _compute_return_qr_status,
)
from app.services.barcode_service import BarcodeService
from app.services.storage_service import StorageService

router = APIRouter()
logger = structlog.get_logger(__name__)

# Roles allowed to submit equipment requests
_REQUEST_ROLES = {UserRole.COACH, UserRole.PE_INSTRUCTOR}
# Roles allowed to approve/reject
_APPROVAL_ROLES = {UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF}


# ── Equipment ─────────────────────────────────────────────────────────────────

@router.post(
    "/equipment",
    response_model=EquipmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register new equipment (Admin)",
)
async def create_equipment(
    body: EquipmentCreate,
    current_user: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRead:
    qr_value = f"EQ-{uuid.uuid4().hex[:12].upper()}"

    equipment = Equipment(
        **body.model_dump(),
        qr_code=qr_value,
        qr_image_key=None,
        available_quantity=body.total_quantity,
        created_by_id=current_user.id,
    )
    db.add(equipment)
    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_CREATED",
        resource_type="Equipment",
        status="success",
        details={"qr_code": qr_value, "name": body.name},
    ))
    await db.commit()
    await db.refresh(equipment)
    return EquipmentRead.model_validate(equipment)


@router.get("/equipment", response_model=PaginatedResponse[EquipmentRead], summary="List equipment")
async def list_equipment(
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: EquipmentCategory | None = Query(None),
    sport_or_art: str | None = Query(None),
    available_only: bool = Query(False),
    search: str | None = Query(None),
) -> PaginatedResponse[EquipmentRead]:
    query = select(Equipment).where(Equipment.is_active == True)
    if category:
        query = query.where(Equipment.category == category)
    if sport_or_art:
        query = query.where(Equipment.sport_or_art == sport_or_art)
    if available_only:
        query = query.where(Equipment.available_quantity > 0)
    if search:
        like = f"%{search}%"
        query = query.where(Equipment.name.ilike(like) | Equipment.qr_code.ilike(like))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Equipment.name)
    equipment = (await db.execute(query)).scalars().all()

    return PaginatedResponse(
        items=[EquipmentRead.model_validate(e) for e in equipment],
        total=total, page=page, page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/equipment/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: uuid.UUID,
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRead:
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    eq = result.scalar_one_or_none()
    if not eq:
        raise NotFoundError("Equipment", str(equipment_id))
    return EquipmentRead.model_validate(eq)


@router.get("/equipment/qr/{qr_code}", response_model=EquipmentRead, summary="Lookup by QR code scan")
async def get_equipment_by_qr(
    qr_code: str,
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRead:
    result = await db.execute(select(Equipment).where(Equipment.qr_code == qr_code))
    eq = result.scalar_one_or_none()
    if not eq:
        raise NotFoundError("Equipment", qr_code)
    return EquipmentRead.model_validate(eq)


@router.patch("/equipment/{equipment_id}", response_model=EquipmentRead, summary="Update equipment (Admin)")
async def update_equipment(
    equipment_id: uuid.UUID,
    body: EquipmentUpdate,
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRead:
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    eq = result.scalar_one_or_none()
    if not eq:
        raise NotFoundError("Equipment", str(equipment_id))

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(eq, field, value)

    await db.commit()
    await db.refresh(eq)
    return EquipmentRead.model_validate(eq)


# ── Borrowing ID ──────────────────────────────────────────────────────────────

@router.get(
    "/borrowing-ids/me",
    response_model=BorrowingIDRead,
    summary="Get the current user's own Borrowing ID card",
)
async def get_my_borrowing_id(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowingIDRead:
    result = await db.execute(
        select(BorrowingID).where(BorrowingID.instructor_id == current_user.id)
    )
    bid = result.scalar_one_or_none()
    if not bid:
        if current_user.role not in (UserRole.COACH, UserRole.PE_INSTRUCTOR):
            raise NotFoundError("Borrowing ID", str(current_user.id))
        qr_value = BarcodeService.generate_qr_value(str(current_user.id))
        qr_img_bytes = BarcodeService.render_qr(qr_value)
        storage = StorageService()
        qr_key = await storage.upload_qr_image(qr_value, qr_img_bytes)
        bid = BorrowingID(
            instructor_id=current_user.id,
            qr_code=qr_value,
            qr_image_key=qr_key,
        )
        db.add(bid)
        await db.commit()
        await db.refresh(bid)
    schema = BorrowingIDRead.model_validate(bid)
    schema.instructor_name = current_user.full_name
    return schema


@router.post(
    "/borrowing-ids/{instructor_id}",
    response_model=BorrowingIDRead,
    status_code=status.HTTP_201_CREATED,
    summary="Issue a Borrowing ID card to a PE Instructor (Admin)",
)
async def issue_borrowing_id(
    instructor_id: uuid.UUID,
    _admin: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowingIDRead:
    result = await db.execute(select(User).where(User.id == instructor_id))
    instructor = result.scalar_one_or_none()
    if not instructor:
        raise NotFoundError("User", str(instructor_id))
    if instructor.role != UserRole.PE_INSTRUCTOR:
        raise ConflictError("Borrowing IDs are only issued to PE Instructors")

    existing = await db.execute(select(BorrowingID).where(BorrowingID.instructor_id == instructor_id))
    if existing.scalar_one_or_none():
        raise ConflictError("Instructor already has a Borrowing ID")

    qr_value = BarcodeService.generate_qr_value(str(instructor_id))
    qr_img_bytes = BarcodeService.render_qr(qr_value)

    storage = StorageService()
    qr_key = await storage.upload_qr_image(qr_value, qr_img_bytes)

    bid = BorrowingID(
        instructor_id=instructor_id,
        qr_code=qr_value,
        qr_image_key=qr_key,
    )
    db.add(bid)
    await db.commit()
    await db.refresh(bid)

    result_schema = BorrowingIDRead.model_validate(bid)
    result_schema.instructor_name = instructor.full_name
    return result_schema


# ── Equipment Request / Approval ───────────────────────────────────────────────

@router.post(
    "/requests",
    response_model=EquipmentRequestRead,
    status_code=status.HTTP_201_CREATED,
    summary="Submit equipment request (Coach / PE Instructor)",
)
async def create_equipment_request(
    body: EquipmentRequestCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    if current_user.role not in _REQUEST_ROLES:
        raise ForbiddenError("Only coaches and PE instructors may submit equipment requests.")

    req = EquipmentRequest(
        requester_id=current_user.id,
        expected_return=body.expected_return,
        notes=body.notes,
    )
    db.add(req)

    for item_req in body.items:
        eq = await db.get(Equipment, item_req.equipment_id)
        if not eq or not eq.is_active:
            raise NotFoundError("Equipment", str(item_req.equipment_id))
        db.add(EquipmentRequestItem(
            request=req,
            equipment_id=item_req.equipment_id,
            quantity=item_req.quantity,
        ))

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_REQUEST_CREATED",
        resource_type="EquipmentRequest",
        status="success",
        details={"items_count": len(body.items)},
    ))

    await db.flush()
    req.return_qr_code = f"TXN-{req.id.hex[:12].upper()}"
    await db.commit()
    await db.refresh(req)
    return await _build_request_read(req, db)


@router.get(
    "/requests",
    response_model=PaginatedResponse[EquipmentRequestRead],
    summary="List equipment requests",
)
async def list_equipment_requests(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: RequestStatus | None = Query(None, alias="status"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> PaginatedResponse[EquipmentRequestRead]:
    query = select(EquipmentRequest)
    # Coaches / instructors see only their own
    if current_user.role in _REQUEST_ROLES:
        query = query.where(EquipmentRequest.requester_id == current_user.id)
    if status_filter:
        query = query.where(EquipmentRequest.status == status_filter)
    if date_from:
        df = date_from
        if df.tzinfo is None:
            df = df.replace(tzinfo=UTC)
        query = query.where(EquipmentRequest.requested_at >= df)
    if date_to:
        dt = date_to
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        query = query.where(EquipmentRequest.requested_at <= dt)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(
        EquipmentRequest.requested_at.desc()
    )
    requests = (await db.execute(query)).scalars().all()
    items = [await _build_request_read(r, db) for r in requests]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


@router.get(
    "/requests/qr/{qr_value}",
    response_model=EquipmentRequestRead,
    summary="Look up equipment request by QR code value",
)
async def get_request_by_qr(
    qr_value: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    if not qr_value.startswith("REQ-"):
        raise NotFoundError("EquipmentRequest", qr_value)
    try:
        request_id = uuid.UUID(qr_value[4:])
    except ValueError:
        raise NotFoundError("EquipmentRequest", qr_value)
    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", qr_value)
    return await _build_request_read(req, db)


@router.get(
    "/requests/by-equipment/{equipment_id}",
    response_model=list[EquipmentRequestRead],
    summary="Get requests containing a specific equipment item",
)
async def get_requests_by_equipment(
    equipment_id: uuid.UUID,
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EquipmentRequestRead]:
    result = await db.execute(
        select(EquipmentRequestItem).where(EquipmentRequestItem.equipment_id == equipment_id)
    )
    items = result.scalars().all()

    request_ids = list({item.request_id for item in items})
    if not request_ids:
        return []

    requests_result = await db.execute(
        select(EquipmentRequest).where(EquipmentRequest.id.in_(request_ids))
    )
    requests = requests_result.scalars().all()
    return [await _build_request_read(r, db) for r in requests]


@router.get(
    "/requests/{request_id}",
    response_model=EquipmentRequestRead,
    summary="Get single equipment request",
)
async def get_equipment_request(
    request_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if current_user.role in _REQUEST_ROLES and req.requester_id != current_user.id:
        raise ForbiddenError("You may only view your own requests.")
    return await _build_request_read(req, db)


@router.get(
    "/requests/{request_id}/qr",
    summary="Get QR code image for an equipment request",
    responses={200: {"content": {"image/png": {}}}},
)
async def get_request_qr_code(
    request_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if current_user.role in _REQUEST_ROLES and req.requester_id != current_user.id:
        raise ForbiddenError("You may only view your own requests.")
    qr_value = f"REQ-{req.id}"
    qr_bytes = BarcodeService.render_qr(qr_value, box_size=8, border=2)
    return Response(content=qr_bytes, media_type="image/png")


@router.put(
    "/requests/{request_id}/approve",
    response_model=EquipmentRequestRead,
    summary="Approve equipment request (Admin / Director)",
)
async def approve_equipment_request(
    request_id: uuid.UUID,
    body: ApproveRequestBody,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    if current_user.role not in _APPROVAL_ROLES:
        raise ForbiddenError("Only admin, director, and staff may approve requests.")

    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if req.status != RequestStatus.PENDING:
        raise ConflictError(f"Request is already {req.status.value}.")

    now = datetime.now(UTC)

    if body.create_transaction:
        # Validate stock for each item
        items_result = await db.execute(
            select(EquipmentRequestItem).where(EquipmentRequestItem.request_id == req.id)
        )
        req_items = items_result.scalars().all()
        for ri in req_items:
            eq = await db.get(Equipment, ri.equipment_id)
            if not eq or not eq.is_active:
                raise NotFoundError("Equipment", str(ri.equipment_id))
            if eq.available_quantity < ri.quantity:
                raise ConflictError(f"Insufficient stock for {eq.name}. Available: {eq.available_quantity}")

        # Deduct stock and create BorrowTransaction
        requester = await db.get(User, req.requester_id)
        bid_result = await db.execute(
            select(BorrowingID).where(
                BorrowingID.instructor_id == req.requester_id,
                BorrowingID.is_active == True,
            )
        )
        bid = bid_result.scalar_one_or_none()
        if not bid:
            qr_value = BarcodeService.generate_qr_value(str(req.requester_id))
            qr_img_bytes = BarcodeService.render_qr(qr_value)
            storage = StorageService()
            qr_key = await storage.upload_qr_image(qr_value, qr_img_bytes)
            bid = BorrowingID(
                instructor_id=req.requester_id,
                qr_code=qr_value,
                qr_image_key=qr_key,
            )
            db.add(bid)
            await db.flush()

        transaction = BorrowTransaction(
            borrowing_id_record_id=bid.id,
            instructor_id=req.requester_id,
            expected_return=req.expected_return,
            notes=body.notes or req.notes,
            processed_by_id=current_user.id,
        )
        db.add(transaction)

        for ri in req_items:
            eq = await db.get(Equipment, ri.equipment_id)
            eq.available_quantity -= ri.quantity
            db.add(BorrowTransactionItem(
                transaction=transaction,
                equipment_id=ri.equipment_id,
                quantity=ri.quantity,
            ))

        # Generate Return QR Code (reuse the code generated at request time)
        await db.flush()
        transaction.transaction_qr_code = req.return_qr_code or f"TXN-{transaction.id.hex[:12].upper()}"

        action = "EQUIPMENT_REQUEST_APPROVED"
    else:
        action = "EQUIPMENT_REQUEST_APPROVED"

    req.status = RequestStatus.APPROVED
    req.approved_by_id = current_user.id
    req.approved_at = now

    db.add(AuditLog(
        user_id=current_user.id,
        action=action,
        resource_type="EquipmentRequest",
        resource_id=str(req.id),
        status="success",
        details={"requester_id": str(req.requester_id)},
    ))
    await db.commit()
    await db.refresh(req)
    return await _build_request_read(req, db)


@router.put(
    "/requests/{request_id}/release",
    response_model=BorrowTransactionRead,
    summary="(Staff) Release equipment from a pending request — generates Return QR Code",
)
async def release_equipment_request(
    request_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:
    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff may release equipment.")

    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if req.status != RequestStatus.PENDING:
        raise ConflictError(f"Request is already {req.status.value}.")

    # Validate stock for each item
    items_result = await db.execute(
        select(EquipmentRequestItem).where(EquipmentRequestItem.request_id == req.id)
    )
    req_items = items_result.scalars().all()
    for ri in req_items:
        eq = await db.get(Equipment, ri.equipment_id)
        if not eq or not eq.is_active:
            raise NotFoundError("Equipment", str(ri.equipment_id))
        if eq.available_quantity < ri.quantity:
            raise ConflictError(f"Insufficient stock for {eq.name}. Available: {eq.available_quantity}")

    # Ensure BorrowingID exists
    bid_result = await db.execute(
        select(BorrowingID).where(
            BorrowingID.instructor_id == req.requester_id,
            BorrowingID.is_active == True,
        )
    )
    bid = bid_result.scalar_one_or_none()
    if not bid:
        qr_value = BarcodeService.generate_qr_value(str(req.requester_id))
        qr_img_bytes = BarcodeService.render_qr(qr_value)
        storage = StorageService()
        qr_key = await storage.upload_qr_image(qr_value, qr_img_bytes)
        bid = BorrowingID(
            instructor_id=req.requester_id,
            qr_code=qr_value,
            qr_image_key=qr_key,
        )
        db.add(bid)
        await db.flush()

    # Create transaction
    transaction = BorrowTransaction(
        borrowing_id_record_id=bid.id,
        instructor_id=req.requester_id,
        expected_return=req.expected_return,
        notes=req.notes,
        processed_by_id=current_user.id,
    )
    db.add(transaction)

    for ri in req_items:
        eq = await db.get(Equipment, ri.equipment_id)
        eq.available_quantity -= ri.quantity
        db.add(BorrowTransactionItem(
            transaction=transaction,
            equipment_id=ri.equipment_id,
            quantity=ri.quantity,
        ))

    # Generate Return QR Code (reuse the code generated at request time)
    await db.flush()
    transaction.transaction_qr_code = req.return_qr_code or f"TXN-{transaction.id.hex[:12].upper()}"

    now = datetime.now(UTC)
    req.status = RequestStatus.APPROVED
    req.approved_by_id = current_user.id
    req.approved_at = now

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_REQUEST_RELEASED",
        resource_type="EquipmentRequest",
        resource_id=str(req.id),
        status="success",
        details={"requester_id": str(req.requester_id)},
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


@router.put(
    "/requests/{request_id}/reject",
    response_model=EquipmentRequestRead,
    summary="Reject equipment request (Admin / Director)",
)
async def reject_equipment_request(
    request_id: uuid.UUID,
    body: RejectRequestBody,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    if current_user.role not in _APPROVAL_ROLES:
        raise ForbiddenError("Only admin, director, and staff may reject requests.")

    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if req.status != RequestStatus.PENDING:
        raise ConflictError(f"Request is already {req.status.value}.")

    req.status = RequestStatus.REJECTED
    req.approved_by_id = current_user.id
    req.approved_at = datetime.now(UTC)
    req.rejection_reason = body.rejection_reason

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_REQUEST_REJECTED",
        resource_type="EquipmentRequest",
        resource_id=str(req.id),
        status="success",
        details={"rejection_reason": body.rejection_reason},
    ))
    await db.commit()
    await db.refresh(req)
    return await _build_request_read(req, db)


@router.put(
    "/requests/{request_id}/cancel",
    response_model=EquipmentRequestRead,
    summary="Cancel own pending equipment request (Coach / PE Instructor)",
)
async def cancel_equipment_request(
    request_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EquipmentRequestRead:
    if current_user.role not in _REQUEST_ROLES:
        raise ForbiddenError("Only coaches and PE instructors may cancel requests.")

    req = await db.get(EquipmentRequest, request_id)
    if not req:
        raise NotFoundError("EquipmentRequest", str(request_id))
    if req.requester_id != current_user.id:
        raise ForbiddenError("You may only cancel your own requests.")
    if req.status != RequestStatus.PENDING:
        raise ConflictError(f"Cannot cancel a request that is already {req.status.value}.")

    req.status = RequestStatus.CANCELLED
    req.approved_at = datetime.now(UTC)

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_REQUEST_CANCELLED",
        resource_type="EquipmentRequest",
        resource_id=str(req.id),
        status="success",
    ))
    await db.commit()
    await db.refresh(req)
    return await _build_request_read(req, db)


# ── Admin Direct Borrow (bypasses request flow) ────────────────────────────────

@router.post(
    "/borrow",
    response_model=BorrowTransactionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Direct borrow — Admin override (bypasses request flow)",
)
async def borrow_equipment(
    body: BorrowTransactionCreate,
    current_user: AdminOnly,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:
    bid_result = await db.execute(
        select(BorrowingID).where(BorrowingID.qr_code == body.borrowing_id_qr, BorrowingID.is_active == True)
    )
    bid = bid_result.scalar_one_or_none()
    if not bid:
        raise NotFoundError("Borrowing ID", body.borrowing_id_qr)

    overdue_check = await db.execute(
        select(BorrowTransaction).where(
            BorrowTransaction.instructor_id == bid.instructor_id,
            BorrowTransaction.status.in_([TransactionStatus.ACTIVE, TransactionStatus.OVERDUE]),
        )
    )
    if overdue_check.scalar_one_or_none():
        raise ConflictError("Instructor has an active or overdue borrow transaction. Return items first.")

    transaction = BorrowTransaction(
        borrowing_id_record_id=bid.id,
        instructor_id=bid.instructor_id,
        expected_return=body.expected_return,
        notes=body.notes,
        processed_by_id=current_user.id,
    )
    db.add(transaction)

    for item_req in body.items:
        eq_result = await db.execute(
            select(Equipment).where(Equipment.qr_code == item_req.equipment_qr, Equipment.is_active == True)
        )
        eq = eq_result.scalar_one_or_none()
        if not eq:
            raise NotFoundError("Equipment QR", item_req.equipment_qr)
        if eq.available_quantity < item_req.quantity:
            raise ConflictError(f"Insufficient quantity for {eq.name}. Available: {eq.available_quantity}")

        eq.available_quantity -= item_req.quantity
        tx_item = BorrowTransactionItem(
            transaction=transaction,
            equipment_id=eq.id,
            quantity=item_req.quantity,
        )
        db.add(tx_item)

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_BORROWED",
        resource_type="BorrowTransaction",
        status="success",
        details={"instructor_id": str(bid.instructor_id), "items_count": len(body.items)},
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


@router.post(
    "/return",
    response_model=BorrowTransactionRead,
    summary="Return borrowed equipment (PE Instructor)",
)
async def return_equipment(
    body: ReturnRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:
    bid_result = await db.execute(
        select(BorrowingID).where(BorrowingID.qr_code == body.borrowing_id_qr)
    )
    bid = bid_result.scalar_one_or_none()
    if not bid:
        raise NotFoundError("Borrowing ID", body.borrowing_id_qr)

    tx_result = await db.execute(
        select(BorrowTransaction).where(
            BorrowTransaction.borrowing_id_record_id == bid.id,
            BorrowTransaction.status.in_([TransactionStatus.ACTIVE, TransactionStatus.OVERDUE]),
        )
    )
    transaction = tx_result.scalar_one_or_none()
    if not transaction:
        raise NotFoundError("Active transaction for this Borrowing ID")

    now = datetime.now(UTC)

    for item_req in body.items:
        eq_result = await db.execute(
            select(Equipment).where(Equipment.qr_code == item_req.equipment_qr)
        )
        eq = eq_result.scalar_one_or_none()
        if not eq:
            raise NotFoundError("Equipment QR", item_req.equipment_qr)

        tx_item_result = await db.execute(
            select(BorrowTransactionItem).where(
                BorrowTransactionItem.transaction_id == transaction.id,
                BorrowTransactionItem.equipment_id == eq.id,
                BorrowTransactionItem.is_returned == False,
            )
        )
        tx_item = tx_item_result.scalar_one_or_none()
        if not tx_item:
            raise NotFoundError("Transaction item", item_req.equipment_qr)

        tx_item.is_returned = True
        tx_item.returned_at = now
        eq.available_quantity += tx_item.quantity

    pending_result = await db.execute(
        select(func.count(BorrowTransactionItem.id)).where(
            BorrowTransactionItem.transaction_id == transaction.id,
            BorrowTransactionItem.is_returned == False,
        )
    )
    pending_count = pending_result.scalar_one()
    transaction.status = (
        TransactionStatus.RETURNED if pending_count == 0 else TransactionStatus.PARTIAL_RETURN
    )
    if pending_count == 0:
        transaction.returned_at = now

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_RETURNED",
        resource_type="BorrowTransaction",
        resource_id=str(transaction.id),
        status="success",
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


@router.get("/transactions", response_model=PaginatedResponse[BorrowTransactionRead])
async def list_transactions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: TransactionStatus | None = Query(None, alias="status"),
) -> PaginatedResponse[BorrowTransactionRead]:
    query = select(BorrowTransaction)
    if current_user.role == UserRole.PE_INSTRUCTOR:
        query = query.where(BorrowTransaction.instructor_id == current_user.id)
    if status_filter:
        query = query.where(BorrowTransaction.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    query = query.offset((page - 1) * page_size).limit(page_size).order_by(BorrowTransaction.borrowed_at.desc())
    transactions = (await db.execute(query)).scalars().all()

    items = [await _build_transaction_read(tx, db) for tx in transactions]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size,
                             pages=(total + page_size - 1) // page_size)


# ── Staff Borrow Workflow ─────────────────────────────────────────────────────

_STAFF_BORROW_ROLES = {UserRole.ADMIN, UserRole.DIRECTOR, UserRole.STAFF}


@router.get(
    "/borrowing-ids/scan/{qr_code}",
    summary="(Staff) Scan a BorrowingID QR to view coach/instructor info",
)
async def scan_borrowing_id(
    qr_code: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff can scan borrowing IDs.")

    bid_result = await db.execute(
        select(BorrowingID).where(BorrowingID.qr_code == qr_code, BorrowingID.is_active == True)
    )
    bid = bid_result.scalar_one_or_none()
    if not bid:
        raise NotFoundError("Borrowing ID", qr_code)

    instructor = await db.get(User, bid.instructor_id)
    if not instructor:
        raise NotFoundError("User", str(bid.instructor_id))

    # Eligibility
    eligibility_result = await db.execute(
        select(AthleteEligibility).where(
            AthleteEligibility.student_id == instructor.id,
            AthleteEligibility.is_current == True,
        )
    )
    eligibility = eligibility_result.scalar_one_or_none()

    # Current active borrows
    borrows_result = await db.execute(
        select(BorrowTransaction).where(
            BorrowTransaction.instructor_id == instructor.id,
            BorrowTransaction.status.in_([TransactionStatus.ACTIVE, TransactionStatus.OVERDUE]),
        ).order_by(BorrowTransaction.borrowed_at.desc())
    )
    active_borrows = borrows_result.scalars().all()
    borrow_list = []
    for b in active_borrows:
        tx_items = (await db.execute(
            select(BorrowTransactionItem)
            .where(BorrowTransactionItem.transaction_id == b.id)
        )).scalars().all()
        items_data = []
        for txi in tx_items:
            eq = await db.get(Equipment, txi.equipment_id)
            items_data.append({
                "equipment_name": eq.name if eq else "Unknown",
                "quantity": txi.quantity,
            })
        borrow_list.append({
            "id": str(b.id),
            "transaction_qr_code": b.transaction_qr_code,
            "status": b.status.value,
            "borrowed_at": b.borrowed_at.isoformat(),
            "expected_return": b.expected_return.isoformat(),
            "items": items_data,
        })

    # Pending requests
    pending_reqs_result = await db.execute(
        select(EquipmentRequest).where(
            EquipmentRequest.requester_id == instructor.id,
            EquipmentRequest.status == RequestStatus.PENDING,
        ).order_by(EquipmentRequest.requested_at.desc())
    )
    pending_reqs = [await _build_request_read(r, db) for r in pending_reqs_result.scalars().all()]

    # Active sanctions
    sanctions_result = await db.execute(
        select(Sanction).where(
            Sanction.student_id == instructor.id,
            Sanction.status.in_(["active", "served"]),
        )
    )
    sanctions = [
        {
            "violation_type": s.violation_type.value if hasattr(s.violation_type, 'value') else str(s.violation_type),
            "severity": s.severity.value if hasattr(s.severity, 'value') else str(s.severity),
            "status": s.status.value if hasattr(s.status, 'value') else str(s.status),
            "description": s.description or "",
            "start_date": s.start_date.isoformat() if s.start_date else None,
            "end_date": s.end_date.isoformat() if s.end_date else None,
        }
        for s in sanctions_result.scalars().all()
    ]

    return {
        "user_id": str(instructor.id),
        "full_name": instructor.full_name,
        "role": instructor.role.value if hasattr(instructor.role, 'value') else str(instructor.role),
        "email": instructor.email,
        "is_active": instructor.is_active,
        "eligibility": {
            "status": eligibility.status.value if eligibility else None,
            "reason_detail": eligibility.reason_detail if eligibility else None,
            "is_current": eligibility.is_current if eligibility else False,
        } if eligibility else None,
        "current_borrows": borrow_list,
        "pending_requests": [r.model_dump(mode="json") for r in pending_reqs],
        "active_sanctions": sanctions,
    }


@router.post(
    "/borrow/staff",
    response_model=BorrowTransactionRead,
    status_code=status.HTTP_201_CREATED,
    summary="(Staff) Create borrow transaction from scanned BorrowingID",
)
async def staff_borrow(
    body: StaffBorrowCreateRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:
    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff can use this endpoint.")

    bid_result = await db.execute(
        select(BorrowingID).where(BorrowingID.qr_code == body.borrowing_id_qr, BorrowingID.is_active == True)
    )
    bid = bid_result.scalar_one_or_none()
    if not bid:
        raise NotFoundError("Borrowing ID", body.borrowing_id_qr)

    overdue_check = await db.execute(
        select(BorrowTransaction).where(
            BorrowTransaction.instructor_id == bid.instructor_id,
            BorrowTransaction.status.in_([TransactionStatus.ACTIVE, TransactionStatus.OVERDUE]),
        )
    )
    if overdue_check.scalar_one_or_none():
        raise ConflictError("Instructor has an active or overdue borrow transaction. Return items first.")

    transaction = BorrowTransaction(
        borrowing_id_record_id=bid.id,
        instructor_id=bid.instructor_id,
        expected_return=body.expected_return,
        notes=body.notes,
        processed_by_id=current_user.id,
    )
    db.add(transaction)
    await db.flush()

    for item_req in body.items:
        eq = await db.get(Equipment, item_req.equipment_id)
        if not eq or not eq.is_active:
            raise NotFoundError("Equipment", str(item_req.equipment_id))
        if eq.available_quantity < item_req.quantity:
            raise ConflictError(f"Insufficient quantity for {eq.name}. Available: {eq.available_quantity}")

        eq.available_quantity -= item_req.quantity
        tx_item = BorrowTransactionItem(
            transaction=transaction,
            equipment_id=eq.id,
            quantity=item_req.quantity,
        )
        db.add(tx_item)

    # Generate Return QR Code
    await db.flush()
    transaction_qr = f"TXN-{transaction.id.hex[:12].upper()}"
    transaction.transaction_qr_code = transaction_qr

    db.add(AuditLog(
        user_id=current_user.id,
        action="EQUIPMENT_BORROWED_STAFF",
        resource_type="BorrowTransaction",
        status="success",
        details={"instructor_id": str(bid.instructor_id), "items_count": len(body.items)},
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


@router.get(
    "/transactions/qr/{qr_code}",
    summary="(Staff) Scan Return QR Code to view transaction details",
)
async def scan_transaction_qr(
    qr_code: str,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff can scan Return QR codes.")

    if not qr_code.startswith("TXN-"):
        raise NotFoundError("Return QR", qr_code)

    result = await db.execute(
        select(BorrowTransaction).where(BorrowTransaction.transaction_qr_code == qr_code)
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise NotFoundError("Transaction", qr_code)

    qr_status = _compute_return_qr_status(
        transaction.expected_return,
        transaction.transaction_qr_invalidated,
        transaction.status,
    )

    instructor = await db.get(User, transaction.instructor_id)
    items_result = await db.execute(
        select(BorrowTransactionItem).where(BorrowTransactionItem.transaction_id == transaction.id)
    )
    items = items_result.scalars().all()

    item_list = []
    for item in items:
        eq = await db.get(Equipment, item.equipment_id)
        item_list.append({
            "id": str(item.id),
            "equipment_id": str(item.equipment_id),
            "equipment_name": eq.name if eq else "Unknown",
            "quantity": item.quantity,
            "is_returned": item.is_returned,
            "returned_at": item.returned_at.isoformat() if item.returned_at else None,
        })

    return {
        "transaction_id": str(transaction.id),
        "transaction_qr_code": transaction.transaction_qr_code,
        "qr_invalidated": transaction.transaction_qr_invalidated,
        "qr_status": qr_status,
        "borrower_name": instructor.full_name if instructor else "Unknown",
        "borrower_role": instructor.role.value if instructor and hasattr(instructor.role, 'value') else str(instructor.role) if instructor else "",
        "status": transaction.status.value if hasattr(transaction.status, 'value') else str(transaction.status),
        "borrowed_at": transaction.borrowed_at.isoformat(),
        "expected_return": transaction.expected_return.isoformat(),
        "notes": transaction.notes,
        "items": item_list,
    }


@router.put(
    "/transactions/{transaction_id}/release",
    response_model=BorrowTransactionRead,
    summary="(Staff) Confirm release of borrowed equipment",
)
async def confirm_release(
    transaction_id: uuid.UUID,
    body: TransactionReleaseRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:

    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff can confirm releases.")

    transaction = await db.get(BorrowTransaction, transaction_id)
    if not transaction:
        raise NotFoundError("Transaction", str(transaction_id))
    if transaction.status != TransactionStatus.ACTIVE:
        raise ConflictError(f"Transaction is already {transaction.status.value}.")

    if body.notes:
        transaction.notes = (transaction.notes or "") + f"\n[Release confirmed by {current_user.full_name}]: {body.notes}"

    db.add(AuditLog(
        user_id=current_user.id,
        action="TRANSACTION_RELEASED",
        resource_type="BorrowTransaction",
        resource_id=str(transaction.id),
        status="success",
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


@router.put(
    "/transactions/{transaction_id}/complete",
    response_model=BorrowTransactionRead,
    summary="(Staff) Confirm return and mark transaction as completed",
)
async def complete_transaction(
    transaction_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BorrowTransactionRead:
    if current_user.role not in _STAFF_BORROW_ROLES:
        raise ForbiddenError("Only admin, director, and staff can complete returns.")

    transaction = await db.get(BorrowTransaction, transaction_id)
    if not transaction:
        raise NotFoundError("Transaction", str(transaction_id))

    qr_status = _compute_return_qr_status(
        transaction.expected_return,
        transaction.transaction_qr_invalidated,
        transaction.status,
    )
    if qr_status == "used":
        raise ConflictError("This Return QR Code has already been used.")

    if transaction.status not in (TransactionStatus.ACTIVE, TransactionStatus.OVERDUE):
        raise ConflictError(f"Transaction is already {transaction.status.value}.")

    # A return is LATE if the Expected Return deadline has passed.
    now = datetime.now(UTC)
    er = transaction.expected_return
    if er.tzinfo is None:
        er = er.replace(tzinfo=UTC)
    was_overdue = now > er

    # Return all items
    items_result = await db.execute(
        select(BorrowTransactionItem).where(BorrowTransactionItem.transaction_id == transaction.id)
    )
    for item in items_result.scalars().all():
        if not item.is_returned:
            item.is_returned = True
            item.returned_at = now
            eq = await db.get(Equipment, item.equipment_id)
            if eq:
                eq.available_quantity += item.quantity

    # Record the late return for traceability
    if was_overdue:
        overdue_delta = now - er
        overdue_days = max(0, overdue_delta.days)
        overdue_hours = max(0, int(overdue_delta.seconds // 3600))
        transaction.notes = (transaction.notes or "") + (
            f"\n[Late return] Returned {overdue_days}d {overdue_hours}h after the Expected Return deadline."
        )

    transaction.status = TransactionStatus.RETURNED
    transaction.returned_at = now
    transaction.transaction_qr_invalidated = True

    db.add(AuditLog(
        user_id=current_user.id,
        action="RETURN_COMPLETED",
        resource_type="BorrowTransaction",
        resource_id=str(transaction.id),
        status="success",
        details={"qr_invalidated": True, "returned_late": was_overdue},
    ))
    await db.commit()
    await db.refresh(transaction)
    return await _build_transaction_read(transaction, db)


# ── Private helpers ────────────────────────────────────────────────────────────

async def _build_transaction_read(transaction: BorrowTransaction, db: AsyncSession) -> BorrowTransactionRead:
    """Build a BorrowTransactionRead with nested items."""
    items_result = await db.execute(
        select(BorrowTransactionItem).where(BorrowTransactionItem.transaction_id == transaction.id)
    )
    items = items_result.scalars().all()

    item_reads = []
    for item in items:
        eq = await db.get(Equipment, item.equipment_id)
        ir = BorrowTransactionItemRead.model_validate(item)
        if eq:
            ir.equipment_name = eq.name
            ir.equipment_qr = eq.qr_code
        item_reads.append(ir)

    instructor = await db.get(User, transaction.instructor_id)
    tr = BorrowTransactionRead(
        id=transaction.id,
        instructor_id=transaction.instructor_id,
        instructor_name=instructor.full_name if instructor else "",
        status=transaction.status,
        borrowed_at=transaction.borrowed_at,
        expected_return=transaction.expected_return,
        returned_at=transaction.returned_at,
        overdue_notified=transaction.overdue_notified,
        notes=transaction.notes,
        transaction_qr_code=transaction.transaction_qr_code,
        transaction_qr_invalidated=transaction.transaction_qr_invalidated,
        return_qr_status=_compute_return_qr_status(
            transaction.expected_return,
            transaction.transaction_qr_invalidated,
            transaction.status,
        ),
        items=item_reads,
    )
    return tr


async def _build_request_read(req: EquipmentRequest, db: AsyncSession) -> EquipmentRequestRead:
    """Build an EquipmentRequestRead with nested items."""
    items_result = await db.execute(
        select(EquipmentRequestItem).where(EquipmentRequestItem.request_id == req.id)
    )
    req_items = items_result.scalars().all()

    item_reads = []
    for ri in req_items:
        eq = await db.get(Equipment, ri.equipment_id)
        ir = EquipmentRequestItemRead.model_validate(ri)
        if eq:
            ir.equipment_name = eq.name
            ir.equipment_qr = eq.qr_code
        item_reads.append(ir)

    requester = await db.get(User, req.requester_id)
    approver = await db.get(User, req.approved_by_id) if req.approved_by_id else None
    rr = EquipmentRequestRead(
        id=req.id,
        requester_id=req.requester_id,
        requester_name=requester.full_name if requester else "",
        requester_role=requester.role.value if requester else "",
        status=req.status,
        expected_return=req.expected_return,
        notes=req.notes,
        requested_at=req.requested_at,
        approved_by_id=req.approved_by_id,
        approved_by_name=approver.full_name if approver else "",
        approved_at=req.approved_at,
        rejection_reason=req.rejection_reason,
        items=item_reads,
    )

    # Attach Return QR info (generated at request creation; functional after approval)
    if req.return_qr_code:
        rr.return_qr_code = req.return_qr_code
        if req.status == RequestStatus.APPROVED:
            tx_result = await db.execute(
                select(BorrowTransaction).where(
                    BorrowTransaction.transaction_qr_code == req.return_qr_code
                ).limit(1)
            )
            tx = tx_result.scalar_one_or_none()
            if tx:
                rr.return_qr_status = _compute_return_qr_status(
                    tx.expected_return,
                    tx.transaction_qr_invalidated,
                    tx.status,
                )
    elif req.status == RequestStatus.APPROVED:
        # Legacy requests created before return_qr_code existed
        tx_result = await db.execute(
            select(BorrowTransaction).where(
                BorrowTransaction.instructor_id == req.requester_id,
                BorrowTransaction.transaction_qr_code.isnot(None),
            ).order_by(BorrowTransaction.borrowed_at.desc()).limit(1)
        )
        tx = tx_result.scalar_one_or_none()
        if tx and tx.transaction_qr_code:
            rr.return_qr_code = tx.transaction_qr_code
            rr.return_qr_status = _compute_return_qr_status(
                tx.expected_return,
                tx.transaction_qr_invalidated,
                tx.status,
            )

    # Attach requester's active/overdue borrows for awareness
    active_tx_result = await db.execute(
        select(BorrowTransaction).where(
            BorrowTransaction.instructor_id == req.requester_id,
            BorrowTransaction.status.in_([TransactionStatus.ACTIVE, TransactionStatus.OVERDUE]),
        ).order_by(BorrowTransaction.borrowed_at.desc())
    )
    for tx in active_tx_result.scalars().all():
        tx_items_result = await db.execute(
            select(BorrowTransactionItem).where(BorrowTransactionItem.transaction_id == tx.id)
        )
        item_reads = []
        for item in tx_items_result.scalars().all():
            eq = await db.get(Equipment, item.equipment_id)
            ir = BorrowTransactionItemRead.model_validate(item)
            if eq:
                ir.equipment_name = eq.name
                ir.equipment_qr = eq.qr_code
            item_reads.append(ir)
        rr.requester_active_borrows.append(RequesterActiveBorrow(
            id=tx.id,
            status=tx.status.value,
            borrowed_at=tx.borrowed_at,
            expected_return=tx.expected_return,
            items=item_reads,
        ))

    return rr
