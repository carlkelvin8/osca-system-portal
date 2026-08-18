"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { auditLogsApi } from "@/lib/api";
import type {
  AuditLog,
  AuditLogListParams,
  AuditLogStatus,
  PaginatedResponse,
} from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  User,
  Globe,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";


function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusColor(status: AuditLogStatus, isDark: boolean) {
  switch (status) {
    case "success":
      return isDark ? "text-emerald-400 bg-emerald-400/10" : "text-emerald-700 bg-emerald-50";
    case "failure":
      return isDark ? "text-red-400 bg-red-400/10" : "text-red-700 bg-red-50";
    case "partial":
      return isDark ? "text-amber-400 bg-amber-400/10" : "text-amber-700 bg-amber-50";
    default:
      return isDark ? "text-gray-400 bg-gray-400/10" : "text-gray-600 bg-gray-50";
  }
}

function moduleColor(mod: string | null, isDark: boolean) {
  const colors: Record<string, string> = {
    Auth: isDark ? "text-cyan-400 bg-cyan-400/10" : "text-cyan-700 bg-cyan-50",
    Users: isDark ? "text-purple-400 bg-purple-400/10" : "text-purple-700 bg-purple-50",
    "User Management": isDark ? "text-purple-400 bg-purple-400/10" : "text-purple-700 bg-purple-50",
    Attendance: isDark ? "text-blue-400 bg-blue-400/10" : "text-blue-700 bg-blue-50",
    Inventory: isDark ? "text-orange-400 bg-orange-400/10" : "text-orange-700 bg-orange-50",
    "Audit Logs": isDark ? "text-yellow-400 bg-yellow-400/10" : "text-yellow-700 bg-yellow-50",
    Announcements: isDark ? "text-pink-400 bg-pink-400/10" : "text-pink-700 bg-pink-50",
    Facilities: isDark ? "text-teal-400 bg-teal-400/10" : "text-teal-700 bg-teal-50",
    Eligibility: isDark ? "text-green-400 bg-green-400/10" : "text-green-700 bg-green-50",
    Incidents: isDark ? "text-red-400 bg-red-400/10" : "text-red-700 bg-red-50",
    Sanctions: isDark ? "text-rose-400 bg-rose-400/10" : "text-rose-700 bg-rose-50",
    Reports: isDark ? "text-indigo-400 bg-indigo-400/10" : "text-indigo-700 bg-indigo-50",
    System: isDark ? "text-slate-400 bg-slate-400/10" : "text-slate-700 bg-slate-50",
  };
  if (mod && colors[mod]) return colors[mod];
  return isDark ? "text-gray-400 bg-gray-400/10" : "text-gray-600 bg-gray-50";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function JsonDiff({
  before,
  after,
  isDark,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  isDark: boolean;
}) {
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    if (before) Object.keys(before).forEach((k) => keys.add(k));
    if (after) Object.keys(after).forEach((k) => keys.add(k));
    return [...keys].sort();
  }, [before, after]);

  if (allKeys.length === 0) {
    return (
      <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"} italic`}>
        No value changes recorded
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {allKeys.map((key) => {
        const oldVal = before?.[key];
        const newVal = after?.[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div
            key={key}
            className={`flex items-start gap-3 px-3 py-1.5 rounded-lg text-xs ${changed ? (isDark ? "bg-yellow-500/5" : "bg-yellow-50/50") : ""}`}
          >
            <span className={`font-mono font-semibold min-w-[120px] shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {key}
            </span>
            {!changed ? (
              <span className={`font-mono ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {JSON.stringify(newVal ?? oldVal)}
              </span>
            ) : (
              <div className="flex flex-col gap-1 flex-1">
                {oldVal !== undefined && (
                  <div className="font-mono line-through text-red-500/70">
                    {JSON.stringify(oldVal)}
                  </div>
                )}
                {newVal !== undefined && (
                  <div className="font-mono text-emerald-600 dark:text-emerald-400">
                    {JSON.stringify(newVal)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function DetailModal({
  log,
  onClose,
  isDark,
}: {
  log: AuditLog;
  onClose: () => void;
  isDark: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? "bg-[#1E293B] border border-[#334155]" : "bg-white border border-gray-200"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-[#334155]" : "border-gray-100"}`}>
          <div>
            <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              Audit Log Detail
            </h2>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} mt-0.5`}>
              {formatTimestamp(log.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
            <X size={18} className={isDark ? "text-gray-400" : "text-gray-500"} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <User size={18} className="text-blue-500" />
            </div>
            <div>
              <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                {log.admin_name || "Unknown Admin"}
              </p>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {log.admin_email || "—"} · {log.admin_role || "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: FileText, label: "Action", value: log.action },
              { icon: FileText, label: "Module", value: log.module },
              { icon: CheckCircle2, label: "Status", value: log.status },
              { icon: Globe, label: "IP Address", value: log.ip_address },
              { icon: Globe, label: "Browser", value: log.browser },
              { icon: Globe, label: "OS", value: log.os },
              { icon: Globe, label: "Device", value: log.device_info },
              { icon: FileText, label: "Resource", value: log.resource_type ? `${log.resource_type}${log.resource_id ? ` / ${log.resource_id}` : ""}` : null },
              { icon: FileText, label: "HTTP Method", value: log.http_method },
              { icon: Globe, label: "Request URL", value: log.request_url },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {label}
                </p>
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={isDark ? "text-gray-500" : "text-gray-400"} />
                  <span className={`text-sm ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                    {value || "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {log.description && (
            <div>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                Description
              </p>
              <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                {log.description}
              </p>
            </div>
          )}

          {log.failure_reason && (
            <div className={`p-3 rounded-xl ${isDark ? "bg-red-500/5" : "bg-red-50"}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 text-red-500`}>
                Failure Reason
              </p>
              <p className={`text-sm ${isDark ? "text-red-400" : "text-red-700"}`}>
                {log.failure_reason}
              </p>
            </div>
          )}

          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              Value Changes
            </p>
            <JsonDiff before={log.previous_values} after={log.new_values} isDark={isDark} />
          </div>
        </div>
      </div>
    </div>
  );
}


function FilterDropdown({
  label,
  value,
  options,
  onChange,
  isDark,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition ${value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : isDark ? "border-[#334155] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
      >
        <Filter size={13} />
        {label}
        {value && <X size={11} className="ml-1" onClick={(e) => { e.stopPropagation(); onChange(""); }} />}
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 top-full mt-1 z-50 w-48 max-h-60 overflow-y-auto rounded-xl shadow-xl border ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-gray-200"}`}>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt === value ? "" : opt); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs transition ${opt === value ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium" : isDark ? "text-gray-300 hover:bg-white/5" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


export default function AuditLogsPage() {
  const { user } = useAuthStore();
  const { isDark } = useThemeStore();
  const [data, setData] = useState<PaginatedResponse<AuditLog> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [actionOptions, setActionOptions] = useState<string[]>([]);

  if (user && user.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle size={48} className="text-amber-500" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Denied</h2>
        <p className="text-sm text-gray-500">Only Admin can view audit logs.</p>
      </div>
    );
  }

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean> = {
        page,
        page_size: pageSize,
        sort_order: sortOrder,
      };
      if (search) params.search = search;
      if (moduleFilter) params.module = moduleFilter;
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
      if (dateTo) params.date_to = `${dateTo}T23:59:59`;

      const res = await auditLogsApi.list(params);
      setData(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, sortOrder, search, moduleFilter, actionFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    auditLogsApi.getModules().then((r) => setModuleOptions(r.data)).catch(() => {});
    auditLogsApi.getActions().then((r) => setActionOptions(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, moduleFilter, actionFilter, statusFilter, sortOrder, dateFrom, dateTo]);

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    const params: Record<string, string | number | boolean> = {};
    if (search) params.search = search;
    if (moduleFilter) params.module = moduleFilter;
    if (actionFilter) params.action = actionFilter;
    if (statusFilter) params.status = statusFilter;
    if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
    if (dateTo) params.date_to = `${dateTo}T23:59:59`;

    try {
      let res;
      const date = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        res = await auditLogsApi.exportCsv(params);
        downloadBlob(res.data, `audit-logs-${date}.csv`);
      } else if (format === "xlsx") {
        res = await auditLogsApi.exportXlsx(params);
        downloadBlob(res.data, `audit-logs-${date}.xlsx`);
      } else {
        res = await auditLogsApi.exportPdf(params);
        downloadBlob(res.data, `audit-logs-${date}.pdf`);
      }
    } catch {
      alert("Export failed. Please try again.");
    }
  };

  const viewDetail = async (log: AuditLog) => {
    try {
      const res = await auditLogsApi.get(log.id);
      setSelectedLog(res.data);
    } catch {
      setSelectedLog(log);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            Audit Logs
          </h1>
          <p className={`text-sm mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Track all administrative actions and system events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => handleExport(fmt)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition ${isDark ? "border-[#334155] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <Download size={13} />
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-3 p-4 rounded-2xl ${isDark ? "bg-[#1E293B] border border-[#334155]" : "bg-white border border-gray-200 shadow-sm"}`}>
        <div className={`flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 rounded-xl border ${isDark ? "border-[#334155] bg-[#0F172A]" : "border-gray-200 bg-gray-50"}`}>
          <Search size={15} className={isDark ? "text-gray-500" : "text-gray-400"} />
          <input
            type="text"
            placeholder="Search action, admin, module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? "text-white placeholder:text-gray-600" : "text-gray-900 placeholder:text-gray-400"}`}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        <FilterDropdown
          label="Module"
          value={moduleFilter}
          options={moduleOptions}
          onChange={setModuleFilter}
          isDark={isDark}
        />
        <FilterDropdown
          label="Action"
          value={actionFilter}
          options={actionOptions}
          onChange={setActionFilter}
          isDark={isDark}
        />
        <FilterDropdown
          label="Status"
          value={statusFilter}
          options={["success", "failure", "partial"]}
          onChange={setStatusFilter}
          isDark={isDark}
        />

        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? "border-[#334155] bg-[#0F172A]" : "border-gray-200 bg-gray-50"}`}>
          <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`bg-transparent text-xs outline-none ${isDark ? "text-white [color-scheme:dark]" : "text-gray-900"}`}
          />
          <span className={`text-xs font-medium ${isDark ? "text-gray-500" : "text-gray-400"}`}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`bg-transparent text-xs outline-none ${isDark ? "text-white [color-scheme:dark]" : "text-gray-900"}`}
          />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition ${isDark ? "border-[#334155] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          title={`Sort ${sortOrder === "desc" ? "oldest first" : "newest first"}`}
        >
          <ArrowUpDown size={13} />
          {sortOrder === "desc" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
        </button>
      </div>

      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#1E293B] border-[#334155]" : "bg-white border-gray-200 shadow-sm"}`}>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <AlertTriangle size={32} className="text-red-500" />
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchLogs} className="text-xs text-blue-500 hover:underline">Retry</button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Clock size={32} className={isDark ? "text-gray-600" : "text-gray-300"} />
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {search || moduleFilter || actionFilter || statusFilter || dateFrom || dateTo
                ? "No audit logs match your filters"
                : "No audit logs yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${isDark ? "border-[#334155] bg-[#0F172A]/50" : "border-gray-100 bg-gray-50/50"}`}>
                    {["Admin", "Action", "Module", "Status", "IP Address", "Device", "Time", ""].map((h) => (
                      <th
                        key={h}
                        className={`text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => viewDetail(log)}
                      className={`border-b cursor-pointer transition-all duration-200 ${isDark ? "border-[#334155]/50 hover:bg-white/[0.04]" : "border-gray-50 hover:bg-blue-50/40"}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={null}
                            name={log.admin_name || "U"}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <p className={`text-xs font-medium truncate ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                              {log.admin_name || "Unknown"}
                            </p>
                            <p className={`text-[10px] truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                              {log.admin_email || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.module && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${moduleColor(log.module, isDark)}`}>
                            {log.module}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(log.status, isDark)}`}>
                          {log.status === "success" && <CheckCircle2 size={10} />}
                          {log.status === "failure" && <AlertTriangle size={10} />}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {log.ip_address || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            {log.browser || "—"}
                          </span>
                          <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                            {log.os || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            {relativeTime(log.created_at)}
                          </span>
                          <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                            {formatTimestamp(log.created_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Eye size={15} className={isDark ? "text-gray-500" : "text-gray-400"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`flex items-center justify-between px-4 py-3 border-t ${isDark ? "border-[#334155]" : "border-gray-100"}`}>
              <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {data.total.toLocaleString()} records · Page {data.page} of {data.pages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${page <= 1 ? "opacity-40 cursor-not-allowed" : ""} ${isDark ? "border-[#334155] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  onClick={() => setPage(Math.min(data.pages, page + 1))}
                  disabled={page >= data.pages}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${page >= data.pages ? "opacity-40 cursor-not-allowed" : ""} ${isDark ? "border-[#334155] text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedLog && (
        <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} isDark={isDark} />
      )}
    </div>
  );
}
