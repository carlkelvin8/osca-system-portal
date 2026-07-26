"""
Audit Log schemas for API request/response serialization.
"""
import uuid
from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import OSCABaseModel


class AuditLogRead(OSCABaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    admin_name: str | None = None
    admin_email: str | None = None
    admin_role: str | None = None
    action: str
    module: str | None = None
    description: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    previous_values: dict[str, Any] | None = None
    new_values: dict[str, Any] | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    browser: str | None = None
    os: str | None = None
    device_info: str | None = None
    session_id: str | None = None
    request_url: str | None = None
    http_method: str | None = None
    details: dict[str, Any] | None = None
    status: str = "success"
    failure_reason: str | None = None
    created_at: datetime


class AuditLogListParams(OSCABaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)
    search: str | None = None
    module: str | None = None
    action: str | None = None
    status: str | None = None
    user_id: uuid.UUID | None = None
    ip_address: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    sort_order: str = Field(default="desc", pattern="^(asc|desc)$")
