"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { sanctionsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Gavel,
  Plus,
  X,
  Loader2,
  CheckCircle,
  Search,
  Download,
  FileText,
  CheckSquare,
  Check,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Scale,
  Eye,
  Pencil,
  Trash2,
  User,
  Clock,
  Info,
} from "lucide-react";
import type { Sanction, PaginatedResponse, UserSummary } from "@/types";
import { format } from "date-fns";
import { exportToCSV, exportToPrintPDF } from "@/lib/exportUtils";

const SEVERITY_COLORS: Record<string, string> = {
  warning: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  minor: "bg-orange-50 text-orange-700 border border-orange-200",
  major: "bg-red-50 text-red-700 border border-red-200",
  severe: "bg-red-100 text-red-800 border border-red-300",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-red-50 text-red-700 border border-red-200",
  served: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  appealed: "bg-amber-50 text-amber-700 border border-amber-200",
  lifted: "bg-gray-50 text-gray-600 border border-gray-200",
};
const VIOLATION_COLORS: Record<string, string> = {
  tardiness: "bg-blue-50 text-blue-700 border border-blue-200",
  absence: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  misconduct: "bg-amber-50 text-amber-700 border border-amber-200",
  dress_code: "bg-violet-50 text-violet-700 border border-violet-200",
  equipment_misuse: "bg-orange-50 text-orange-700 border border-orange-200",
  unsportsmanlike: "bg-rose-50 text-rose-700 border border-rose-200",
  substance: "bg-red-50 text-red-700 border border-red-200",
  academic: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  other: "bg-gray-50 text-gray-600 border border-gray-200",
};

const SEVERITY_LABELS: Record<string, string> = {
  warning: "Warning",
  minor: "Minor",
  major: "Major",
  severe: "Severe",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  served: "Served",
  appealed: "Appealed",
  lifted: "Lifted",
};
const VIOLATION_LABELS: Record<string, string> = {
  tardiness: "Tardiness",
  absence: "Absence",
  misconduct: "Misconduct",
  dress_code: "Dress Code",
  equipment_misuse: "Equipment Misuse",
  unsportsmanlike: "Unsportsmanlike",
  substance: "Substance",
  academic: "Academic",
  other: "Other",
};

function getApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { detail?: unknown; errors?: Array<{ message?: string }>; message?: string; code?: string }
      | undefined;
    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      const msgs = data.errors.map((e) => e.message ?? "").filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const msgs = detail.map((d) => (d as { msg?: string })?.msg ?? "").filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    if (typeof data?.message === "string") return data.message;
    if (err.code === "ECONNABORTED") return "The request timed out. Please try again.";
    if (!err.response) return "Network error. Please check your connection and try again.";
    return `Request failed (${err.response.status}). Please try again.`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

const EMPTY_FORM = { student_id: "", violation_type: "tardiness", severity: "warning", description: "", violation_date: "", penalty: "" };
const EMPTY_EDIT_FORM = { severity: "warning", status: "active", penalty: "", compliance_notes: "", end_date: "" };

function StudentAvatar({ s }: { s: UserSummary }) {
  const [imgError, setImgError] = useState(false);
  const initials = s.full_name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (s.profile_picture_url && !imgError) {
    return <img src={s.profile_picture_url} alt={s.full_name} onError={() => setImgError(true)} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-[#1E3A5F] text-white flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

export default function SanctionsPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === "admin" || user?.role === "director" || user?.role === "coach" || user?.role === "staff";
  const isStudent = user?.role === "student";
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [violationFilter, setViolationFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [viewTarget, setViewTarget] = useState<Sanction | null>(null);
  const [editTarget, setEditTarget] = useState<Sanction | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_FORM });
  const [editFormError, setEditFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Sanction | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Sanction>>({
    queryKey: ["sanctions"],
    queryFn: async () => (await sanctionsApi.list({ page_size: 100 })).data,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => sanctionsApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      setFormError("");
      setSuccessMsg("Sanction issued successfully.");
      setTimeout(() => closeModal(), 1200);
    },
    onError: (e) => {
      setSuccessMsg("");
      setFormError(getApiError(e));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => sanctionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      setEditTarget(null);
      setViewTarget(null);
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => sanctionsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sanctions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => sanctionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      setDeleteTarget(null);
      setViewTarget(null);
    },
  });

  const bulkServedMutation = useMutation({
    mutationFn: async () => {
      for (const id of selected) await sanctionsApi.update(id, { status: "served", is_compliant: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      setSelected(new Set());
    },
  });

  const { data: studentsData } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["students-list"],
    queryFn: async () => (await usersApi.list({ role: "student", page_size: 100, is_active: true })).data,
    enabled: isStaff,
  });

  const [viewStudent, setViewStudent] = useState<UserSummary | null>(null);
  const [viewIssuer, setViewIssuer] = useState<UserSummary | null>(null);

  useEffect(() => {
    if (!viewTarget?.student_id) { setViewStudent(null); return; }
    let cancelled = false;
    usersApi.get(viewTarget.student_id).then((res) => { if (!cancelled) setViewStudent(res.data as UserSummary); }).catch(() => { if (!cancelled) setViewStudent(null); });
    return () => { cancelled = true; };
  }, [viewTarget?.student_id]);

  useEffect(() => {
    if (!viewTarget?.issued_by_id) { setViewIssuer(null); return; }
    let cancelled = false;
    usersApi.get(viewTarget.issued_by_id).then((res) => { if (!cancelled) setViewIssuer(res.data as UserSummary); }).catch(() => { if (!cancelled) setViewIssuer(null); });
    return () => { cancelled = true; };
  }, [viewTarget?.issued_by_id]);

  useEffect(() => {
    if (!showAdd) return;
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, [showAdd]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openModal = () => {
    setForm({ ...EMPTY_FORM });
    setStudentQuery("");
    setDropdownOpen(false);
    setClosing(false);
    setFormError("");
    setSuccessMsg("");
    setShowAdd(true);
  };

  const closeModal = () => {
    setDropdownOpen(false);
    setClosing(true);
    setMounted(false);
    setTimeout(() => {
      setShowAdd(false);
      setClosing(false);
    }, 150);
  };

  const openEdit = (s: Sanction) => {
    setEditTarget(s);
    setEditForm({
      severity: s.severity,
      status: s.status,
      penalty: s.penalty ?? "",
      compliance_notes: s.compliance_notes ?? "",
      end_date: s.end_date ?? "",
    });
    setEditFormError("");
  };

  const students = studentsData?.items ?? [];
  const selectedStudent = students.find((s) => s.id === form.student_id) ?? null;
  const studentOptions = students.filter((s) => {
    if (!studentQuery) return true;
    const q = studentQuery.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || (s.student_id ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const items = (data?.items ?? []).filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (violationFilter && s.violation_type !== violationFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.description.toLowerCase().includes(q) || s.violation_type.toLowerCase().includes(q) || (s.penalty?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  const toggleSelect = (id: string) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };

  const handleExportCSV = () => {
    exportToCSV(
      items.map((s) => ({
        violation_type: s.violation_type,
        severity: s.severity,
        status: s.status,
        description: s.description,
        violation_date: s.violation_date,
        start_date: s.start_date,
        end_date: s.end_date ?? "",
        penalty: s.penalty ?? "",
        acknowledged: s.acknowledged_by_student ? "Yes" : "No",
      })),
      "sanctions"
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Gavel size={22} className="text-[#1E3A5F]" />
          <h1 className="text-xl font-bold text-[#111827]">{isStudent ? "My Sanctions & Warnings" : "Sanction Monitoring"}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>
          <button onClick={() => exportToPrintPDF("Sanctions Report")} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><FileText size={13} /> PDF</button>
          {isStaff && <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition-colors"><Plus size={14} /> Issue Sanction</button>}
        </div>
      </div>

      {isStudent && <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">Below are sanctions/warnings issued to you. Please acknowledge receipt.</div>}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, type..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="served">Served</option>
          <option value="appealed">Appealed</option>
          <option value="lifted">Lifted</option>
        </select>
        <select value={violationFilter} onChange={(e) => setViolationFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg">
          <option value="">All Violations</option>
          <option value="tardiness">Tardiness</option>
          <option value="absence">Absence</option>
          <option value="misconduct">Misconduct</option>
          <option value="dress_code">Dress Code</option>
          <option value="equipment_misuse">Equipment Misuse</option>
          <option value="unsportsmanlike">Unsportsmanlike</option>
          <option value="substance">Substance</option>
          <option value="academic">Academic</option>
          <option value="other">Other</option>
        </select>
      </div>

      {selected.size > 0 && isStaff && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <CheckSquare size={16} className="text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
          <button onClick={() => bulkServedMutation.mutate()} disabled={bulkServedMutation.isPending} className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {bulkServedMutation.isPending ? "Processing..." : "Bulk Mark Served"}
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : (
        <div className="space-y-3" data-export-table>
          {items.map((s) => (
            <div
              key={s.id}
              onClick={() => setViewTarget(s)}
              className={`bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all duration-150 ${selected.has(s.id) ? "ring-2 ring-blue-300" : ""}`}
            >
              <div className="flex items-start gap-4">
                {isStaff && (
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(s.id); }}
                    className="rounded mt-1 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-base font-bold text-[#111827] leading-snug">
                      {s.penalty || VIOLATION_LABELS[s.violation_type] || s.violation_type.replace("_", " ")}
                    </h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 line-clamp-1 mb-3">{s.description}</p>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${VIOLATION_COLORS[s.violation_type]}`}>
                      {VIOLATION_LABELS[s.violation_type] ?? s.violation_type.replace("_", " ")}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${SEVERITY_COLORS[s.severity]}`}>
                      {SEVERITY_LABELS[s.severity] ?? s.severity}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={12} />
                      Violation: {format(new Date(s.violation_date), "MMM d, yyyy")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={12} />
                      {s.start_date} → {s.end_date || "ongoing"}
                    </span>
                    {s.acknowledged_by_student && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle size={12} />
                        Acknowledged
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-12 text-gray-400">{isStudent ? "No sanctions. Keep it up!" : "No sanctions found."}</div>}
        </div>
      )}

      {showAdd && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-150 ${mounted && !closing ? "opacity-100" : "opacity-0"}`}
        >
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl transition-all duration-150 ${mounted && !closing ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-[0.98]"}`}>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0"><Gavel size={20} className="text-[#1E3A5F]" /></div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Issue Sanction</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Create and issue a sanction for a student.</p>
                  </div>
                </div>
                <button type="button" onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...form, penalty: form.penalty || null, start_date: format(new Date(), "yyyy-MM-dd") }); }} className="space-y-5">
                <div ref={dropdownRef} className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Student <span className="text-red-500">*</span></label>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm border border-gray-200 rounded-lg text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                  >
                    {selectedStudent ? (
                      <>
                        <StudentAvatar s={selectedStudent} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-800 truncate">{selectedStudent.full_name}</div>
                          <div className="text-xs text-gray-400 truncate">{selectedStudent.student_id ?? selectedStudent.email}</div>
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">Select a student</span>
                    )}
                    <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input autoFocus value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder="Search name or student ID..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {studentOptions.map((s) => (
                          <button key={s.id} type="button" onClick={() => { setForm({ ...form, student_id: s.id }); setStudentQuery(""); setDropdownOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left">
                            <StudentAvatar s={s} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-800 truncate">{s.full_name}</div>
                              <div className="text-xs text-gray-400 truncate">{s.student_id ?? s.email}</div>
                            </div>
                            {selectedStudent?.id === s.id && <Check size={16} className="text-blue-600 shrink-0" />}
                          </button>
                        ))}
                        {studentOptions.length === 0 && <div className="px-4 py-6 text-center text-sm text-gray-400">No students found.</div>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Violation Type <span className="text-red-500">*</span></label>
                    <select value={form.violation_type} onChange={(e) => setForm({ ...form, violation_type: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="tardiness">Tardiness</option><option value="absence">Absence</option><option value="misconduct">Misconduct</option><option value="dress_code">Dress Code</option><option value="equipment_misuse">Equipment Misuse</option><option value="unsportsmanlike">Unsportsmanlike</option><option value="substance">Substance</option><option value="academic">Academic</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Sanction Level <span className="text-red-500">*</span></label>
                    <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="warning">Warning</option><option value="minor">Minor</option><option value="major">Major</option><option value="severe">Severe</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Description <span className="text-red-500">*</span></label>
                    <span className={`text-[11px] ${form.description.length > 2000 ? "text-red-500" : "text-gray-400"}`}>{form.description.length}/2000</span>
                  </div>
                  <textarea rows={5} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the violation and what happened..." className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Violation Date <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="date" required value={form.violation_date} onChange={(e) => setForm({ ...form, violation_date: e.target.value })} className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Penalty</label>
                  <div className="relative">
                    <Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={form.penalty} onChange={(e) => setForm({ ...form, penalty: e.target.value })} placeholder="e.g. 3-day suspension (optional)" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                  </div>
                </div>

                {successMsg && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0" /> {successMsg}
                  </div>
                )}
                {formError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle size={16} className="text-red-600 shrink-0" /> {formError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={closeModal} className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {createMutation.isPending ? (<><Loader2 size={15} className="animate-spin" /> Issuing...</>) : (<><Gavel size={15} /> Issue Sanction</>)}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {viewTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setViewTarget(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0">
                  <Eye size={18} className="text-[#1E3A5F]" />
                </div>
                <h2 className="font-bold text-lg text-[#111827]">Sanction Details</h2>
              </div>
              <button onClick={() => setViewTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[viewTarget.status]}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                    {STATUS_LABELS[viewTarget.status] ?? viewTarget.status}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${VIOLATION_COLORS[viewTarget.violation_type]}`}>
                    {VIOLATION_LABELS[viewTarget.violation_type] ?? viewTarget.violation_type.replace("_", " ")}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${SEVERITY_COLORS[viewTarget.severity]}`}>
                    {SEVERITY_LABELS[viewTarget.severity] ?? viewTarget.severity}
                  </span>
                </div>
              </div>

              {viewStudent && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Student</label>
                  <div className="mt-2 flex items-center gap-3">
                    <StudentAvatar s={viewStudent} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate">{viewStudent.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">{viewStudent.student_id ?? viewStudent.email}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{viewTarget.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Violation Date</label>
                  <p className="mt-1 text-sm text-gray-700 flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" />
                    {format(new Date(viewTarget.violation_date), "MMM d, yyyy")}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Duration</label>
                  <p className="mt-1 text-sm text-gray-700 flex items-center gap-1.5">
                    <Clock size={13} className="text-gray-400" />
                    {format(new Date(viewTarget.start_date), "MMM d, yyyy")} → {viewTarget.end_date ? format(new Date(viewTarget.end_date), "MMM d, yyyy") : "Ongoing"}
                  </p>
                </div>
              </div>

              {viewTarget.penalty && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <label className="text-xs font-medium text-amber-600 uppercase tracking-wide">Assigned Sanction</label>
                  <p className="mt-1 text-sm text-amber-700 flex items-center gap-1.5">
                    <Scale size={13} className="text-amber-500" />
                    {viewTarget.penalty}
                  </p>
                </div>
              )}

              {viewIssuer && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <User size={12} />
                  Issued by {viewIssuer.full_name} on {format(new Date(viewTarget.created_at), "MMM d, yyyy")}
                </div>
              )}

              {viewTarget.compliance_notes && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Compliance Notes</label>
                  <p className="mt-1 text-sm text-gray-700">{viewTarget.compliance_notes}</p>
                </div>
              )}

              {viewTarget.acknowledged_by_student && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-sm text-emerald-700">
                    Acknowledged by student{viewTarget.acknowledged_at ? ` on ${format(new Date(viewTarget.acknowledged_at), "MMM d, yyyy")}` : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              {isStudent && !viewTarget.acknowledged_by_student ? (
                <button
                  onClick={() => acknowledgeMutation.mutate(viewTarget.id)}
                  disabled={acknowledgeMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {acknowledgeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Acknowledge
                </button>
              ) : isStaff && viewTarget.status === "active" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { updateMutation.mutate({ id: viewTarget.id, data: { status: "served", is_compliant: true } }); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Mark Served
                  </button>
                  <button
                    onClick={() => { updateMutation.mutate({ id: viewTarget.id, data: { status: "lifted" } }); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Check size={13} /> Lift Sanction
                  </button>
                </div>
              ) : <div />}
              <div className="flex items-center gap-2">
                {isStaff && (
                  <button
                    onClick={() => { setDeleteTarget(viewTarget); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                {isStaff && (
                  <button
                    onClick={() => { openEdit(viewTarget); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1E3A5F] border border-[#1E3A5F]/20 bg-[#1E3A5F]/5 rounded-lg hover:bg-[#1E3A5F]/10 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button onClick={() => setViewTarget(null)} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#111827]">Delete Sanction</h3>
                <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this sanction for <strong>{viewStudent?.full_name ?? "this student"}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? (<><Loader2 size={14} className="animate-spin" /> Deleting...</>) : (<><Trash2 size={14} /> Delete</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0"><Pencil size={20} className="text-[#1E3A5F]" /></div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Edit Sanction</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Update sanction details.</p>
                  </div>
                </div>
                <button type="button" onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditFormError("");
                  updateMutation.mutate({
                    id: editTarget.id,
                    data: {
                      severity: editForm.severity,
                      status: editForm.status,
                      penalty: editForm.penalty || null,
                      compliance_notes: editForm.compliance_notes || null,
                      end_date: editForm.end_date || null,
                      is_compliant: editForm.status === "served",
                    },
                  });
                }}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Status <span className="text-red-500">*</span></label>
                    <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="active">Active</option><option value="served">Served</option><option value="appealed">Appealed</option><option value="lifted">Lifted</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Sanction Level <span className="text-red-500">*</span></label>
                    <select value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="warning">Warning</option><option value="minor">Minor</option><option value="major">Major</option><option value="severe">Severe</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Penalty</label>
                    <div className="relative">
                      <Scale size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={editForm.penalty} onChange={(e) => setEditForm({ ...editForm, penalty: e.target.value })} placeholder="e.g. 3-day suspension" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date</label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Compliance Notes</label>
                    <span className={`text-[11px] ${(editForm.compliance_notes ?? "").length > 2000 ? "text-red-500" : "text-gray-400"}`}>{(editForm.compliance_notes ?? "").length}/2000</span>
                  </div>
                  <textarea rows={4} value={editForm.compliance_notes} onChange={(e) => setEditForm({ ...editForm, compliance_notes: e.target.value })} placeholder="Optional compliance notes..." className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                </div>

                {editFormError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle size={16} className="text-red-600 shrink-0" /> {editFormError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={updateMutation.isPending} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {updateMutation.isPending ? (<><Loader2 size={15} className="animate-spin" /> Saving...</>) : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
