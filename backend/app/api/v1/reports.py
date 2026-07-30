"""
Report generation endpoints: attendance PDF/XLSX, inventory PDF/XLSX,
and daily/weekly/monthly attendance logs with export.
"""
import csv
import io
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

import openpyxl
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from xhtml2pdf import pisa

from app.core.dependencies import CurrentUser, NotStudent, get_db
from app.models.attendance import AttendanceRecord, Session
from app.models.user import User
from app.schemas.attendance import AttendanceReportFilter
from app.services.report_service import ReportService

router = APIRouter()


@router.get(
    "/attendance/pdf",
    summary="Generate attendance report PDF",
    response_class=StreamingResponse,
)
async def attendance_pdf(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    sport_or_art: str | None = Query(None),
    session_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> StreamingResponse:
    report_service = ReportService(db)
    pdf_bytes = await report_service.generate_attendance_pdf(
        sport_or_art=sport_or_art,
        date_from=date_from,
        date_to=date_to,
    )
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=attendance_report.pdf"},
    )


@router.get(
    "/attendance/xlsx",
    summary="Export attendance report XLSX",
    response_class=StreamingResponse,
)
async def attendance_xlsx(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    sport_or_art: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
) -> StreamingResponse:
    report_service = ReportService(db)
    xlsx_bytes = await report_service.generate_attendance_xlsx(
        sport_or_art=sport_or_art,
        date_from=date_from,
        date_to=date_to,
    )
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=attendance_report.xlsx"},
    )


@router.get(
    "/inventory/pdf",
    summary="Generate inventory report PDF",
    response_class=StreamingResponse,
)
async def inventory_pdf(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    report_service = ReportService(db)
    pdf_bytes = await report_service.generate_inventory_pdf()
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=inventory_report.pdf"},
    )


@router.get(
    "/inventory/xlsx",
    summary="Export inventory report XLSX",
    response_class=StreamingResponse,
)
async def inventory_xlsx(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    report_service = ReportService(db)
    xlsx_bytes = await report_service.generate_inventory_xlsx()
    return StreamingResponse(
        iter([xlsx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_report.xlsx"},
    )


@router.get(
    "/dashboard/summary",
    summary="Dashboard summary data",
)
async def dashboard_summary(
    _user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    report_service = ReportService(db)
    return await report_service.get_dashboard_summary()


@router.get(
    "/inventory/monthly",
    summary="Monthly inventory summary (Admin / Staff)",
    response_model=None,
)
async def inventory_monthly(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int = Query(..., ge=2020, le=2100, description="Report year"),
    month: int = Query(..., ge=1, le=12, description="Report month (1-12)"),
    format: str = Query("json", pattern="^(json|pdf|xlsx)$", description="Response format"),
) -> StreamingResponse | dict:
    report_service = ReportService(db)
    result = await report_service.generate_inventory_monthly_report(year=year, month=month)

    if format == "pdf":
        pdf_bytes = await report_service.render_monthly_report_pdf(result)
        filename = f"inventory_monthly_{year}_{month:02d}.pdf"
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    if format == "xlsx":
        xlsx_bytes = await report_service.render_monthly_report_xlsx(result)
        filename = f"inventory_monthly_{year}_{month:02d}.xlsx"
        return StreamingResponse(
            iter([xlsx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    return result


# ── Daily / Weekly / Monthly Attendance Logs ─────────────────────────────────

async def _fetch_attendance_logs(
    db: AsyncSession,
    date_from: datetime,
    date_to: datetime,
    sport_or_art: str | None = None,
) -> list[dict]:
    query = (
        select(AttendanceRecord, User, Session)
        .join(User, AttendanceRecord.student_id == User.id)
        .join(Session, AttendanceRecord.session_id == Session.id)
        .where(AttendanceRecord.time_in >= date_from, AttendanceRecord.time_in <= date_to)
    )
    if sport_or_art:
        query = query.where(Session.sport_or_art == sport_or_art)
    query = query.order_by(AttendanceRecord.time_in.desc())

    result = await db.execute(query)
    rows = []
    for record, user, session in result.all():
        rows.append({
            "id": str(record.id),
            "student_name": user.full_name,
            "student_id": user.student_id or "",
            "student_role": user.role.value if hasattr(user.role, 'value') else str(user.role),
            "student_email": user.email,
            "session_name": session.name,
            "sport_or_art": session.sport_or_art or "",
            "activity_type": session.activity_type.value,
            "time_in": record.time_in.isoformat() if record.time_in else "",
            "time_out": record.time_out.isoformat() if record.time_out else "",
            "attendance_date": record.time_in.strftime("%Y-%m-%d") if record.time_in else "",
            "duration_minutes": record.duration_minutes,
            "status": record.status or "",
            "confidence": record.time_in_confidence,
            "is_complete": record.is_complete,
        })
    return rows


def _build_attendance_csv(rows: list[dict]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Full Name", "Student ID", "Role", "Sport / Art",
        "Attendance Status", "Time In", "Time Out", "Attendance Date",
    ])
    for r in rows:
        writer.writerow([
            r["student_name"], r["student_id"], r["student_role"],
            r["sport_or_art"], r["status"], r["time_in"], r["time_out"],
            r["attendance_date"],
        ])
    output.seek(0)
    return output.getvalue()


def _build_attendance_xlsx(rows: list[dict]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance Logs"

    headers = [
        "Full Name", "Student ID", "Role", "Sport / Art",
        "Attendance Status", "Time In", "Time Out", "Attendance Date",
    ]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = openpyxl.styles.PatternFill("solid", fgColor="1E3A5F")
        cell.font = openpyxl.styles.Font(color="FFFFFF", bold=True)

    for i, r in enumerate(rows, 2):
        ws.cell(row=i, column=1, value=r["student_name"])
        ws.cell(row=i, column=2, value=r["student_id"])
        ws.cell(row=i, column=3, value=r["student_role"])
        ws.cell(row=i, column=4, value=r["sport_or_art"])
        ws.cell(row=i, column=5, value=r["status"])
        ws.cell(row=i, column=6, value=r["time_in"])
        ws.cell(row=i, column=7, value=r["time_out"])
        ws.cell(row=i, column=8, value=r["attendance_date"])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def _build_attendance_html(rows: list[dict], title: str, period: str) -> str:
    rows_html = ""
    for r in rows:
        rows_html += f"""
        <tr>
            <td>{r['student_name']}</td>
            <td>{r['student_id']}</td>
            <td>{r['student_role']}</td>
            <td>{r['sport_or_art']}</td>
            <td>{r['status']}</td>
            <td>{r['time_in']}</td>
            <td>{r['time_out']}</td>
            <td>{r['attendance_date']}</td>
        </tr>"""

    return f"""
    <html><head><meta charset="UTF-8">
    <style>
        body {{ font-family: Helvetica, sans-serif; font-size: 10px; margin: 20px; }}
        h1 {{ color: #1E3A5F; font-size: 16px; }}
        p {{ color: #666; font-size: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        th {{ background: #1E3A5F; color: white; padding: 6px 4px; text-align: left; font-size: 8px; }}
        td {{ padding: 4px; border-bottom: 1px solid #ddd; font-size: 8px; }}
    </style></head><body>
        <h1>OSCA — {title}</h1>
        <p>{period} | Records: {len(rows)} | Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}</p>
        <table>
            <tr><th>Name</th><th>ID</th><th>Role</th><th>Sport/Art</th><th>Status</th><th>Time In</th><th>Time Out</th><th>Date</th></tr>
            {rows_html}
        </table>
    </body></html>"""


@router.get(
    "/attendance/daily",
    response_model=None,
    summary="Daily attendance log",
)
async def daily_attendance(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    log_date: date | None = Query(None, description="Date (default: today)"),
    sport_or_art: str | None = Query(None),
    format: str = Query("json", pattern="^(json|csv|xlsx|pdf)$"),
) -> StreamingResponse | list:
    target = log_date or date.today()
    date_from = datetime(target.year, target.month, target.day, tzinfo=UTC)
    date_to = date_from + timedelta(days=1) - timedelta(seconds=1)

    rows = await _fetch_attendance_logs(db, date_from, date_to, sport_or_art)
    period_str = f"Daily Attendance — {target.isoformat()}"

    if format == "csv":
        csv_data = _build_attendance_csv(rows)
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=daily-attendance-{target.isoformat()}.csv"},
        )
    if format == "xlsx":
        xlsx_data = _build_attendance_xlsx(rows)
        return StreamingResponse(
            iter([xlsx_data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=daily-attendance-{target.isoformat()}.xlsx"},
        )
    if format == "pdf":
        html = _build_attendance_html(rows, period_str, period_str)
        pdf_bytes = io.BytesIO()
        pisa.CreatePDF(io.StringIO(html), dest=pdf_bytes)
        pdf_bytes.seek(0)
        return StreamingResponse(
            pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=daily-attendance-{target.isoformat()}.pdf"},
        )

    return rows


@router.get(
    "/attendance/weekly",
    response_model=None,
    summary="Weekly attendance log",
)
async def weekly_attendance(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    week_start: date | None = Query(None, description="Start of week (Monday, default: current week)"),
    sport_or_art: str | None = Query(None),
    format: str = Query("json", pattern="^(json|csv|xlsx|pdf)$"),
) -> StreamingResponse | list:
    start = week_start or (date.today() - timedelta(days=date.today().weekday()))
    date_from = datetime(start.year, start.month, start.day, tzinfo=UTC)
    date_to = date_from + timedelta(days=7) - timedelta(seconds=1)

    rows = await _fetch_attendance_logs(db, date_from, date_to, sport_or_art)
    period_str = f"Weekly Attendance — {start.isoformat()} to {(start + timedelta(days=6)).isoformat()}"

    if format == "csv":
        csv_data = _build_attendance_csv(rows)
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=weekly-attendance-{start.isoformat()}.csv"},
        )
    if format == "xlsx":
        xlsx_data = _build_attendance_xlsx(rows)
        return StreamingResponse(
            iter([xlsx_data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=weekly-attendance-{start.isoformat()}.xlsx"},
        )
    if format == "pdf":
        html = _build_attendance_html(rows, period_str, period_str)
        pdf_bytes = io.BytesIO()
        pisa.CreatePDF(io.StringIO(html), dest=pdf_bytes)
        pdf_bytes.seek(0)
        return StreamingResponse(
            pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=weekly-attendance-{start.isoformat()}.pdf"},
        )

    return rows


@router.get(
    "/attendance/monthly",
    response_model=None,
    summary="Monthly attendance log",
)
async def monthly_attendance(
    _user: NotStudent,
    db: Annotated[AsyncSession, Depends(get_db)],
    year: int = Query(None, ge=2020, le=2100),
    month: int = Query(None, ge=1, le=12),
    sport_or_art: str | None = Query(None),
    format: str = Query("json", pattern="^(json|csv|xlsx|pdf)$"),
) -> StreamingResponse | list:
    today = date.today()
    y = year or today.year
    m = month or today.month
    from calendar import monthrange
    _, last_day = monthrange(y, m)
    date_from = datetime(y, m, 1, tzinfo=UTC)
    date_to = datetime(y, m, last_day, 23, 59, 59, tzinfo=UTC)

    rows = await _fetch_attendance_logs(db, date_from, date_to, sport_or_art)
    from calendar import month_name
    period_str = f"Monthly Attendance — {month_name[m]} {y}"

    if format == "csv":
        csv_data = _build_attendance_csv(rows)
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=monthly-attendance-{y}-{m:02d}.csv"},
        )
    if format == "xlsx":
        xlsx_data = _build_attendance_xlsx(rows)
        return StreamingResponse(
            iter([xlsx_data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=monthly-attendance-{y}-{m:02d}.xlsx"},
        )
    if format == "pdf":
        html = _build_attendance_html(rows, period_str, period_str)
        pdf_bytes = io.BytesIO()
        pisa.CreatePDF(io.StringIO(html), dest=pdf_bytes)
        pdf_bytes.seek(0)
        return StreamingResponse(
            pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=monthly-attendance-{y}-{m:02d}.pdf"},
        )

    return rows
