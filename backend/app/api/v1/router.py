"""Central API v1 router — assembles all sub-routers."""
from fastapi import APIRouter

from app.api.v1 import (
    admin, announcements, audit_logs, attendance, auth, eligibility,
    facilities, incidents, inventory, notifications, offline_sync, reports,
    sanctions, users,
)

api_router = APIRouter()

api_router.include_router(auth.router,          prefix="/auth",          tags=["Authentication"])
api_router.include_router(users.router,         prefix="/users",         tags=["Users"])
api_router.include_router(attendance.router,    prefix="/attendance",    tags=["Attendance"])
api_router.include_router(inventory.router,     prefix="/inventory",     tags=["Inventory"])
api_router.include_router(facilities.router,    prefix="/facilities",    tags=["Facilities"])
api_router.include_router(eligibility.router,   prefix="/eligibility",   tags=["Eligibility"])
api_router.include_router(incidents.router,     prefix="/incidents",     tags=["Incidents"])
api_router.include_router(sanctions.router,     prefix="/sanctions",     tags=["Sanctions"])
api_router.include_router(offline_sync.router,  prefix="/sync",          tags=["Offline Sync"])
api_router.include_router(reports.router,       prefix="/reports",       tags=["Reports"])
api_router.include_router(admin.router,         prefix="/admin",         tags=["Admin"])
api_router.include_router(announcements.router, prefix="/announcements", tags=["Announcements"])
api_router.include_router(audit_logs.router,    prefix="/audit-logs",    tags=["Audit Logs"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
