from __future__ import annotations

import uuid
from typing import Any

import user_agents as ua_parser
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def request_of(user: Any | None) -> Any | None:
    if user is None:
        return None
    return getattr(user, "_current_request", None)


def _parse_user_agent(ua_string: str | None) -> dict[str, str | None]:
    if not ua_string:
        return {"browser": None, "os": None, "device_info": None}

    parsed = ua_parser.parse(ua_string)
    browser_name = parsed.browser.family
    browser_version = parsed.browser.version_string
    os_name = parsed.os.family
    os_version = parsed.os.version_string
    device = parsed.device.family

    return {
        "browser": f"{browser_name} {browser_version}".strip() if browser_name else None,
        "os": f"{os_name} {os_version}".strip() if os_name else None,
        "device_info": device if device and device != "Other" else None,
    }


async def audit_log(
    db: AsyncSession,
    *,
    action: str,
    module: str | None = None,
    description: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    previous_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    details: dict[str, Any] | None = None,
    status: str = "success",
    failure_reason: str | None = None,
    current_user: Any | None = None,
    user_id: uuid.UUID | None = None,
    request: Any | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    resolved_user_id = user_id
    admin_name = None
    admin_email = None
    admin_role = None

    if current_user is not None:
        resolved_user_id = getattr(current_user, "id", None)
        admin_name = getattr(current_user, "full_name", None)
        admin_email = getattr(current_user, "email", None)
        role_val = getattr(current_user, "role", None)
        admin_role = role_val.value if hasattr(role_val, "value") else str(role_val) if role_val else None

    req_ip = ip_address
    req_ua = None
    req_url = None
    req_method = None
    session_id = None

    if request is None:
        request = request_of(current_user)

    if request is not None:
        if hasattr(request, "client") and request.client:
            forwarded = request.headers.get("x-forwarded-for")
            req_ip = req_ip or (forwarded.split(",")[0].strip() if forwarded else request.client.host)
        req_ua = getattr(request, "headers", {}).get("user-agent", None) if hasattr(request, "headers") else None
        req_url = str(request.url) if hasattr(request, "url") else None
        req_method = request.method if hasattr(request, "method") else None

        cookies = getattr(request, "cookies", {})
        session_id = cookies.get("session_id") or request.headers.get("x-session-id") if hasattr(request, "headers") else None

    ua_info = _parse_user_agent(req_ua)

    log_entry = AuditLog(
        user_id=resolved_user_id,
        admin_name=admin_name,
        admin_email=admin_email,
        admin_role=admin_role,
        action=action,
        module=module,
        description=description,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        previous_values=previous_values,
        new_values=new_values,
        ip_address=req_ip,
        user_agent=req_ua[:500] if req_ua else None,
        browser=ua_info["browser"],
        os=ua_info["os"],
        device_info=ua_info["device_info"],
        session_id=session_id,
        request_url=req_url,
        http_method=req_method,
        details=details,
        status=status,
        failure_reason=failure_reason,
    )

    db.add(log_entry)
    return log_entry
