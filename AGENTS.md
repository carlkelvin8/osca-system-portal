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
- **Role-specific Requests table**: Admin/Director/Staff table: Requester | Items | Expected Return | Requested At | Approved By | Status | View Details | Actions. Actions column (last column) restored for approvers with original functionality: Approve/Reject for pending non-expired, Delete for non-pending, "—" otherwise. Return QR/"Show QR" stays requester-only (Coach/PE Instructor). Approve/Reject/Delete also available in View Details modal footer (approver-only). No Show QR/Return QR in the Actions column.
- **Delete Equipment Request**: Backend `DELETE /requests/{id}` (Admin/Director/Staff) — deletes PENDING/REJECTED/CANCELLED and approved requests whose linked transaction is RETURNED; blocks with 409 when the linked borrow is still active/overdue/partial. Frontend `inventoryApi.deleteRequest` + `DeleteConfirmModal` + red "Delete" button in Actions column for non-pending rows (restored Actions column with Cancel/Approve/Reject). Requests page table now: Requester | Items | Expected Return | Requested At | Approved By | Status | View Details | Return QR | Actions; removed top "Scan QR" button; button label "Show QR"; table wrapped in `overflow-x-auto` for responsive scroll.
- **Request-tied Return QR**: `return_qr_code` now generated at REQUEST CREATION (`TXN-{request_id.hex[:12].upper()}`), stored on `EquipmentRequest` (new column, migration `9a8b7c6d5e4f`), and REUSED on the BorrowTransaction at approve/release — so the QR the requester sees is the exact same code that gets scanned and invalidated. Fixed `_build_request_read`: it no longer attaches the requester's "latest transaction" QR (which could be a wrong/already-used QR from a different request) — it reads `req.return_qr_code` directly and looks up status by that code. Legacy approved requests without `return_qr_code` keep the old fallback. Verified via API: create → `TXN-F5C95A02A50E`, approve → active, scan → borrower/items, complete → returned + invalidated, request shows `return_qr_status: used`.
- **Student Dashboard Welcome**: Personalized "Welcome, {First Name}!" heading for students with descriptive subtitle; non-students see original "Dashboard" heading
- **Student Attendance Trend**: Weekly bar chart now uses real attendance records (last 7 days) instead of random mock data
- **Student Attendance stat**: "Attendance Today" card shows the student's own scan count instead of global total
- **My Attendance page**: Added search input + Daily/Weekly/Monthly filter buttons; columns changed to Attendance Date, Sport/Art, Attendance Session, Status, Time In, Time Out; paginated with 20 records/page
- **Backend GET /records**: Added `date_from`, `date_to` query params for date-range filtering; joined with `Session` to populate `session_name` and `session_sport_or_art` in response
- **Schema**: `AttendanceRecordRead` now includes `session_name` (str) and `session_sport_or_art` (str | None)

### Completed (current session)
- **Missing migration applied**: DB was at `e7f8a9b0c1d2`, head is `f3g4h5i6j7k8`. Ran `alembic upgrade head` in `osca_api` container — `request_status_enum` now has `cancelled`. This was causing 500 errors (`invalid input value for enum request_status_enum: "CANCELLED"`) on `GET /requests?status=cancelled`.
- **Backend return-QR chain verified end-to-end** via API: create request → approve `{create_transaction: true}` → `return_qr_code` populated (`TXN-{id_hex[:12].upper()}`) → `scan_transaction_qr` returns borrower/items/status → `complete_transaction` marks returned + invalidates QR. Works.
- **Manual TXN code entry added** to Return Scanner (`return-scanner/page.tsx`): staff can type/paste the `TXN-` code (bypasses camera) — also a diagnostic for camera/decode issues. `processCode()` shared by scan callback + manual form.
- **Naive datetime hardening**: `schemas/inventory.py` validators (`return_must_be_future` in `BorrowTransactionCreate`, `EquipmentRequestCreate`, `StaffBorrowCreateRequest`) now treat naive `expected_return` as UTC instead of crashing with `TypeError` → 500.
- **Requests page (admin/director/staff)**: (1) Date range filter — backend `GET /requests` accepts `date_from`/`date_to` (filter on `requested_at`), frontend adds two `<input type="date">` (sends `T00:00:00` / `T23:59:59`); (2) removed the read-only "Approved" badge from the Actions column; (3) derived "Returned" status badge shown when a request is `approved` + `return_qr_status === "used"` (i.e. the linked transaction was completed) — added `returned` entry to `statusConfig` + `RotateCcw` icon; "Show Return QR" button now hidden once `return_qr_status === "used"`.
- **DB enum case bug fixed**: SQLAlchemy binds enum member NAMES (uppercase, e.g. `CANCELLED`), but migration `f3g4h5i6j7k8` added lowercase `'cancelled'` → `GET /requests?status=cancelled` still 500. Added uppercase `'CANCELLED'` to `request_status_enum` directly in DB + updated the migration file. (Pre-existing enums are uppercase, e.g. `PENDING`/`APPROVED`/`REJECTED`.)
- **Open item**: camera scan "nothing happens" — no `/transactions/qr/` requests reach the backend from the browser (decode never fires OR stale browser bundle). Borrow scanner uses identical zxing decode code. Advise hard-refresh; manual TXN entry confirms frontend→API wiring.
- **Return QR root cause fixed**: `approveRequest` in `requests/page.tsx` was sending `{ create_transaction: false }`, so approving a request created NO BorrowTransaction and NO dynamic Return QR (`return_qr_code` stayed null → "Show Return QR" button never appeared). Changed to `create_transaction: true` so approval immediately creates the transaction + `TXN-{id_hex[:12].upper()}` Return QR. Removed the obsolete 60-minute request-QR expiry check in `approve_equipment_request` (requests no longer need a QR). Removed duplicate `ReturnQRModal` render in `requests/page.tsx`. `tsc --noEmit` + `py_compile` pass.
- **Return QR root cause fixed**: `approveRequest` in `requests/page.tsx` was sending `{ create_transaction: false }`, so approving a request created NO BorrowTransaction and NO dynamic Return QR (`return_qr_code` stayed null → "Show Return QR" button never appeared). Changed to `create_transaction: true` so approval immediately creates the transaction + `TXN-{id_hex[:12].upper()}` Return QR. Removed the obsolete 60-minute request-QR expiry check in `approve_equipment_request` (requests no longer need a QR). Removed duplicate `ReturnQRModal` render in `requests/page.tsx`. `tsc --noEmit` + `py_compile` pass.
- **Nav links restored**: `layout.tsx` Inventory menu now includes Borrow Scanner + Return Scanner (Admin/Director/Staff only).
- **api.ts + pre-existing compile errors fixed**: Added `staffBorrowApi`, `inventoryApi.cancelRequest`, `reportsApi.dailyAttendance/weeklyAttendance/monthlyAttendance`; imported `User` type in users page; fixed `TagIcon` JSX in dashboard page. `tsc --noEmit` passes with zero errors.

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
- `backend/app/api/v1/inventory.py`: `DELETE /requests/{id}` — delete request (Admin/Director/Staff); blocks approved requests whose linked borrow is still active/overdue/partial
- `frontend/src/app/dashboard/inventory/requests/page.tsx`: `DeleteConfirmModal` + Delete button (non-pending, approver only); table columns Requester | Items | Expected Return | Requested At | Approved By | Status | View Details | Return QR | Actions
- `frontend/src/app/dashboard/profile/page.tsx`: profile page — shows loading spinner while Digital ID is auto-generated
- `frontend/src/app/dashboard/inventory/borrow-scanner/page.tsx`: borrow scanner page with two-step QR flow (Static QR → Transaction QR). Static Digital ID workflow unchanged.
- `frontend/src/app/dashboard/inventory/return-scanner/page.tsx`: return scanner page — scans dynamic Return QR (TXN-), delegates validation to backend, shows borrower/items/dates/status + OVERDUE badge, allows late returns.
- `frontend/src/app/dashboard/inventory/requests/page.tsx`: `ReturnQRModal` (client-side QR from `return_qr_code`) + `CancelConfirmModal` + Cancel button for own PENDING requests
- `backend/app/api/v1/inventory.py` (line 1150): `complete_transaction` — allows late/overdue returns, records `[Late return]` note + `returned_late` audit flag, invalidates QR on completion
- `backend/app/api/v1/inventory.py` (line 414): `get_request_qr_code` — legacy `REQ-{id}` endpoint, no longer used for Return QR display
- `frontend/src/lib/api.ts`: `staffBorrowApi` (scanBorrowingId, createBorrow, scanTransactionQr, confirmRelease, completeTransaction) + `inventoryApi.cancelRequest`
- `backend/app/models/inventory.py` (`EquipmentRequest`): `return_qr_code` column — generated at request creation, reused on the transaction at approve/release
- `backend/alembic/versions/9a8b7c6d5e4f_add_return_qr_code_to_equipment_requests.py`: adds `return_qr_code` to `equipment_requests` (head now `9a8b7c6d5e4f`)
