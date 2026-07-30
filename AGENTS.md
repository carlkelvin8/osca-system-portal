# OSCA System — Session Summary

## Objective
Build equipment borrowing with static QR workflow for Staff, attendance reports (daily/weekly/monthly) with export, and facility quantity validation — for ADMIN, DIRECTOR, and STAFF roles only.

## Important Details
- Docker containers: `osca_api`, `osca_frontend`, `osca_postgres`, `osca_redis`, `osca_minio`, `osca_celery`, `osca_celery_beat`, `osca_nginx`
- RBAC: `_STAFF_BORROW_ROLES = {ADMIN, DIRECTOR, STAFF}` for new borrow endpoints
- Transaction QR format: `TXN-{id_hex[:12].upper()}` — auto-generated, unique, invalidated on completion
- Static QR (BorrowingID) scan returns full coach/PE instructor info: eligibility, active borrows, pending requests, active sanctions
- Alembic chain: `0e82300a6c8d` (attendance) → `1a2b3c4d5e6f` (transaction QR columns) — migration applied
- Attendance reports export via CSV (built-in `csv`), XLSX (`openpyxl`), PDF (`xhtml2pdf`)
- Facility `capacity` field: backend `ge=0` in Pydantic schema, frontend `min="0"` on number input
- Equipment creation no longer renders/upload QR images — uses `EQ-{uuid_hex[:12].upper()}` as simple code
- User communicates in Taglish (Tagalog + English)

## Work State
### Completed (current session)
- **FR scan threshold fix**: `.env` `FACE_SIMILARITY_THRESHOLD` changed `0.85` → `0.5`; Redis `fr_config` seeded with `similarity_threshold=0.5`
- **LATE student time-out fix**: Added fallback in `attendance.py` TIME_OUT path (lines 461–501) that re-matches against only users with active time-in records when primary match fails
- **Delete User button fix**: Root cause was `AttendanceRecord.student_id` FK has no `ondelete` and `ScanAttempt.matched_user_id` FK has no `ondelete` → both block deletion with `IntegrityError`. Fix: added `cascade="all, delete-orphan"` to `User.attendance_records` relationship, `ondelete="CASCADE"` to `AttendanceRecord.student_id` FK, and `ondelete="SET NULL"` to `ScanAttempt.matched_user_id` FK (via migrations `f2b253e4d908` and `d61caf6ffd94`). Global `IntegrityError` handler updated to distinguish FK violations from duplicates. Frontend: added `onError` handler + error display in `DeleteUserModal` showing the server error message.
- **Account Creation & Face Enrollment improvements**: Added password show/hide toggles for Password and Confirm Password fields (independent toggles). Replaced Course, Sport/Art, and Assigned Sport dropdowns with searchable dropdowns (keep custom typed values). Added required Biometric Consent (R.A. 10173) checkbox in student section — saved to DB, blocks enrollment if unchecked. Used `SearchableSelect` component with click-outside-close, filtered options, and custom value support.

### Completed (previous sessions)
- **Four module updates**: Inventory QR removal, static QR borrowing, attendance reports, facility capacity validation — all verified present in codebase

## Relevant Files
- `backend/app/api/v1/users.py` (lines 308–329): `delete_user_permanently` — cascade handles attendance records automatically, no pre-check needed
- `backend/app/core/exceptions.py` (lines 78–91): `integrity_error_handler` — distinguishes FK violations from duplicate key violations
- `backend/app/models/attendance.py` (line 98): `AttendanceRecord.student_id` FK — changed to `ondelete="CASCADE"` (migration `f2b253e4d908`)
- `backend/app/models/attendance.py` (line 199): `ScanAttempt.matched_user_id` FK — changed to `ondelete="SET NULL"` (migration `d61caf6ffd94`)
- `backend/app/models/user.py` (line 93-95): `User.attendance_records` relationship — added `cascade="all, delete-orphan"`
- `frontend/src/app/dashboard/users/page.tsx`: `deletePermanently` mutation with `onError`, `DeleteUserModal` with error display, `deleteError` state
