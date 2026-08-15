import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser, get_db
from app.models.offline_sync import OfflineSyncRecord, SyncStatus, SyncRecordType
from app.models.attendance import AttendanceRecord
from app.schemas.offline_sync import SyncBatchUpload, SyncBatchResult, SyncRecordRead

router = APIRouter()


@router.post("/upload", response_model=SyncBatchResult, summary="Upload offline records for sync")
async def upload_offline_records(
    body: SyncBatchUpload,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    results: list[OfflineSyncRecord] = []
    synced = 0
    failed = 0
    conflicts = 0

    for record_data in body.records:
        sync_record = OfflineSyncRecord(
            device_id=record_data.device_id,
            user_id=current_user.id,
            record_type=record_data.record_type,
            payload=record_data.payload,
            local_timestamp=record_data.local_timestamp,
            status=SyncStatus.PENDING,
        )
        db.add(sync_record)
        await db.flush()

        try:
            await _process_sync_record(sync_record, db)
            sync_record.status = SyncStatus.SYNCED
            sync_record.synced_at = datetime.now(UTC)
            synced += 1
        except ValueError as e:
            sync_record.status = SyncStatus.CONFLICT
            sync_record.error_message = str(e)
            conflicts += 1
        except Exception as e:
            sync_record.status = SyncStatus.FAILED
            sync_record.error_message = str(e)
            failed += 1

        sync_record.sync_attempts += 1
        results.append(sync_record)

    await db.flush()
    for r in results:
        await db.refresh(r)

    return SyncBatchResult(
        total=len(results),
        synced=synced,
        failed=failed,
        conflicts=conflicts,
        results=[SyncRecordRead.model_validate(r) for r in results],
    )


@router.get("/status", response_model=list[SyncRecordRead], summary="Get sync status for device")
async def get_sync_status(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    device_id: str | None = None,
):
    query = select(OfflineSyncRecord).where(OfflineSyncRecord.user_id == current_user.id)
    if device_id:
        query = query.where(OfflineSyncRecord.device_id == device_id)
    query = query.order_by(OfflineSyncRecord.created_at.desc()).limit(100)
    result = await db.execute(query)
    return [SyncRecordRead.model_validate(r) for r in result.scalars().all()]


@router.post("/retry/{record_id}", response_model=SyncRecordRead, summary="Retry failed sync record")
async def retry_sync(
    record_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(OfflineSyncRecord).where(
            OfflineSyncRecord.id == record_id,
            OfflineSyncRecord.user_id == current_user.id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if record.status == SyncStatus.SYNCED:
        raise HTTPException(status_code=400, detail="Record already synced")

    try:
        await _process_sync_record(record, db)
        record.status = SyncStatus.SYNCED
        record.synced_at = datetime.now(UTC)
        record.error_message = None
    except Exception as e:
        record.status = SyncStatus.FAILED
        record.error_message = str(e)

    record.sync_attempts += 1
    await db.flush()
    await db.refresh(record)
    return SyncRecordRead.model_validate(record)


async def _process_sync_record(record: OfflineSyncRecord, db: AsyncSession) -> None:
    payload = record.payload

    if record.record_type == SyncRecordType.ATTENDANCE:
        from app.models.attendance import AttendanceRecord as AR
        ar = AR(
            student_id=payload.get("student_id") or record.user_id,
            session_id=payload.get("session_id"),
            time_in=payload.get("time_in"),
            time_out=payload.get("time_out"),
            method=payload.get("method", "offline_sync"),
        )
        db.add(ar)

    elif record.record_type == SyncRecordType.INVENTORY_TRANSACTION:
        pass

    else:
        raise ValueError(f"Unknown record type: {record.record_type}")
