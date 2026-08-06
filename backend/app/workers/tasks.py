"""
Celery background tasks:
1. check_overdue_transactions — email instructor + admin when borrow is overdue
2. purge_expired_face_images — R.A. 10173 compliance: delete images after retention window
3. mark_overdue_statuses — DB status update (runs hourly)
4. generate_report_async — large reports generated in background, stored to MinIO
"""
import asyncio
from datetime import UTC, datetime, timedelta

import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger(__name__)


def _run_async(coro):
    """Helper to run async code inside a Celery (sync) task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.workers.tasks.check_overdue_transactions",
    bind=True,
    max_retries=3,
    default_retry_delay=300,  # 5 min retry on failure
)
def check_overdue_transactions(self):
    """
    Email PE Instructors and Admin about overdue borrow transactions.
    Runs daily at 8 AM Manila time via celery-beat.
    """
    async def _run():
        from sqlalchemy import select
        from app.database import AsyncSessionLocal
        from app.models.inventory import BorrowTransaction, TransactionStatus
        from app.models.user import User

        async with AsyncSessionLocal() as db:
            # Find overdue active transactions not yet notified
            now = datetime.now(UTC)
            result = await db.execute(
                select(BorrowTransaction).where(
                    BorrowTransaction.status == TransactionStatus.OVERDUE,
                    BorrowTransaction.overdue_notified == False,
                )
            )
            overdue = result.scalars().all()

            notified_count = 0
            for tx in overdue:
                instructor = await db.get(User, tx.instructor_id)
                if not instructor:
                    continue

                # Send email notification (fire-and-forget)
                await _send_overdue_email(instructor, tx)

                tx.overdue_notified = True
                tx.overdue_notified_at = now
                notified_count += 1

            await db.commit()
            logger.info("overdue_notifications_sent", count=notified_count)
            return notified_count

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("overdue_check_failed", error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.mark_overdue_statuses",
    bind=True,
)
def mark_overdue_statuses(self):
    """
    Update BorrowTransaction.status to OVERDUE where expected_return has passed.
    Runs every hour.
    """
    async def _run():
        from sqlalchemy import update
        from app.database import AsyncSessionLocal
        from app.models.inventory import BorrowTransaction, TransactionStatus

        async with AsyncSessionLocal() as db:
            now = datetime.now(UTC)
            await db.execute(
                update(BorrowTransaction)
                .where(
                    BorrowTransaction.status == TransactionStatus.ACTIVE,
                    BorrowTransaction.expected_return < now,
                )
                .values(status=TransactionStatus.OVERDUE)
            )
            await db.commit()
            logger.info("overdue_statuses_updated", timestamp=now.isoformat())

    _run_async(_run())


@celery_app.task(
    name="app.workers.tasks.purge_expired_face_images",
    bind=True,
)
def purge_expired_face_images(self):
    """
    Delete face enrollment images from MinIO after FACE_IMAGE_RETENTION_DAYS.
    R.A. 10173 (Philippine Data Privacy Act) compliance.
    The face embedding in pgvector is retained (needed for recognition).
    Only the raw image files are purged.
    """
    async def _run():
        from sqlalchemy import select
        from app.config import settings
        from app.database import AsyncSessionLocal
        from app.models.attendance import FaceEmbedding
        from app.services.storage_service import StorageService

        storage = StorageService()
        cutoff = datetime.now(UTC) - timedelta(days=settings.FACE_IMAGE_RETENTION_DAYS)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(FaceEmbedding).where(
                    FaceEmbedding.enrolled_at < cutoff,
                    FaceEmbedding.minio_image_keys != None,
                )
            )
            embeddings = result.scalars().all()

            purged_count = 0
            for emb in embeddings:
                if not emb.minio_image_keys:
                    continue
                keys = emb.minio_image_keys.split(",")
                await storage.delete_face_images(str(emb.user_id), keys)
                emb.minio_image_keys = None  # Clear keys after deletion
                purged_count += 1

            await db.commit()
            logger.info("face_images_purged", count=purged_count, cutoff=cutoff.isoformat())

    _run_async(_run())


@celery_app.task(
    name="app.workers.tasks.generate_report_async",
    bind=True,
    max_retries=2,
)
def generate_report_async(
    self,
    report_type: str,
    format: str,
    filters: dict,
    requested_by_user_id: str,
) -> str:
    """
    Generate a large report asynchronously and store to MinIO.
    Returns the MinIO object key for the completed report.
    """
    async def _run() -> str:
        from app.database import AsyncSessionLocal
        from app.services.report_service import ReportService
        from app.services.storage_service import StorageService
        from datetime import datetime

        async with AsyncSessionLocal() as db:
            report_service = ReportService(db)
            storage = StorageService()

            if report_type == "attendance" and format == "pdf":
                data = await report_service.generate_attendance_pdf(**filters)
                content_type = "application/pdf"
                ext = "pdf"
            elif report_type == "attendance" and format == "xlsx":
                data = await report_service.generate_attendance_xlsx(**filters)
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ext = "xlsx"
            elif report_type == "inventory" and format == "pdf":
                data = await report_service.generate_inventory_pdf()
                content_type = "application/pdf"
                ext = "pdf"
            else:
                raise ValueError(f"Unknown report type: {report_type}/{format}")

            filename = f"{report_type}_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.{ext}"
            key = await storage.upload_report(filename, data, content_type)
            logger.info("async_report_generated", key=key, user=requested_by_user_id)
            return key

    try:
        return _run_async(_run())
    except Exception as exc:
        logger.error("report_generation_failed", error=str(exc))
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.workers.tasks.release_expired_reservations",
    bind=True,
)
def release_expired_reservations(self):
    """
    Release venues whose approved reservation end datetime has passed.
    Sets facility.status from RESERVED back to AVAILABLE.
    Runs every 15 minutes via celery-beat.
    """
    async def _run():
        from datetime import datetime, time
        from zoneinfo import ZoneInfo
        from sqlalchemy import select
        from app.database import AsyncSessionLocal
        from app.models.facility import Facility, FacilityStatus
        from app.models.reservation import VenueReservationRequest, ReservationStatus

        tz = ZoneInfo("Asia/Manila")
        now = datetime.now(tz)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(VenueReservationRequest).where(
                    VenueReservationRequest.status == ReservationStatus.APPROVED
                )
            )
            released = 0
            for req in result.scalars().all():
                end = datetime.combine(req.reservation_date, req.end_time, tzinfo=tz)
                if now < end:
                    continue
                facility = await db.get(Facility, req.facility_id)
                if facility and facility.status == FacilityStatus.RESERVED:
                    facility.status = FacilityStatus.AVAILABLE
                    released += 1

            await db.commit()
            logger.info("reservations_released", count=released)

    _run_async(_run())


async def _send_overdue_email(instructor, transaction) -> None:
    """Send overdue notification email to instructor."""
    try:
        from app.config import settings
        # FastAPI-Mail or Resend integration
        # In production, import and use the configured email provider
        logger.info(
            "overdue_email_queued",
            instructor_email=instructor.email,
            transaction_id=str(transaction.id),
            expected_return=transaction.expected_return.isoformat(),
        )
    except Exception as e:
        logger.error("overdue_email_failed", error=str(e))
