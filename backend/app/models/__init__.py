"""SQLAlchemy models — import all here so Alembic can discover them."""
from app.models.user import User, UserRole
from app.models.attendance import (
    Session,
    AttendanceRecord,
    FaceEmbedding,
    ScanAttempt,
)
from app.models.inventory import (
    Equipment,
    EquipmentCategory,
    EquipmentCondition,
    BorrowingID,
    BorrowTransaction,
    BorrowTransactionItem,
    TransactionStatus,
    EquipmentRequest,
    EquipmentRequestItem,
    RequestStatus,
)
from app.models.audit import AuditLog
from app.models.announcement import (
    Announcement,
    AnnouncementAcknowledgement,
    AnnouncementComment,
)
from app.models.facility import Facility, FacilitySchedule, FacilityStatus, FacilityCondition
from app.models.reservation import VenueReservationRequest, ReservationStatus
from app.models.notification import Notification
from app.models.eligibility import AthleteEligibility, EligibilityStatus, EligibilityReasonType
from app.models.incident import Incident, IncidentSeverity, IncidentStatus, IncidentCategory
from app.models.sanction import Sanction, ViolationType, SanctionSeverity, SanctionStatus
from app.models.offline_sync import OfflineSyncRecord, SyncStatus, SyncRecordType

__all__ = [
    "User", "UserRole",
    "Session", "AttendanceRecord", "FaceEmbedding", "ScanAttempt",
    "Equipment", "EquipmentCategory", "EquipmentCondition",
    "BorrowingID", "BorrowTransaction", "BorrowTransactionItem", "TransactionStatus",
    "EquipmentRequest", "EquipmentRequestItem", "RequestStatus",
    "AuditLog",
    "Announcement", "AnnouncementAcknowledgement", "AnnouncementComment",
    "Facility", "FacilitySchedule", "FacilityStatus", "FacilityCondition",
    "VenueReservationRequest", "ReservationStatus",
    "Notification",
    "AthleteEligibility", "EligibilityStatus", "EligibilityReasonType",
    "Incident", "IncidentSeverity", "IncidentStatus", "IncidentCategory",
    "Sanction", "ViolationType", "SanctionSeverity", "SanctionStatus",
    "OfflineSyncRecord", "SyncStatus", "SyncRecordType",
]
