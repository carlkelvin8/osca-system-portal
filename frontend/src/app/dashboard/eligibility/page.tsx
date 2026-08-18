"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { eligibilityApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { ShieldCheck, Plus, X, Loader2, Search, Download, FileText, CheckSquare, Check, ChevronDown, AlertCircle, CheckCircle2 } from "lucide-react";
import type { AthleteEligibility, PaginatedResponse, UserSummary } from "@/types";
import { exportToCSV, exportToPrintPDF } from "@/lib/exportUtils";

function getApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { detail?: unknown; errors?: Array<{ message?: string }> } | undefined;
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
    if (!err.response) return "Network error. Please check your connection and try again.";
    return `Request failed (${err.response.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

const STATUS_COLORS: Record<string, string> = {
  eligible: "bg-green-100 text-green-800",
  restricted: "bg-yellow-100 text-yellow-800",
  ineligible: "bg-red-100 text-red-800",
  pending_clearance: "bg-orange-100 text-orange-800",
};

const EMPTY_FORM = {
  student_id: "",
  status: "restricted",
  reason_type: "injury",
  reason_detail: "",
  start_date: "",
  end_date: "",
  notes: "",
};

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

export default function EligibilityPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === "admin" || user?.role === "director" || user?.role === "coach" || user?.role === "staff";
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<PaginatedResponse<AthleteEligibility>>({
    queryKey: ["eligibility"],
    queryFn: async () => (await eligibilityApi.list({ page_size: 100, current_only: true })).data,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showBanner = (type: "success" | "error", text: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner({ type, text });
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  };

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => eligibilityApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eligibility"] });
      setFormError("");
      setSuccessMsg("Eligibility record created successfully.");
      setTimeout(() => closeModal(), 1200);
    },
    onError: (e) => {
      setSuccessMsg("");
      setFormError(getApiError(e));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => eligibilityApi.update(id, data),
    onSuccess: (_d, vars) => {
      const name = items.find((i) => i.id === vars.id)?.student_full_name;
      queryClient.invalidateQueries({ queryKey: ["eligibility"] });
      showBanner("success", name ? `Clearance granted for ${name}.` : "Clearance granted.");
    },
    onError: (e) => showBanner("error", getApiError(e)),
  });

  const bulkClearMutation = useMutation({
    mutationFn: async () => {
      for (const id of selected) {
        await eligibilityApi.update(id, { medical_clearance: true, status: "eligible" });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["eligibility"] }); setSelected(new Set()); showBanner("success", `Clearance granted for ${selected.size} record${selected.size === 1 ? "" : "s"}.`); },
    onError: (e) => showBanner("error", getApiError(e)),
  });

  const { data: studentsData } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["eligibility-students"],
    queryFn: async () => (await eligibilityApi.listStudents({ page_size: 100, is_active: true })).data,
    enabled: isStaff,
  });

  const students = studentsData?.items ?? [];
  const selectedStudent = students.find((s) => s.id === form.student_id) ?? null;
  const studentOptions = students.filter((s) => {
    if (!studentQuery) return true;
    const q = studentQuery.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || (s.student_id ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const items = (data?.items ?? []).filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.student_full_name ?? "").toLowerCase().includes(q) ||
        (r.student_registered_id ?? "").toLowerCase().includes(q) ||
        (r.reason_detail?.toLowerCase().includes(q) ?? false) ||
        (r.reason_type?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((r) => r.id)));
  };

  const handleExportCSV = () => {
    exportToCSV(items.map((r) => ({ student_name: r.student_full_name ?? "", student_id: r.student_registered_id ?? "", status: r.status, reason_type: r.reason_type ?? "", reason_detail: r.reason_detail ?? "", start_date: r.start_date, end_date: r.end_date ?? "", clearance: r.medical_clearance ? "Yes" : "No" })), "eligibility_records");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-[#1E3A5F]" />
          <h1 className="text-xl font-bold text-[#111827]">Athlete Eligibility</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>
          <button onClick={() => exportToPrintPDF("Eligibility Records")} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"><FileText size={13} /> PDF</button>
          {isStaff && <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition-colors"><Plus size={14} /> Add Record</button>}
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student, reason..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg">
          <option value="">All Status</option>
          <option value="eligible">Eligible</option>
          <option value="restricted">Restricted</option>
          <option value="ineligible">Ineligible</option>
          <option value="pending_clearance">Pending Clearance</option>
        </select>
      </div>

      {selected.size > 0 && isStaff && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <CheckSquare size={16} className="text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
          <button onClick={() => bulkClearMutation.mutate()} disabled={bulkClearMutation.isPending} className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {bulkClearMutation.isPending ? "Processing..." : "Bulk Grant Clearance"}
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Clear</button>
        </div>
      )}

      {banner && (
        <div className={`flex items-center gap-2 px-3 py-2.5 mb-3 text-sm rounded-lg border ${banner.type === "success" ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
          {banner.type === "success" ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
          {banner.text}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-export-table>
            <thead className="bg-gray-50 border-b">
              <tr>
                {isStaff && <th className="px-3 py-3 w-10"><input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="rounded" /></th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Student ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clearance</th>
                {isStaff && <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={`border-b last:border-0 ${selected.has(r.id) ? "bg-blue-50" : ""}`}>
                  {isStaff && <td className="px-3 py-3"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded" /></td>}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{r.student_full_name ?? "Unknown student"}</div>
                    <div className="font-mono text-xs text-gray-500">{r.student_registered_id ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>{r.status.replace("_", " ")}</span></td>
                  <td className="px-4 py-3 text-gray-600">{r.reason_type && <span className="capitalize">{r.reason_type}</span>}{r.reason_detail && <span className="text-xs text-gray-400 ml-1">— {r.reason_detail}</span>}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.start_date} {r.end_date ? `→ ${r.end_date}` : "(ongoing)"}</td>
                  <td className="px-4 py-3">{r.medical_clearance ? <span className="text-xs text-green-600 font-medium">✓ Cleared</span> : <span className="text-xs text-gray-400">Pending</span>}</td>
                  {isStaff && <td className="px-4 py-3">{!r.medical_clearance && <button onClick={() => updateMutation.mutate({ id: r.id, data: { medical_clearance: true, status: "eligible" } })} disabled={updateMutation.isPending} className="text-xs text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed">Grant Clearance</button>}</td>}
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No records found.</td></tr>}
            </tbody>
          </table>
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
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0"><ShieldCheck size={20} className="text-[#1E3A5F]" /></div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Add Eligibility Record</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Create a new eligibility record for a student.</p>
                  </div>
                </div>
                <button type="button" onClick={closeModal} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
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
                        <span className="font-medium text-gray-800">{selectedStudent.full_name}</span>
                        <span className="text-xs text-gray-400">{selectedStudent.student_id ?? selectedStudent.email}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">Select a student</span>
                    )}
                    <ChevronDown size={16} className={`ml-auto text-gray-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
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
                            onClick={() => { setForm({ ...form, student_id: s.id }); setStudentQuery(""); setDropdownOpen(false); }}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="eligible">Eligible</option>
                      <option value="restricted">Restricted</option>
                      <option value="ineligible">Ineligible</option>
                      <option value="pending_clearance">Pending Clearance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason</label>
                    <select value={form.reason_type} onChange={(e) => setForm({ ...form, reason_type: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors">
                      <option value="injury">Injury</option>
                      <option value="medical">Medical</option>
                      <option value="disciplinary">Disciplinary</option>
                      <option value="academic">Academic</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Details</label>
                    <span className={`text-[11px] ${form.reason_detail.length > 500 ? "text-red-500" : "text-gray-400"}`}>{form.reason_detail.length}/500</span>
                  </div>
                  <textarea rows={4} value={form.reason_detail} onChange={(e) => setForm({ ...form, reason_detail: e.target.value })} placeholder="e.g. Torn ACL from basketball practice" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Date <span className="text-red-500">*</span></label>
                    <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">End Date</label>
                    <input type="date" value={form.end_date} disabled={!form.start_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors ${form.start_date ? "border-gray-200 bg-white hover:border-gray-300" : "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"}`} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Notes</label>
                    <span className={`text-[11px] ${form.notes.length > 1000 ? "text-red-500" : "text-gray-400"}`}>{form.notes.length}/1000</span>
                  </div>
                  <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional remarks (optional)" className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors" />
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
                    {createMutation.isPending ? (<><Loader2 size={15} className="animate-spin" /> Saving...</>) : (<><Plus size={15} /> Create Record</>)}
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
