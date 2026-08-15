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
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    timezone=settings.CELERY_TIMEZONE,
    enable_utc=True,

    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,

    result_expires=86400,

    beat_schedule={
        "check-overdue-transactions": {
            "task": "app.workers.tasks.check_overdue_transactions",
            "schedule": crontab(hour=8, minute=0),
        },
        "purge-expired-face-images": {
            "task": "app.workers.tasks.purge_expired_face_images",
            "schedule": crontab(hour=2, minute=0),
        },
        "mark-overdue-status": {
            "task": "app.workers.tasks.mark_overdue_statuses",
            "schedule": crontab(minute=0),
        },
        "release-expired-reservations": {
            "task": "app.workers.tasks.release_expired_reservations",
            "schedule": crontab(minute="*/15"),
        },
    },
)
