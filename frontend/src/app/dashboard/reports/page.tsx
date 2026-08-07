"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gavel,
  History,
  Layers,
  Loader2,
  MapPin,
  Package,
  PieChart,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Table2,
  UserCheck,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { reportsApi, type ReportFormat } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { MonthlyInventoryReport } from "@/types";

const EXPORT_FORMATS: { fmt: ReportFormat; label: string; icon: LucideIcon; cls: string }[] = [
  { fmt: "pdf", label: "PDF", icon: FileText, cls: "text-red-600 border-red-200 hover:bg-red-50" },
  { fmt: "xlsx", label: "Excel", icon: FileSpreadsheet, cls: "text-emerald-600 border-emerald-200 hover:bg-emerald-50" },
  { fmt: "csv", label: "CSV", icon: Table2, cls: "text-gray-600 border-gray-200 hover:bg-gray-50" },
];

const ATTENDANCE_COLUMNS: Record<string, string> = {
  student_name: "Student Name",
  student_id: "Student ID",
  student_role: "Role",
  sport_or_art: "Sport / Art",
  session_name: "Session",
  activity_type: "Activity",
  time_in: "Time In",
  time_out: "Time Out",
  attendance_date: "Date",
  duration_minutes: "Duration",
  status: "Status",
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]";

function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadReport(promise: Promise<{ data: Blob }>, filename: string) {
  const res = await promise;
  downloadBlob(new Blob([res.data]), filename);
}

function wire(
  apiFn: (params: Record<string, unknown>, fmt: ReportFormat) => Promise<{ data: Blob }>,
  params: Record<string, unknown>,
  name: string,
): { onGenerate: () => Promise<unknown[]>; exports: Partial<Record<ReportFormat, () => Promise<void>>> } {
  return {
    onGenerate: async () => {
      const res = await apiFn(params, "json");
      return (res.data as unknown as unknown[]) ?? [];
    },
    exports: {
      pdf: () => downloadReport(apiFn(params, "pdf"), `${name}.pdf`),
      xlsx: () => downloadReport(apiFn(params, "xlsx"), `${name}.xlsx`),
      csv: () => downloadReport(apiFn(params, "csv"), `${name}.csv`),
    },
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function PreviewTable({ rows, columns }: { rows: unknown[]; columns?: Record<string, string> }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400">No records found for the selected period.</p>;
  const keys = Object.keys(rows[0] as Record<string, unknown>);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-44 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            {keys.map((k) => (
              <th key={k} className="px-2.5 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">
                {columns?.[k] ?? k.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-50">
              {keys.map((k) => {
                const v = (r as Record<string, unknown>)[k];
                return (
                  <td key={k} className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">
                    {v === null || v === undefined || v === "" ? "—" : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ReportCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: string;
  badge?: string;
  picker?: ReactNode;
  columns?: Record<string, string>;
  onGenerate: () => Promise<unknown[] | void>;
  exports: Partial<Record<ReportFormat, () => Promise<void>>>;
}

function ReportCard({
  icon: Icon,
  title,
  description,
  accent = "bg-[#1E3A5F]/10 text-[#1E3A5F]",
  badge,
  picker,
  columns,
  onGenerate,
  exports,
}: ReportCardProps) {
  const [genLoading, setGenLoading] = useState(false);
  const [busyFmt, setBusyFmt] = useState<ReportFormat | null>(null);
  const [preview, setPreview] = useState<unknown[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenLoading(true);
    setError(null);
    try {
      const rows = await onGenerate();
      setPreview(Array.isArray(rows) ? rows : []);
      setGeneratedAt(new Date().toLocaleTimeString());
    } catch {
      setError("Could not generate the report. Please try again.");
      setPreview(null);
    } finally {
      setGenLoading(false);
    }
  };

  const handleExport = async (fmt: ReportFormat) => {
    setBusyFmt(fmt);
    setError(null);
    try {
      await exports[fmt]?.();
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusyFmt(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 p-2.5 rounded-lg ${accent}`}>
            <Icon size={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
            {badge}
          </span>
        )}
      </div>

      {picker && <div className="px-5 pb-3">{picker}</div>}

      <div className="px-5 pb-3 mt-auto space-y-2">
        <button
          onClick={handleGenerate}
          disabled={genLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {genLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          Generate Report
        </button>
        <div className="flex items-center gap-2">
          {EXPORT_FORMATS.filter((f) => exports[f.fmt]).map((f) => (
            <button
              key={f.fmt}
              onClick={() => handleExport(f.fmt)}
              disabled={!!busyFmt}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${f.cls}`}
            >
              {busyFmt === f.fmt ? <Loader2 size={13} className="animate-spin" /> : <f.icon size={13} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!error && generatedAt && preview && preview.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-600">
              {preview.length} record{preview.length === 1 ? "" : "s"} found • generated {generatedAt}
            </p>
            <PreviewTable rows={preview.slice(0, 5)} columns={columns} />
          </div>
        )}
        {!error && generatedAt && preview && preview.length === 0 && (
          <p className="text-xs font-medium text-emerald-600">Report generated ✓ ({generatedAt})</p>
        )}
        {!error && !generatedAt && (
          <p className="text-xs text-gray-400 italic">Set the period and generate to preview records.</p>
        )}
      </div>
    </div>
  );
}

function MonthlySummaryCard({
  monthYear,
  onChangeMonth,
  year,
  month,
}: {
  monthYear: string;
  onChangeMonth: (v: string) => void;
  year: number;
  month: number;
}) {
  const [data, setData] = useState<MonthlyInventoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.inventoryMonthly(year, month, "json");
      setData(res.data as MonthlyInventoryReport);
    } catch {
      setError("Could not load the monthly summary.");
    } finally {
      setLoading(false);
    }
  };

  const exportFmt = async (fmt: ReportFormat) => {
    setBusy(fmt);
    setError(null);
    try {
      const res = await reportsApi.inventoryMonthly(year, month, fmt);
      const ext = fmt === "xlsx" ? "xlsx" : fmt === "pdf" ? "pdf" : "csv";
      downloadBlob(new Blob([res.data]), `inventory_monthly_${year}_${String(month).padStart(2, "0")}.${ext}`);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start gap-3 p-5 pb-3">
        <span className="shrink-0 p-2.5 rounded-lg bg-violet-50 text-violet-600">
          <BarChart3 size={18} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Monthly Inventory Summary</h3>
          <p className="text-xs text-gray-500 mt-0.5">Borrow volume, returns, overdue, and top equipment for a month.</p>
        </div>
      </div>

      <div className="px-5 pb-3">
        <Field label="Month">
          <input type="month" value={monthYear} onChange={(e) => onChangeMonth(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="px-5 pb-3 mt-auto space-y-2">
        <button
          onClick={generate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          Generate Report
        </button>
        <div className="flex items-center gap-2">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.fmt}
              onClick={() => exportFmt(f.fmt)}
              disabled={!!busy}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${f.cls}`}
            >
              {busy === f.fmt ? <Loader2 size={13} className="animate-spin" /> : <f.icon size={13} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {data && !error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Active Equipment", value: data.total_active_equipment, cls: "text-[#1E3A5F]" },
                { label: "Borrowed", value: data.borrowed_this_month, cls: "text-indigo-600" },
                { label: "Returned", value: data.returned_this_month, cls: "text-green-600" },
                {
                  label: "Overdue",
                  value: data.overdue_at_end_of_month,
                  cls: data.overdue_at_end_of_month > 0 ? "text-red-600" : "text-gray-500",
                },
              ].map((s) => (
                <div key={s.label} className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-1.5">Top 5 Borrowed</h4>
                {data.top_5_borrowed.length === 0 ? (
                  <p className="text-xs text-gray-400">No borrows recorded.</p>
                ) : (
                  <ol className="space-y-1">
                    {data.top_5_borrowed.map((e, i) => (
                      <li key={e.name} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                        <span className="text-gray-600">
                          <b>{i + 1}.</b> {e.name}
                        </span>
                        <span className="font-semibold text-[#1E3A5F]">{e.borrow_count}×</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-1.5">Condition</h4>
                <div className="space-y-1">
                  {Object.entries(data.condition_breakdown).map(([cond, count]) => (
                    <div key={cond} className="flex items-center justify-between text-xs py-1 border-b border-gray-100">
                      <span className="text-gray-600 capitalize">{cond.replace("_", " ")}</span>
                      <span className="font-semibold text-gray-800">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 text-right">
              Generated {new Date(data.generated_at).toLocaleString("en-PH")}
            </p>
          </div>
        )}
        {!data && !error && (
          <p className="text-xs text-gray-400 italic">Pick a month and generate to preview the summary.</p>
        )}
      </div>
    </div>
  );
}

type TabId = "attendance" | "inventory" | "facilities" | "eligibility" | "incidents" | "sanctions";

const TAB_DEFS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "attendance", label: "Attendance", icon: CalendarDays },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "facilities", label: "Facilities", icon: Building2 },
  { id: "eligibility", label: "Eligibility", icon: ShieldAlert },
  { id: "incidents", label: "Incidents", icon: AlertTriangle },
  { id: "sanctions", label: "Sanctions", icon: Gavel },
];

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{children}</div>;
}

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isCoach = user?.role === "coach";
  const isAdmin = user?.role === "admin" || user?.role === "director" || user?.role === "staff";
  const isNonStudent = isCoach || isAdmin;

  const [activeTab, setActiveTab] = useState<TabId>("attendance");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().slice(0, 10);
  });
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [year, month] = monthYear.split("-").map(Number);
  const sportFilter = isCoach && user?.assigned_sport ? { sport_or_art: user.assigned_sport } : undefined;

  const exportAttendance = async (
    endpoint: "daily" | "weekly" | "monthly",
    format: ReportFormat,
    params: Record<string, string | number | boolean>,
  ) => {
    const res = await reportsApi[`${endpoint}Attendance`]({ ...params, format });
    const ext = format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv";
    downloadBlob(new Blob([res.data]), `attendance-${endpoint}-${Date.now()}.${ext}`);
  };

  if (!isNonStudent) {
    return (
      <div className="p-10 text-center text-sm text-gray-500 bg-white rounded-xl shadow-sm">
        You do not have access to OSCA reports.
      </div>
    );
  }

  const tabs = TAB_DEFS.filter((t) => t.id !== "inventory" || isAdmin);

  const attendanceCards: ReportCardProps[] = [
    {
      icon: CalendarDays,
      title: "Daily Attendance Report",
      description: "All attendance records logged on a single day.",
      accent: "bg-blue-50 text-blue-600",
      columns: ATTENDANCE_COLUMNS,
      picker: (
        <Field label="Date">
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className={inputCls} />
        </Field>
      ),
      onGenerate: async () =>
        (await reportsApi.dailyAttendance({ log_date: logDate, format: "json", ...sportFilter })).data as unknown[],
      exports: {
        pdf: () => exportAttendance("daily", "pdf", { log_date: logDate, ...sportFilter }),
        xlsx: () => exportAttendance("daily", "xlsx", { log_date: logDate, ...sportFilter }),
        csv: () => exportAttendance("daily", "csv", { log_date: logDate, ...sportFilter }),
      },
    },
    {
      icon: CalendarRange,
      title: "Weekly Attendance Report",
      description: "All attendance records for a week starting on Monday.",
      accent: "bg-blue-50 text-blue-600",
      columns: ATTENDANCE_COLUMNS,
      picker: (
        <Field label="Week Starting (Monday)">
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={inputCls} />
        </Field>
      ),
      onGenerate: async () =>
        (await reportsApi.weeklyAttendance({ week_start: weekStart, format: "json", ...sportFilter }))
          .data as unknown[],
      exports: {
        pdf: () => exportAttendance("weekly", "pdf", { week_start: weekStart, ...sportFilter }),
        xlsx: () => exportAttendance("weekly", "xlsx", { week_start: weekStart, ...sportFilter }),
        csv: () => exportAttendance("weekly", "csv", { week_start: weekStart, ...sportFilter }),
      },
    },
    {
      icon: CalendarClock,
      title: "Monthly Attendance Report",
      description: "All attendance records within a selected month.",
      accent: "bg-blue-50 text-blue-600",
      columns: ATTENDANCE_COLUMNS,
      picker: (
        <Field label="Month">
          <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} className={inputCls} />
        </Field>
      ),
      onGenerate: async () =>
        (await reportsApi.monthlyAttendance({ year, month, format: "json", ...sportFilter })).data as unknown[],
      exports: {
        pdf: () => exportAttendance("monthly", "pdf", { year, month, ...sportFilter }),
        xlsx: () => exportAttendance("monthly", "xlsx", { year, month, ...sportFilter }),
        csv: () => exportAttendance("monthly", "csv", { year, month, ...sportFilter }),
      },
    },
    {
      icon: ClipboardList,
      title: "Full Attendance Report",
      description: "Complete attendance history in a single file.",
      accent: "bg-slate-50 text-slate-600",
      badge: "All time",
      onGenerate: async () => {
        await downloadReport(reportsApi.attendancePdf(sportFilter), `attendance_report_${Date.now()}.pdf`);
      },
      exports: {
        pdf: () => downloadReport(reportsApi.attendancePdf(sportFilter), `attendance_report_${Date.now()}.pdf`),
        xlsx: () => downloadReport(reportsApi.attendanceXlsx(sportFilter), `attendance_report_${Date.now()}.xlsx`),
      },
    },
  ];

  const rangeParams = { date_from: rangeFrom || undefined, date_to: rangeTo || undefined };

  const inventoryCards: ReportCardProps[] = [
    {
      icon: Boxes,
      title: "Equipment Inventory",
      description: "Current list of all equipment with quantities and conditions.",
      accent: "bg-indigo-50 text-indigo-600",
      badge: "Live",
      ...wire(reportsApi.inventoryEquipment, {}, "inventory-equipment"),
    },
    {
      icon: Package,
      title: "Borrowing History",
      description: "All borrow transactions in the selected date range.",
      accent: "bg-indigo-50 text-indigo-600",
      ...wire(reportsApi.borrowingHistory, rangeParams, "borrowing-history"),
    },
    {
      icon: RotateCcw,
      title: "Returned Equipment",
      description: "Transactions completed and returned in the selected date range.",
      accent: "bg-indigo-50 text-indigo-600",
      ...wire(reportsApi.returnedEquipment, rangeParams, "returned-equipment"),
    },
    {
      icon: AlertTriangle,
      title: "Lost / Damaged Equipment",
      description: "Equipment returned poor, for repair, condemned, or flagged lost/damaged.",
      accent: "bg-indigo-50 text-indigo-600",
      ...wire(reportsApi.lostDamagedEquipment, rangeParams, "lost-damaged"),
    },
  ];

  const facilityCards: ReportCardProps[] = [
    {
      icon: Building2,
      title: "Venue Reservations",
      description: "All venue reservation requests and their status.",
      accent: "bg-emerald-50 text-emerald-600",
      ...wire(reportsApi.venueReservations, {}, "venue-reservations"),
    },
    {
      icon: Layers,
      title: "Venue Usage",
      description: "Approved requests and reserved hours per venue.",
      accent: "bg-emerald-50 text-emerald-600",
      ...wire(reportsApi.venueUsage, {}, "venue-usage"),
    },
    {
      icon: MapPin,
      title: "Facility Status",
      description: "Current status, capacity, and activity of each venue.",
      accent: "bg-emerald-50 text-emerald-600",
      ...wire(reportsApi.facilityStatus, {}, "facility-status"),
    },
  ];

  const eligibilityCards: ReportCardProps[] = [
    {
      icon: UserCheck,
      title: "Eligible Students",
      description: "Students cleared for participation.",
      accent: "bg-teal-50 text-teal-600",
      ...wire(reportsApi.eligibleStudents, {}, "eligible-students"),
    },
    {
      icon: ShieldAlert,
      title: "Restricted Students",
      description: "Students under restricted status with conditions.",
      accent: "bg-teal-50 text-teal-600",
      ...wire(reportsApi.restrictedStudents, {}, "restricted-students"),
    },
    {
      icon: UserX,
      title: "Ineligible Students",
      description: "Students not cleared to participate.",
      accent: "bg-teal-50 text-teal-600",
      ...wire(reportsApi.ineligibleStudents, {}, "ineligible-students"),
    },
  ];

  const incidentCards: ReportCardProps[] = [
    {
      icon: ClipboardList,
      title: "Incident Reports",
      description: "Logged incidents with severity and status.",
      accent: "bg-amber-50 text-amber-600",
      ...wire(reportsApi.incidentReports, {}, "incident-reports"),
    },
    {
      icon: FolderOpen,
      title: "Incident Categories",
      description: "Incidents grouped by category.",
      accent: "bg-amber-50 text-amber-600",
      ...wire(reportsApi.incidentCategories, {}, "incident-categories"),
    },
    {
      icon: PieChart,
      title: "Incident Summary",
      description: "Totals by status and severity.",
      accent: "bg-amber-50 text-amber-600",
      ...wire(reportsApi.incidentSummary, {}, "incident-summary"),
    },
  ];

  const sanctionCards: ReportCardProps[] = [
    {
      icon: Gavel,
      title: "Active Sanctions",
      description: "Sanctions currently in effect.",
      accent: "bg-rose-50 text-rose-600",
      ...wire(reportsApi.activeSanctions, {}, "active-sanctions"),
    },
    {
      icon: CheckCircle2,
      title: "Completed Sanctions",
      description: "Sanctions that have been served.",
      accent: "bg-rose-50 text-rose-600",
      ...wire(reportsApi.completedSanctions, {}, "completed-sanctions"),
    },
    {
      icon: History,
      title: "Sanction History",
      description: "Full history of sanctions issued.",
      accent: "bg-rose-50 text-rose-600",
      ...wire(reportsApi.sanctionHistory, {}, "sanction-history"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">
          {isCoach && (user?.assigned_sport ?? user?.sport_or_art)
            ? `Reports for ${user?.assigned_sport ?? user?.sport_or_art}`
            : "Generate, preview, and export OSCA reports"}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition ${
              activeTab === t.id
                ? "border-[#1E3A5F] text-[#1E3A5F]"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "attendance" && (
        <CardGrid>
          {attendanceCards.map((c) => (
            <ReportCard key={c.title} {...c} />
          ))}
        </CardGrid>
      )}

      {isAdmin && activeTab === "inventory" && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Field label="Date From">
                <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Date To">
                <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <button
              onClick={() => {
                setRangeFrom("");
                setRangeTo("");
              }}
              className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Clear
            </button>
            <p className="text-xs text-gray-400 self-center pb-1">
              Applies to Borrowing History, Returned, and Lost / Damaged reports.
            </p>
          </div>
          <CardGrid>
            {inventoryCards.map((c) => (
              <ReportCard key={c.title} {...c} />
            ))}
            <MonthlySummaryCard monthYear={monthYear} onChangeMonth={setMonthYear} year={year} month={month} />
          </CardGrid>
        </div>
      )}

      {activeTab === "facilities" && (
        <CardGrid>
          {facilityCards.map((c) => (
            <ReportCard key={c.title} {...c} />
          ))}
        </CardGrid>
      )}

      {activeTab === "eligibility" && (
        <CardGrid>
          {eligibilityCards.map((c) => (
            <ReportCard key={c.title} {...c} />
          ))}
        </CardGrid>
      )}

      {activeTab === "incidents" && (
        <CardGrid>
          {incidentCards.map((c) => (
            <ReportCard key={c.title} {...c} />
          ))}
        </CardGrid>
      )}

      {activeTab === "sanctions" && (
        <CardGrid>
          {sanctionCards.map((c) => (
            <ReportCard key={c.title} {...c} />
          ))}
        </CardGrid>
      )}
    </div>
  );
}
