"""
Celery application configuration.
Broker: Redis (DB 1)
Result Backend: Redis (DB 2)
Beat Scheduler: celery-beat for periodic tasks (overdue checks, face image purging)
"""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "osca_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone (Philippines)
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=True,

    # Task reliability
    task_acks_late=True,             # Only acknowledge after task completes
    task_reject_on_worker_lost=True,  # Retry if worker crashes mid-task
    worker_prefetch_multiplier=1,    # Fair distribution across workers

    # Result expiry (keep for 24h for debugging)
    result_expires=86400,

    # Beat schedule for periodic tasks
    beat_schedule={
        # Check for overdue borrow transactions every 24h (configurable)
        "check-overdue-transactions": {
            "task": "app.workers.tasks.check_overdue_transactions",
            "schedule": crontab(hour=8, minute=0),  # 8 AM daily (Manila time)
        },
        # Purge face images past retention period (R.A. 10173)
        "purge-expired-face-images": {
            "task": "app.workers.tasks.purge_expired_face_images",
            "schedule": crontab(hour=2, minute=0),  # 2 AM daily
        },
        # Mark overdue transactions (update status in DB)
        "mark-overdue-status": {
            "task": "app.workers.tasks.mark_overdue_statuses",
            "schedule": crontab(minute=0),  # Every hour
        },
        # Release venues whose approved reservation has ended
        "release-expired-reservations": {
            "task": "app.workers.tasks.release_expired_reservations",
            "schedule": crontab(minute="*/15"),  # Every 15 minutes
        },
    },
)
