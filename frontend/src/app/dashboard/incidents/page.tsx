"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { incidentsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AlertTriangle,
  Plus,
  X,
  Loader2,
  Search,
  Download,
  FileText,
  CheckSquare,
  Check,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Tag,
  Calendar,
  MapPin,
  Eye,
  Pencil,
  Clock,
  User,
  Info,
  Trash2,
} from "lucide-react";
import type { Incident, PaginatedResponse, UserSummary } from "@/types";
import { format } from "date-fns";
import { exportToCSV, exportToPrintPDF } from "@/lib/exportUtils";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 border border-blue-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-orange-50 text-orange-700 border border-orange-200",
  critical: "bg-red-50 text-red-700 border border-red-200",
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-50 text-red-700 border border-red-200",
  under_review: "bg-amber-50 text-amber-700 border border-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  closed: "bg-gray-50 text-gray-600 border border-gray-200",
};
const CATEGORY_COLORS: Record<string, string> = {
  injury: "bg-rose-50 text-rose-700 border border-rose-200",
  equipment_damage: "bg-violet-50 text-violet-700 border border-violet-200",
  facility_damage: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  behavioral: "bg-amber-50 text-amber-700 border border-amber-200",
  safety: "bg-red-50 text-red-700 border border-red-200",
  other: "bg-gray-50 text-gray-600 border border-gray-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  injury: "Injury",
  equipment_damage: "Equipment Damage",
  facility_damage: "Facility Damage",
  behavioral: "Behavioral",
  safety: "Safety",
  other: "Other",
};
const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  under_review: "Under Review",
  resolved: "Resolved",
  closed: "Closed",
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

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "behavioral",
  severity: "medium",
  incident_date: "",
  location: "",
  involved_student_id: "",
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
    return (
      <img
        src={s.profile_picture_url}
        alt={s.full_name}
        onError={() => setImgError(true)}
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    );
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

  const [viewTarget, setViewTarget] = useState<Incident | null>(null);
  const [editTarget, setEditTarget] = useState<Incident | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [editFormError, setEditFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Incident>>({
    queryKey: ["incidents"],
    queryFn: async () => (await incidentsApi.list({ page_size: 100 })).data,
  });

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => incidentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(new Set());
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => incidentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setDeleteTarget(null);
      setViewTarget(null);
    },
  });

  const bulkResolveMutation = useMutation({
    mutationFn: async () => {
      for (const id of selected) await incidentsApi.update(id, { status: "resolved", resolution: "Bulk resolved by admin" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setSelected(new Set());
    },
  });

  const { data: studentsData } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["students-list"],
    queryFn: async () => (await usersApi.list({ role: "student", page_size: 100, is_active: true })).data,
    enabled: isStaff,
  });

  const [involvedStudent, setInvolvedStudent] = useState<UserSummary | null>(null);

  useEffect(() => {
    if (!viewTarget?.involved_student_id) {
      setInvolvedStudent(null);
      return;
    }
    let cancelled = false;
    usersApi
      .get(viewTarget.involved_student_id)
      .then((res) => {
        if (!cancelled) setInvolvedStudent(res.data as UserSummary);
      })
      .catch(() => {
        if (!cancelled) setInvolvedStudent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewTarget?.involved_student_id]);

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

  const openEdit = (inc: Incident) => {
    setEditTarget(inc);
    setEditForm({
      title: inc.title,
      description: inc.description,
      category: inc.category,
      severity: inc.severity,
      incident_date: inc.incident_date ? format(new Date(inc.incident_date), "yyyy-MM-dd'T'HH:mm") : "",
      location: inc.location ?? "",
      involved_student_id: inc.involved_student_id ?? "",
    });
    setEditFormError("");
  };

  const students = studentsData?.items ?? [];
  const selectedStudent = students.find((s) => s.id === form.involved_student_id) ?? null;
  const studentOptions = students.filter((s) => {
    if (!studentQuery) return true;
    const q = studentQuery.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.student_id ?? "").toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  const items = (data?.items ?? []).filter((inc) => {
    if (statusFilter && inc.status !== statusFilter) return false;
    if (categoryFilter && inc.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inc.title.toLowerCase().includes(q) ||
        inc.description.toLowerCase().includes(q) ||
        (inc.location?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const handleExportCSV = () => {
    exportToCSV(
      items.map((i) => ({
        title: i.title,
        category: i.category,
        severity: i.severity,
        status: i.status,
        date: i.incident_date,
        location: i.location ?? "",
      })),
      "incidents"
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle size={22} className="text-[#1E3A5F]" />
          <h1 className="text-xl font-bold text-[#111827]">Incident Reports</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => exportToPrintPDF("Incident Reports")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <FileText size={13} /> PDF
          </button>
          {isStaff && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition-colors"
            >
              <Plus size={14} /> Report Incident
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg"
        >
          <option value="">All Categories</option>
          <option value="injury">Injury</option>
          <option value="equipment_damage">Equipment Damage</option>
          <option value="facility_damage">Facility Damage</option>
          <option value="behavioral">Behavioral</option>
          <option value="safety">Safety</option>
          <option value="other">Other</option>
        </select>
      </div>

      {selected.size > 0 && isStaff && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <CheckSquare size={16} className="text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">{selected.size} selected</span>
          <button
            onClick={() => bulkResolveMutation.mutate()}
            disabled={bulkResolveMutation.isPending}
            className="ml-auto px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {bulkResolveMutation.isPending ? "Processing..." : "Bulk Resolve"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <div className="space-y-3" data-export-table>
          {items.map((inc) => (
            <div
              key={inc.id}
              onClick={() => setViewTarget(inc)}
              className={`bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all duration-200 ${selected.has(inc.id) ? "ring-2 ring-blue-300" : ""}`}
            >
              <div className="flex items-start gap-4">
                {isStaff && (
                  <input
                    type="checkbox"
                    checked={selected.has(inc.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect(inc.id);
                    }}
                    className="rounded mt-1 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-[#111827] leading-snug mb-1">{inc.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-1 mb-3">{inc.description}</p>

                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[inc.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                      {STATUS_LABELS[inc.status] ?? inc.status}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${SEVERITY_COLORS[inc.severity]}`}>
                      {SEVERITY_LABELS[inc.severity] ?? inc.severity}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[inc.category]}`}>
                      {CATEGORY_LABELS[inc.category] ?? inc.category.replace("_", " ")}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={12} />
                      {format(new Date(inc.incident_date), "MMM d, yyyy · h:mm a")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={12} />
                      {inc.location || "Not specified"}
                    </span>
                    {inc.involved_student_id && (
                      <span className="inline-flex items-center gap-1.5">
                        <User size={12} />
                        Student involved
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-12 text-gray-400">No incidents found.</div>}
        </div>
      )}

      {showAdd && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 transition-opacity duration-150 ${mounted && !closing ? "opacity-100" : "opacity-0"}`}
        >
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl transition-all duration-150 ${mounted && !closing ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-3 scale-[0.98]"}`}
          >
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} className="text-[#1E3A5F]" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Report Incident</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Create and submit a new incident report.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate({
                    ...form,
                    incident_date: new Date(form.incident_date).toISOString(),
                    involved_student_id: form.involved_student_id || null,
                  });
                }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Incident Title <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      required
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Student injured during basketball practice"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Incident Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    >
                      <option value="injury">Injury</option>
                      <option value="equipment_damage">Equipment Damage</option>
                      <option value="facility_damage">Facility Damage</option>
                      <option value="behavioral">Behavioral</option>
                      <option value="safety">Safety</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Severity Level <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.severity}
                      onChange={(e) => setForm({ ...form, severity: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Date & Time <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="datetime-local"
                        required
                        value={form.incident_date}
                        onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
                    <div className="relative">
                      <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={form.location}
                        onChange={(e) => setForm({ ...form, location: e.target.value })}
                        placeholder="e.g. Upper Gym"
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                      />
                    </div>
                  </div>
                </div>

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
                          <div className="text-xs text-gray-400 truncate">
                            {selectedStudent.student_id ?? selectedStudent.email}
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">Select a student (optional)</span>
                    )}
                    <ChevronDown
                      size={16}
                      className={`ml-auto text-gray-400 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`}
                    />
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
                            onClick={() => {
                              setForm({ ...form, involved_student_id: s.id });
                              setStudentQuery("");
                              setDropdownOpen(false);
                            }}
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
                        {studentOptions.length === 0 && (
                          <div className="px-4 py-6 text-center text-sm text-gray-400">No students found.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      Incident Description <span className="text-red-500">*</span>
                    </label>
                    <span
                      className={`text-[11px] ${form.description.length > 3000 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {form.description.length}/3000
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe what happened, who was involved, and any other relevant details..."
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                  />
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
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 size={15} className="animate-spin" /> Submitting...
                      </>
                    ) : (
                      <>
                        <Plus size={15} /> Submit Report
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {viewTarget && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0">
                  <Eye size={18} className="text-[#1E3A5F]" />
                </div>
                <h2 className="font-bold text-lg text-[#111827]">Incident Details</h2>
              </div>
              <button
                onClick={() => setViewTarget(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
              <div>
                <h3 className="text-base font-bold text-[#111827] mb-2">{viewTarget.title}</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[viewTarget.status]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                    {STATUS_LABELS[viewTarget.status] ?? viewTarget.status}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${SEVERITY_COLORS[viewTarget.severity]}`}
                  >
                    {SEVERITY_LABELS[viewTarget.severity] ?? viewTarget.severity}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[viewTarget.category]}`}
                  >
                    {CATEGORY_LABELS[viewTarget.category] ?? viewTarget.category.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{viewTarget.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date & Time</label>
                  <p className="mt-1 text-sm text-gray-700 flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" />
                    {format(new Date(viewTarget.incident_date), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</label>
                  <p className="mt-1 text-sm text-gray-700 flex items-center gap-1.5">
                    <MapPin size={13} className="text-gray-400" />
                    {viewTarget.location || "Not specified"}
                  </p>
                </div>
              </div>

              {involvedStudent && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Involved Student</label>
                  <div className="mt-2 flex items-center gap-3">
                    <StudentAvatar s={involvedStudent} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate">{involvedStudent.full_name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {involvedStudent.student_id ?? involvedStudent.email}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {viewTarget.involved_student_id && !involvedStudent && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Involved Student</label>
                  <p className="mt-1 text-sm text-gray-500 flex items-center gap-1.5">
                    <User size={13} className="text-gray-400" />
                    Student record unavailable
                  </p>
                </div>
              )}

              {viewTarget.resolution && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <label className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Resolution</label>
                  <p className="mt-1 text-sm text-emerald-700">{viewTarget.resolution}</p>
                  {viewTarget.resolved_at && (
                    <p className="mt-1 text-xs text-emerald-500">
                      Resolved {format(new Date(viewTarget.resolved_at), "MMM d, yyyy · h:mm a")}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              {isStaff && viewTarget.status !== "resolved" && viewTarget.status !== "closed" ? (
                <div className="flex items-center gap-2">
                  {viewTarget.status === "open" && (
                    <button
                      onClick={() => {
                        updateMutation.mutate({ id: viewTarget.id, data: { status: "under_review" } });
                        setViewTarget(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      <Clock size={13} /> Mark Under Review
                    </button>
                  )}
                  <button
                    onClick={() => {
                      updateMutation.mutate({ id: viewTarget.id, data: { status: "resolved", resolution: "Resolved" } });
                      setViewTarget(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Resolve
                  </button>
                </div>
              ) : isStaff && viewTarget.status === "resolved" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      updateMutation.mutate({ id: viewTarget.id, data: { status: "open" } });
                      setViewTarget(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <AlertCircle size={13} /> Reopen
                  </button>
                  <button
                    onClick={() => {
                      updateMutation.mutate({ id: viewTarget.id, data: { status: "closed" } });
                      setViewTarget(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Check size={13} /> Close
                  </button>
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                {isStaff && (
                  <button
                    onClick={() => {
                      setDeleteTarget(viewTarget);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                {isStaff && (
                  <button
                    onClick={() => {
                      openEdit(viewTarget);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#1E3A5F] border border-[#1E3A5F]/20 bg-[#1E3A5F]/5 rounded-lg hover:bg-[#1E3A5F]/10 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}
                <button
                  onClick={() => setViewTarget(null)}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-[#111827]">Delete Incident</h3>
                <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.title}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditTarget(null);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1E3A5F]/10 flex items-center justify-center shrink-0">
                    <Pencil size={20} className="text-[#1E3A5F]" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-[#111827]">Edit Incident</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Update the incident report details.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="border-t border-gray-100 my-4" />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditFormError("");
                  updateMutation.mutate({
                    id: editTarget.id,
                    data: {
                      ...editForm,
                      incident_date: new Date(editForm.incident_date).toISOString(),
                      involved_student_id: editForm.involved_student_id || null,
                    },
                  });
                }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Incident Title <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      required
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    >
                      <option value="injury">Injury</option>
                      <option value="equipment_damage">Equipment Damage</option>
                      <option value="facility_damage">Facility Damage</option>
                      <option value="behavioral">Behavioral</option>
                      <option value="safety">Safety</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Severity <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editForm.severity}
                      onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Date & Time <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="datetime-local"
                        required
                        value={editForm.incident_date}
                        onChange={(e) => setEditForm({ ...editForm, incident_date: e.target.value })}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
                    <div className="relative">
                      <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                        placeholder="e.g. Upper Gym"
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <span
                      className={`text-[11px] ${editForm.description.length > 3000 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {editForm.description.length}/3000
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    required
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 transition-colors"
                  />
                </div>

                {editFormError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle size={16} className="text-red-600 shrink-0" /> {editFormError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditTarget(null)}
                    className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 size={15} className="animate-spin" /> Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
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
