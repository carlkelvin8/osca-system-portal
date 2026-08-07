"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { incidentsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { AlertTriangle, Plus, X, Loader2, Search, Download, FileText, CheckSquare, Check, ChevronDown, AlertCircle, CheckCircle2, Tag, Calendar, MapPin } from "lucide-react";
import type { Incident, PaginatedResponse, UserSummary } from "@/types";
import { format } from "date-fns";
import { exportToCSV, exportToPrintPDF } from "@/lib/exportUtils";

const SEVERITY_COLORS: Record<string, string> = { low: "bg-blue-100 text-blue-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };
const STATUS_COLORS: Record<string, string> = { open: "bg-red-100 text-red-700", under_review: "bg-yellow-100 text-yellow-700", resolved: "bg-green-100 text-green-700", closed: "bg-gray-100 text-gray-600" };

function getApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { detail?: unknown; errors?: Array<{ message?: string }>; message?: string; code?: string } | undefined;
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

const EMPTY_FORM = { title: "", description: "", category: "behavioral", severity: "medium", incident_date: "", location: "", involved_student_id: "" };

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

export default function IncidentsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = role === "admin" || role === "director" || role === "coach" || role === "staff";
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { data, isLoading } = useQuery<PaginatedResponse<Incident>>({ queryKey: ["incidents"], queryFn: async () => (await incidentsApi.list({ page_size: 100 })).data });
  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => incidentsApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setFormError("");
      setSuccessMsg("Incident report submitted successfully.");
      setTimeout(() => closeModal(), 1200);
    },
    onError: (e) => {
      setSuccessMsg("");
      setFormError(getApiError(e));
    },
  });
  const updateMutation = useMutation({ mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => incidentsApi.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); setSelected(new Set()); } });

  const bulkResolveMutation = useMutation({
    mutationFn: async () => { for (const id of selected) await incidentsApi.update(id, { status: "resolved", resolution: "Bulk resolved by admin" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incidents"] }); setSelected(new Set()); },
  });

  const { data: studentsData } = useQuery<PaginatedResponse<UserSummary>>({ queryKey: ["students-list"], queryFn: async () => (await usersApi.list({ role: "student", page_size: 100, is_active: true })).data, enabled: isStaff });

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

  const students = studentsData?.items ?? [];
  const selectedStudent = students.find((s) => s.id === form.involved_student_id) ?? null;
  const studentOptions = students.filter((s) => {
    if (!studentQuery) return true;
    const q = studentQuery.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || (s.student_id ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const items = (data?.items ?? []).filter((inc) => {
    if (statusFilter && inc.status !== statusFilter) return false;
    if (categoryFilter && inc.category !== categoryFilter) return false;
    if (search) { const q = search.toLowerCase(); return inc.title.toLowerCase().includes(q) || inc.description.toLowerCase().includes(q) || (inc.location?.toLowerCase().includes(q) ?? false); }
    return true;
  });

  const toggleSelect = (id: string) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const toggleAll = () => { selected.size === items.length ? setSelected(new Set()) : setSelected(new Set(items.map((r) => r.id))); };
  const handleExportCSV = () => { exportToCSV(items.map((i) => ({ title: i.title, category: i.category, severity: i.severity, status: i.status, date: i.incident_date, location: i.location ?? "" })), "incidents"); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3"><AlertTriangle size={22} className="text-[#1E3A5F]" /><h1 className="text-xl font-bold text-[#111827]">Incident Reports</h1></div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>
          <button onClick={() => exportToPrintPDF("Incident Reports")} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><FileText size={13} /> PDF</button>
          {isStaff && <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition-colors"><Plus size={14} /> Report Incident</button>}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" /></div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="">All Status</option><option value="open">Open</option><option value="under_review">Under Review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg"><option value="">All Categories</option><option value="injury">Injury</option><option value="equipment_damage">Equipment Damage</option><option value="facility_damage">Facility Damage</option><option value="behavioral">Behavioral</option><option value="safety">Safety</option><option value="other">Other</option></select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && isStaff && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <CheckSquare size={16} className="text-blue-600" /><span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
          <button onClick={() => bulkResolveMutation.mutate()} disabled={bulkResolveMutation.isPending} className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">{bulkResolveMutation.isPending ? "Processing..." : "Bulk Resolve"}</button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div> : (
        <div className="space-y-3" data-export-table>
          {items.map((inc) => (
            <div key={inc.id} className={`bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition ${selected.has(inc.id) ? "ring-2 ring-blue-300" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {isStaff && <input type="checkbox" checked={selected.has(inc.id)} onChange={() => toggleSelect(inc.id)} className="rounded mt-1" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-[#111827]">{inc.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[inc.severity]}`}>{inc.severity}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inc.status]}`}>{inc.status.replace("_", " ")}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{inc.description}</p>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>📁 {inc.category.replace("_", " ")}</span>
                      <span>📅 {format(new Date(inc.incident_date), "MMM d, yyyy")}</span>
                      {inc.location && <span>📍 {inc.location}</span>}
                    </div>
                  </div>
                </div>
                {isStaff && inc.status === "open" && (
                  <div className="flex gap-2 ml-4 shrink-0">
                    <button onClick={() => updateMutation.mutate({ id: inc.id, data: { status: "under_review" } })} className="text-xs px-3 py-1 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100">Review</button>
                    <button onClick={() => updateMutation.mutate({ id: inc.id, data: { status: "resolved", resolution: "Resolved" } })} className="text-xs px-3 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">Resolve</button>
                  </div>
                )}
              </div>
              {inc.resolution && <div className="mt-3 p-2 bg-green-50 rounded-lg text-xs text-green-700"><strong>Resolution:</strong> {inc.resolution}</div>}
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-12 text-gray-400">No incidents found.</div>}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-150 ${mounted && !closing ? "opacity-100" : "opacity-0"}`}
        >
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl transition-all duration-150 ${mounted && !closing ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-[0.98]"}`}>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0"><AlertTriangle size={20} className="text-[#1E3A5F]" /></div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Report Incident</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Create and submit a new incident report.</p>
                  </div>
                </div>
                <button type="button" onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...form, incident_date: new Date(form.incident_date).toISOString(), involved_student_id: form.involved_student_id || null }); }} className="space-y-5">
                {/* Row 1: Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Incident Title <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Student injured during basketball practice" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                  </div>
                </div>

                {/* Row 2: Category + Severity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Incident Category <span className="text-red-500">*</span></label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="injury">Injury</option><option value="equipment_damage">Equipment Damage</option><option value="facility_damage">Facility Damage</option><option value="behavioral">Behavioral</option><option value="safety">Safety</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Severity Level <span className="text-red-500">*</span></label>
                    <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                {/* Row 3: Date & Time + Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Date & Time <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="datetime-local" required value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
                    <div className="relative">
                      <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Upper Gym" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                    </div>
                  </div>
                </div>

                {/* Row 4: Involved Student */}
                <div ref={dropdownRef} className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Involved Student</label>
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
                      <span className="text-gray-400">Select a student (optional)</span>
                    )}
                    <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            autoFocus
                            value={studentQuery}
                            onChange={(e) => setStudentQuery(e.target.value)}
                            placeholder="Search name or student ID..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
                          />
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {studentOptions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setForm({ ...form, involved_student_id: s.id }); setStudentQuery(""); setDropdownOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left"
                          >
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

                {/* Row 5: Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Incident Description <span className="text-red-500">*</span></label>
                    <span className={`text-[11px] ${form.description.length > 3000 ? "text-red-500" : "text-gray-400"}`}>{form.description.length}/3000</span>
                  </div>
                  <textarea rows={5} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe what happened, who was involved, and any other relevant details..." className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
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
                    {createMutation.isPending ? (<><Loader2 size={15} className="animate-spin" /> Submitting...</>) : (<><Plus size={15} /> Submit Report</>)}
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
