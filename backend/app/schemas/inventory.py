"""Inventory and borrowing schemas."""
import uuid
from datetime import datetime, timedelta, timezone

from pydantic import Field, computed_field, field_validator

from app.models.inventory import (
    EquipmentCategory,
    EquipmentCondition,
    RequestStatus,
    TransactionStatus,
)
from app.schemas.common import OSCABaseModel

REQUEST_QR_EXPIRY_MINUTES = 60


# ── Equipment Schemas ──────────────────────────────────────────────────────────

class EquipmentCreate(OSCABaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: EquipmentCategory
    condition: EquipmentCondition = EquipmentCondition.GOOD
    total_quantity: int = Field(ge=1, default=1)
    storage_location: str | None = Field(default=None, max_length=200)
    sport_or_art: str | None = Field(default=None, max_length=100)
    acquisition_date: datetime | None = None
    acquisition_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None


class EquipmentUpdate(OSCABaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = None
    category: EquipmentCategory | None = None
    condition: EquipmentCondition | None = None
    total_quantity: int | None = Field(default=None, ge=1)
    storage_location: str | None = Field(default=None, max_length=200)
    sport_or_art: str | None = Field(default=None, max_length=100)
    acquisition_cost: float | None = Field(default=None, ge=0)
    notes: str | None = None
    is_active: bool | None = None


class EquipmentRead(OSCABaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    category: EquipmentCategory
    condition: EquipmentCondition
    qr_code: str
    qr_image_key: str | None
    total_quantity: int
    available_quantity: int
    storage_location: str | None
    sport_or_art: str | None
    acquisition_date: datetime | None
    acquisition_cost: float | None
    is_active: bool
    notes: str | None
    created_at: datetime


# ── BorrowingID Schemas ────────────────────────────────────────────────────────

class BorrowingIDRead(OSCABaseModel):
    id: uuid.UUID
    instructor_id: uuid.UUID
    instructor_name: str = ""
    qr_code: str
    qr_image_key: str | None
    is_active: bool
    issued_at: datetime


# ── Borrow Transaction Schemas ─────────────────────────────────────────────────

class BorrowItemRequest(OSCABaseModel):
    """One equipment QR code scanned during borrowing."""
    equipment_qr: str
    quantity: int = Field(ge=1, default=1)


class BorrowTransactionCreate(OSCABaseModel):
    """
    Admin-only direct borrow (bypasses request flow).
    Step 1: PE Instructor scans Borrowing ID QR.
    Step 2: Scan each equipment QR code.
    Step 3: Confirm.
    """
    borrowing_id_qr: str = Field(description="QR code value from the Borrowing ID card")
    items: list[BorrowItemRequest] = Field(min_length=1)
    expected_return: datetime
    notes: str | None = None

    @field_validator("expected_return")
    @classmethod
    def return_must_be_future(cls, v: datetime) -> datetime:
        from datetime import timezone
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v <= datetime.now(tz=timezone.utc):
            raise ValueError("expected_return must be in the future")
        return v


class BorrowTransactionItemRead(OSCABaseModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str = ""
    equipment_qr: str = ""
    quantity: int
    is_returned: bool
    returned_at: datetime | None
    return_condition: EquipmentCondition | None
    notes: str | None


def _compute_return_qr_status(
    expected_return: datetime,
    qr_invalidated: bool,
    status: TransactionStatus,
) -> str:
    """Return 'active', 'expired', or 'used'."""
    if qr_invalidated or status in (TransactionStatus.RETURNED, TransactionStatus.PARTIAL_RETURN):
        return "used"
    now = datetime.now(timezone.utc)
    er = expected_return
    if er.tzinfo is None:
        er = er.replace(tzinfo=timezone.utc)
    if now > er:
        return "expired"
    return "active"


class BorrowTransactionRead(OSCABaseModel):
    id: uuid.UUID
    instructor_id: uuid.UUID
    instructor_name: str = ""
    status: TransactionStatus
    borrowed_at: datetime
    expected_return: datetime
    returned_at: datetime | None
    overdue_notified: bool
    notes: str | None
    transaction_qr_code: str | None = None
    transaction_qr_invalidated: bool = False
    return_qr_status: str = "active"
    items: list[BorrowTransactionItemRead]


class ReturnRequest(OSCABaseModel):
    """PE Instructor scans their Borrowing ID and each item being returned."""
    borrowing_id_qr: str
    items: list[BorrowItemRequest]
    notes: str | None = None


# ── Equipment Request Schemas ──────────────────────────────────────────────────

class EquipmentRequestItemCreate(OSCABaseModel):
    """One equipment item in a new request."""
    equipment_id: uuid.UUID
    quantity: int = Field(ge=1, default=1)


class EquipmentRequestCreate(OSCABaseModel):
    """Coach / PE Instructor submits a borrowing request."""
    items: list[EquipmentRequestItemCreate] = Field(min_length=1)
    expected_return: datetime
    notes: str | None = None

    @field_validator("expected_return")
    @classmethod
    def return_must_be_future(cls, v: datetime) -> datetime:
        from datetime import timezone
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v <= datetime.now(tz=timezone.utc):
            raise ValueError("expected_return must be in the future")
        return v


class EquipmentRequestItemRead(OSCABaseModel):
    id: uuid.UUID
    equipment_id: uuid.UUID
    equipment_name: str = ""
    equipment_qr: str = ""
    quantity: int


class EquipmentRequestRead(OSCABaseModel):
    id: uuid.UUID
    requester_id: uuid.UUID
    requester_name: str = ""
    requester_role: str = ""
    status: RequestStatus
    expected_return: datetime
    notes: str | None
    requested_at: datetime
    approved_by_id: uuid.UUID | None
    approved_by_name: str = ""
    approved_at: datetime | None
    rejection_reason: str | None
    return_qr_code: str | None = None
    return_qr_status: str | None = None
    requester_active_borrows: list["RequesterActiveBorrow"] = []
    items: list[EquipmentRequestItemRead]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_expired(self) -> bool:
        now = datetime.now(timezone.utc)
        ra = self.requested_at
        if ra.tzinfo is None:
            ra = ra.replace(tzinfo=timezone.utc)
        expiry = ra + timedelta(minutes=REQUEST_QR_EXPIRY_MINUTES)
        return now > expiry


class RequesterActiveBorrow(OSCABaseModel):
    """Simplified borrow info shown on EquipmentRequestRead for awareness."""
    id: uuid.UUID
    status: str
    borrowed_at: datetime
    expected_return: datetime
    items: list[BorrowTransactionItemRead] = []


class ApproveRequestBody(OSCABaseModel):
    notes: str | None = None
    create_transaction: bool = True


class RejectRequestBody(OSCABaseModel):
    rejection_reason: str = Field(min_length=1, max_length=500)


# ── Staff Borrow Workflow Schemas ─────────────────────────────────────────────

class ScannedUserEligibility(OSCABaseModel):
    status: str | None = None
    reason_detail: str | None = None
    is_current: bool = False


class ScannedUserSanction(OSCABaseModel):
    violation_type: str
    severity: str
    status: str
    description: str
    start_date: datetime | None
    end_date: datetime | None


class ScannedUserBorrow(OSCABaseModel):
    id: uuid.UUID
    status: str
    borrowed_at: datetime
    expected_return: datetime
    items_count: int = 0


class ScanBorrowingIDResponse(OSCABaseModel):
    user_id: uuid.UUID
    full_name: str
    role: str
    email: str
    is_active: bool
    eligibility: ScannedUserEligibility | None = None
    current_borrows: list[ScannedUserBorrow] = []
    pending_requests: list[EquipmentRequestRead] = []
    active_sanctions: list[ScannedUserSanction] = []


class StaffBorrowItem(OSCABaseModel):
    equipment_id: uuid.UUID
    quantity: int = Field(ge=1, default=1)


class StaffBorrowCreateRequest(OSCABaseModel):
    borrowing_id_qr: str
    items: list[StaffBorrowItem] = Field(min_length=1)
    expected_return: datetime
    notes: str | None = None

    @field_validator("expected_return")
    @classmethod
    def return_must_be_future(cls, v: datetime) -> datetime:
        from datetime import timezone
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v <= datetime.now(tz=timezone.utc):
            raise ValueError("expected_return must be in the future")
        return v


class TransactionQRRead(OSCABaseModel):
    transaction_id: uuid.UUID
    transaction_qr_code: str
    borrower_name: str
    borrower_role: str
    status: str
    items: list[BorrowTransactionItemRead]
    borrowed_at: datetime
    expected_return: datetime
    notes: str | None
    qr_status: str = "active"


class TransactionReleaseRequest(OSCABaseModel):
    notes: str | None = None
