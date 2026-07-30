# OSCA System — Session Summary

## Objective
Build equipment borrowing with static QR workflow for Staff, attendance reports (daily/weekly/monthly) with export, and facility quantity validation — for ADMIN, DIRECTOR, and STAFF roles only.

## Important Details
- Docker containers: `osca_api`, `osca_frontend`, `osca_postgres`, `osca_redis`, `osca_minio`, `osca_celery`, `osca_celery_beat`, `osca_nginx`
- RBAC: `_STAFF_BORROW_ROLES = {ADMIN, DIRECTOR, STAFF}` for new borrow endpoints
- Transaction QR format: `TXN-{id_hex[:12].upper()}` — auto-generated, unique, invalidated on completion
- Static QR (BorrowingID) format: `BID-{instructor_uuid}` — auto-generated on Coach/PE Instructor creation, permanent, never expires
- Static QR (BorrowingID) scan returns full coach/PE instructor info: eligibility, active borrows, pending requests, active sanctions
- Alembic head: `f3g4h5i6j7k8` (add cancelled to request_status_enum). Chain: `0e82300a6c8d` → `1a2b3c4d5e6f` → `f2b253e4d908` → `d61caf6ffd94` → `e7f8a9b0c1d2` → `f3g4h5i6j7k8`
- Attendance reports export via CSV (built-in `csv`), XLSX (`openpyxl`), PDF (`xhtml2pdf`)
- Facility `capacity` field: backend `ge=0` in Pydantic schema, frontend `min="0"` on number input, explicit validation message "Quantity cannot be less than 0."
- Equipment creation no longer renders/upload QR images — uses `EQ-{uuid_hex[:12].upper()}` as simple code
- User communicates in Taglish (Tagalog + English)
- Coach nav matches PE Instructor feature set (both lose Reports, Analytics, Facilities, Eligibility, Incidents, Sanctions); Coach keeps Attendance/Roster/Kiosk
- `GET /attendance/records`: accepts `date_from`, `date_to` query params; returns `session_name`, `session_sport_or_art`; students auto-filtered to own records

## Work State
### Completed (current session)
- **Student Dashboard Welcome**: Personalized "Welcome, {First Name}!" heading for students with descriptive subtitle; non-students see original "Dashboard" heading
- **Student Attendance Trend**: Weekly bar chart now uses real attendance records (last 7 days) instead of random mock data
- **Student Attendance stat**: "Attendance Today" card shows the student's own scan count instead of global total
- **My Attendance page**: Added search input + Daily/Weekly/Monthly filter buttons; columns changed to Attendance Date, Sport/Art, Attendance Session, Status, Time In, Time Out; paginated with 20 records/page
- **Backend GET /records**: Added `date_from`, `date_to` query params for date-range filtering; joined with `Session` to populate `session_name` and `session_sport_or_art` in response
- **Schema**: `AttendanceRecordRead` now includes `session_name` (str) and `session_sport_or_art` (str | None)

### Completed (previous sessions)
- **Auto-generate Digital ID**: BorrowingID auto-created for Coach/PE Instructor on account creation (`users.py:116-133`). Also auto-generated on profile fetch (`GET /borrowing-ids/me`) if missing. Removed "Contact OSCA administrator" message from profile page.
- **Cancel Request**: Added `CANCELLED` to `RequestStatus` enum, backend cancel endpoint (`PUT /requests/{id}/cancel`), frontend `CancelConfirmationModal` + Cancel button for own PENDING requests. Migration `f3g4h5i6j7k8`.
- **Borrow Scanner page**: Two-step flow at `/dashboard/inventory/borrow-scanner` — scan Static QR → identity info, then scan Transaction QR → release/complete actions. Visible to Admin/Director/Staff.
- **Coach nav alignment**: Removed Coach from Reports, Analytics, Facilities, Eligibility, Incidents, Sanctions (matching PE Instructor's limited set). Coach keeps Attendance, Player Roster, Kiosk.
- **Reports export columns**: Daily/Weekly/Monthly attendance exports include Student Role and Attendance Date
- **Attendance record eager loading**: Added `selectinload(AttendanceRecord.student)` to eliminate N+1 queries
- **Facility quantity validation**: Backend `ge=0`, frontend `min="0"` with explicit error message
- **Five earlier module updates**: Inventory QR removal, static QR borrowing, attendance reports, facility capacity validation, delete-user cascade fix, account creation improvements
- **Attendance session filtering**: Backend filters sessions by student's `sport_or_art`; PE Instructor rejected with 403
- **Create User form enhancements**: suffix, address, date_of_birth, gender, employee_id, department fields; migration `e7f8a9b0c1d2`
- **Login failure fix**: Migration `e7f8a9b0c1d2` applied — existing users table has 6 new columns

## Relevant Files
- `backend/app/api/v1/attendance.py` (lines 564–620): `GET /records` — date range filters, Session join, student auto-filter
- `backend/app/schemas/attendance.py` (line 59): `AttendanceRecordRead` — added `session_name`, `session_sport_or_art`
- `frontend/src/types/index.ts` (line 142): `AttendanceRecord` — added `session_name`, `session_sport_or_art`
- `frontend/src/app/dashboard/page.tsx`: student welcome heading (lines ~389-402), real attendance trend (lines ~377-400), student today count
- `frontend/src/app/dashboard/attendance/page.tsx`: My Attendance tab — search, Daily/Weekly/Monthly filter, updated columns with pagination
- `backend/app/api/v1/users.py` (lines 116–133): auto-generate BorrowingID after Coach/PE Instructor creation
- `backend/app/api/v1/inventory.py` (lines 187–213): `GET /borrowing-ids/me` — auto-generates if missing for Coach/PE Instructor
- `backend/app/api/v1/inventory.py` (lines 541–574): `PUT /requests/{id}/cancel` — cancel own PENDING request
- `frontend/src/app/dashboard/profile/page.tsx`: profile page — shows loading spinner while Digital ID is auto-generated
- `frontend/src/app/dashboard/inventory/borrow-scanner/page.tsx`: borrow scanner page with two-step QR flow
- `frontend/src/app/dashboard/inventory/requests/page.tsx`: `CancelConfirmModal` + Cancel button for own PENDING requests
