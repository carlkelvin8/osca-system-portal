"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { CalendarCheck, Plus, X, Loader2, Users, ClipboardList, CheckCircle2, XCircle, Clock, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { Session, ActivityType, AttendanceRecord, PaginatedResponse } from "@/types";
import { format } from "date-fns";

// ── Sport / Art options ──────────────────────────────────────────────────────────

const SPORTS_OPTIONS: { group: string; items: string[] }[] = [
  {
    group: "Sports",
    items: [
      "Arnis",
      "Badminton",
      "Basketball",
      "Sepak Takraw",
      "Table Tennis",
      "Taekwondo",
      "Volleyball Men",
      "Volleyball Women",
    ],
  },
  {
    group: "Cultural Affairs",
    items: [
      "Hataw Himpapawid Dance Group",
      "Himig Himpapawid Chorale",
      "Musikang Himpapawid Live Band",
    ],
  },
];

// ── Searchable Sport/Art Combobox ──────────────────────────────────────────────

function SportArtCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = SPORTS_OPTIONS.map((g) => ({
    group: g.group,
    items: g.items.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search sport / art…"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {filtered.map((g) => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {g.group}
              </p>
              {g.items.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    onChange(item);
                    setQuery(item);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New Session Modal ──────────────────────────────────────────────────────────

interface SessionFormData {
  name: string;
  activity_type: ActivityType;
  sport_or_art: string;
  venue: string;
  scheduled_start: string;
  scheduled_end: string;
  grace_period_minutes: number;
  notes: string;
}

const EMPTY_FORM: SessionFormData = {
  name: "",
  activity_type: "practice",
  sport_or_art: "",
  venue: "",
  scheduled_start: "",
  scheduled_end: "",
  grace_period_minutes: 0,
  notes: "",
};

const ACTIVITY_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "practice",    label: "Practice" },
  { value: "training",    label: "Training" },
  { value: "competition", label: "Competition" },
  { value: "event",       label: "Event" },
  { value: "other",       label: "Other" },
];

interface NewSessionModalProps {
  onClose: () => void;
  defaultSport?: string;
}

function NewSessionModal({ onClose, defaultSport }: NewSessionModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SessionFormData>({
    ...EMPTY_FORM,
    ...(defaultSport ? { sport_or_art: defaultSport } : {}),
  });
  const [error, setError] = useState<string | null>(null);

  const { mutate: createSession, isPending } = useMutation({
    mutationFn: () =>
      attendanceApi.createSession({
        name: form.name,
        activity_type: form.activity_type,
        sport_or_art: defaultSport || form.sport_or_art || null,
        venue: form.venue || null,
        scheduled_start: new Date(form.scheduled_start).toISOString(),
        scheduled_end: new Date(form.scheduled_end).toISOString(),
        grace_period_minutes: form.grace_period_minutes,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to create session. Please check all fields and try again.";
      setError(msg);
    },
  });

  const set = (field: keyof SessionFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("Session name is required."); return; }
    if (!form.scheduled_start) { setError("Start date/time is required."); return; }
    if (!form.scheduled_end)   { setError("End date/time is required."); return; }
    if (new Date(form.scheduled_end) <= new Date(form.scheduled_start)) {
      setError("End time must be after start time."); return;
    }
    createSession();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Session</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Session name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Morning Practice — Basketball"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>

          {/* Activity type + Sport/Art side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Activity Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.activity_type}
                onChange={set("activity_type")}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] bg-white"
              >
                {ACTIVITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sport / Art</label>
              {defaultSport ? (
                <input
                  type="text"
                  value={defaultSport}
                  readOnly
                  disabled
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  title="Coaches can only create sessions for their assigned sport/art"
                />
              ) : (
                <SportArtCombobox
                  value={form.sport_or_art}
                  onChange={(v) => setForm((f) => ({ ...f, sport_or_art: v }))}
                />
              )}
            </div>
          </div>

          {/* Venue */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <input
              type="text"
              value={form.venue}
              onChange={set("venue")}
              placeholder="e.g. NAAP Gymnasium"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>

          {/* Start / End datetimes side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attendance Start <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_start}
                onChange={set("scheduled_start")}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attendance End <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_end}
                onChange={set("scheduled_end")}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
              />
            </div>
          </div>

          {/* Grace Period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grace Period <span className="text-xs text-gray-400 font-normal">(minutes)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={120}
                value={form.grace_period_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, grace_period_minutes: Math.max(0, Number(e.target.value)) }))
                }
                className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
              />
              <p className="text-xs text-gray-400">
                Students who scan within this period after start time are marked <span className="font-medium text-green-600">PRESENT</span>.
                Beyond this period they are marked <span className="font-medium text-amber-600">LATE</span>.
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Session Modal ─────────────────────────────────────────────────────────

interface EditSessionFormData {
  name: string;
  activity_type: ActivityType;
  sport_or_art: string;
  venue: string;
  scheduled_start: string;
  scheduled_end: string;
  grace_period_minutes: number;
  notes: string;
}

interface EditSessionModalProps {
  session: Session;
  onClose: () => void;
  isCoach?: boolean;
}

function EditSessionModal({ session, onClose, isCoach = false }: EditSessionModalProps) {
  const queryClient = useQueryClient();
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [form, setForm] = useState<EditSessionFormData>({
    name: session.name,
    activity_type: session.activity_type,
    sport_or_art: session.sport_or_art ?? "",
    venue: session.venue ?? "",
    scheduled_start: toLocal(session.scheduled_start),
    scheduled_end: toLocal(session.scheduled_end),
    grace_period_minutes: session.grace_period_minutes,
    notes: session.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const { mutate: updateSession, isPending } = useMutation({
    mutationFn: () =>
      attendanceApi.updateSession(session.id, {
        name: form.name,
        activity_type: form.activity_type,
        sport_or_art: isCoach ? session.sport_or_art : form.sport_or_art || null,
        venue: form.venue || null,
        scheduled_start: new Date(form.scheduled_start).toISOString(),
        scheduled_end: new Date(form.scheduled_end).toISOString(),
        grace_period_minutes: form.grace_period_minutes,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to update session.";
      setError(msg);
    },
  });

  const set = (field: keyof EditSessionFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("Session name is required."); return; }
    if (!form.scheduled_start) { setError("Start date/time is required."); return; }
    if (!form.scheduled_end) { setError("End date/time is required."); return; }
    if (new Date(form.scheduled_end) <= new Date(form.scheduled_start)) {
      setError("End time must be after start time."); return;
    }
    updateSession();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Edit Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={set("name")} placeholder="e.g. Morning Practice — Basketball" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type <span className="text-red-500">*</span></label>
              <select value={form.activity_type} onChange={set("activity_type")} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] bg-white">
                {ACTIVITY_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sport / Art</label>
              {isCoach ? (
                <input
                  type="text"
                  value={session.sport_or_art ?? ""}
                  readOnly
                  disabled
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  title="Coaches can only manage sessions for their assigned sport/art"
                />
              ) : (
                <SportArtCombobox value={form.sport_or_art} onChange={(v) => setForm((f) => ({ ...f, sport_or_art: v }))} />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
            <input type="text" value={form.venue} onChange={set("venue")} placeholder="e.g. NAAP Gymnasium" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attendance Start <span className="text-red-500">*</span></label>
              <input type="datetime-local" value={form.scheduled_start} onChange={set("scheduled_start")} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Attendance End <span className="text-red-500">*</span></label>
              <input type="datetime-local" value={form.scheduled_end} onChange={set("scheduled_end")} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period <span className="text-xs text-gray-400 font-normal">(minutes)</span></label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={120} value={form.grace_period_minutes} onChange={(e) => setForm((f) => ({ ...f, grace_period_minutes: Math.max(0, Number(e.target.value)) }))} className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]" />
              <p className="text-xs text-gray-400">Students who scan within this period after start time are marked <span className="font-medium text-green-600">PRESENT</span>. Beyond this period they are marked <span className="font-medium text-amber-600">LATE</span>.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Optional notes…" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] resize-none" />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">Cancel</button>
            <button type="submit" disabled={isPending} className="flex items-center gap-2 px-5 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50 disabled:cursor-not-allowed font-medium">
              {isPending ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCoach = user?.role === "coach";
  const isStudent = user?.role === "student";
  const isPE = user?.role === "pe_instructor";
  const userSport = (isCoach ? user?.assigned_sport : user?.sport_or_art) ?? undefined;

  // PE Instructors are not allowed in the attendance module
  useEffect(() => {
    if (isPE) {
      router.replace("/dashboard");
    }
  }, [isPE, router]);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [showNewSession, setShowNewSession] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [endingSession, setEndingSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"sessions" | "history">("sessions");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "daily" | "weekly" | "monthly">("all");

  const { data, isLoading } = useQuery<PaginatedResponse<Session>>({
    queryKey: ["sessions", page, userSport, isStudent],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if ((isCoach || isStudent) && userSport) params.sport_or_art = userSport;
      const res = await attendanceApi.listSessions(params);
      return res.data;
    },
  });

  // Student: fetch own attendance history
  const historyQueryParams = (() => {
    const p: Record<string, string | number | boolean> = { page: historyPage, page_size: 20 };
    const now = new Date();
    if (historyFilter === "daily") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      p.date_from = start.toISOString();
    } else if (historyFilter === "weekly") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      p.date_from = start.toISOString();
    } else if (historyFilter === "monthly") {
      const start = new Date(now);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      p.date_from = start.toISOString();
    }
    return p;
  })();
  const { data: historyData, isLoading: historyLoading } = useQuery<PaginatedResponse<AttendanceRecord>>({
    queryKey: ["my-attendance", user?.id, historyPage, historyFilter],
    queryFn: async () => {
      const res = await attendanceApi.getRecords(historyQueryParams);
      return res.data;
    },
    enabled: isStudent && !!user?.id,
  });

  // Filter records by search text
  const filteredHistory = (historyData?.items ?? []).filter((rec) => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      rec.session_name?.toLowerCase().includes(q) ||
      rec.session_sport_or_art?.toLowerCase().includes(q) ||
      (rec.time_in && new Date(rec.time_in).toLocaleDateString().includes(q)) ||
      rec.status?.toLowerCase().includes(q)
    );
  });

  const historyTotalPages = historyData?.pages ?? 1;

  const activityColors: Record<string, string> = {
    practice:    "bg-blue-50 text-blue-700 border border-blue-200",
    competition: "bg-red-50 text-red-700 border border-red-200",
    training:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
    event:       "bg-purple-50 text-purple-700 border border-purple-200",
    other:       "bg-gray-50 text-gray-700 border border-gray-200",
  };

  const totalPages = data?.pages ?? 1;
  const totalSessions = data?.total ?? 0;
  const activeSessions = data?.items?.filter(s => s.is_active).length ?? 0;
  const totalAttendance = data?.items?.reduce((sum, s) => sum + s.attendance_count, 0) ?? 0;

  const { mutate: endSession, isPending: isEnding } = useMutation({
    mutationFn: (id: string) => attendanceApi.endSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setEndingSession(null);
    },
  });

  return (
    <>
      {showNewSession && <NewSessionModal onClose={() => setShowNewSession(false)} defaultSport={userSport} />}
      {editingSession && (
        <EditSessionModal session={editingSession} onClose={() => setEditingSession(null)} isCoach={isCoach} />
      )}
      {endingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEndingSession(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
              <XCircle size={24} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">End Session?</h2>
            <p className="text-sm text-gray-500 mt-2">
              This will close <strong>{endingSession.name}</strong>. Students will no longer be able to scan in.
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setEndingSession(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => endSession(endingSession.id)}
                disabled={isEnding}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isEnding ? <><Loader2 size={14} className="animate-spin" /> Closing…</> : "Yes, End Session"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
              <div className="w-9 h-9 bg-[#1E3A5F]/10 rounded-xl flex items-center justify-center">
                <CalendarCheck size={18} className="text-[#1E3A5F]" />
              </div>
              Attendance
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {(isCoach || isStudent) && userSport
                ? `Sessions for ${userSport}`
                : "Manage sessions and track attendance records"}
            </p>
          </div>
          <div className="flex gap-2">
            {isCoach && (
              <Link
                href="/dashboard/attendance/roster"
                className="flex items-center gap-2 px-4 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition font-medium text-gray-700"
              >
                <Users size={16} /> Roster
              </Link>
            )}
            {!isStudent && (
              <button
                onClick={() => setShowNewSession(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm bg-gradient-to-r from-[#1E3A5F] to-[#2d4a73] text-white rounded-xl hover:from-[#16304f] hover:to-[#1E3A5F] transition shadow-md shadow-[#1E3A5F]/20 font-medium"
              >
                <Plus size={16} /> New Session
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {!isStudent && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Sessions</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{totalSessions}</p>
                </div>
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><CalendarCheck size={20} className="text-blue-600" /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Active Now</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{activeSessions}</p>
                </div>
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center"><CheckCircle2 size={20} className="text-emerald-600" /></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Scans</p>
                  <p className="text-2xl font-bold text-[#1E3A5F] mt-1">{totalAttendance}</p>
                </div>
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center"><Users size={20} className="text-indigo-600" /></div>
              </div>
            </div>
          </div>
        )}

        {/* Student tabs */}
        {isStudent && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab("sessions")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-medium transition ${
                activeTab === "sessions" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <CalendarCheck size={14} /> Sessions
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md font-medium transition ${
                activeTab === "history" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ClipboardList size={14} /> My Attendance
            </button>
          </div>
        )}

        {/* ── Sessions tab (default for all, or when tab = sessions) ── */}
        {(!isStudent || activeTab === "sessions") && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-[#1E3A5F] to-[#2d4a73] text-white">
                    <th className="px-5 py-3.5 text-left font-semibold text-[11px] uppercase tracking-wider">Session Name</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-[11px] uppercase tracking-wider">Activity</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-[11px] uppercase tracking-wider">Sport/Art</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-[11px] uppercase tracking-wider">Date & Time</th>
                    <th className="px-5 py-3.5 text-center font-semibold text-[11px] uppercase tracking-wider">Attendance</th>
                    <th className="px-5 py-3.5 text-center font-semibold text-[11px] uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3.5 text-center font-semibold text-[11px] uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        <Loader2 size={20} className="animate-spin inline-block mr-2" />Loading…
                      </td>
                    </tr>
                  ) : (data?.items ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                        No sessions yet.{!isStudent && (
                          <button onClick={() => setShowNewSession(true)} className="ml-1 text-[#1E3A5F] underline underline-offset-2">
                            Create the first one.
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (data?.items ?? []).map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <CalendarCheck size={16} className="text-gray-400" />
                          {session.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${activityColors[session.activity_type] ?? ""}`}>
                          {session.activity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{session.sport_or_art ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {format(new Date(session.scheduled_start), "MMM d, yyyy · h:mm a")}
                        {session.grace_period_minutes > 0 && (
                          <span className="block text-[10px] text-amber-500 mt-0.5">
                            Grace: {session.grace_period_minutes}min
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-[#1E3A5F]">
                        {session.attendance_count}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${session.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-50 text-gray-500 border border-gray-200"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${session.is_active ? "bg-emerald-500" : "bg-gray-400"}`} />
                          {session.is_active ? "Active" : "Closed"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isStudent ? (
                          <button
                            onClick={() => router.push(`/dashboard/attendance/${session.id}/scan`)}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          >
                            Scan In
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => router.push(`/dashboard/attendance/${session.id}`)}
                              className="px-3 py-1 text-xs bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
                            >
                              Monitor
                            </button>
                            <button
                              onClick={() => setEditingSession(session)}
                              className="px-3 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                            >
                              Edit
                            </button>
                            {session.is_active && (
                              <button
                                onClick={() => setEndingSession(session)}
                                className="px-3 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition"
                              >
                                End
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Previous
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* ── My Attendance History tab (students only) ── */}
        {isStudent && activeTab === "history" && (
          <div className="space-y-4">
            {/* Filter + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {(["all", "daily", "weekly", "monthly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setHistoryFilter(f); setHistoryPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition capitalize ${
                      historyFilter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search by session, sport, date…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#1E3A5F] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Attendance Date</th>
                    <th className="px-4 py-3 text-left font-medium">Sport / Art</th>
                    <th className="px-4 py-3 text-left font-medium">Attendance Session</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                    <th className="px-4 py-3 text-center font-medium">Time In</th>
                    <th className="px-4 py-3 text-center font-medium">Time Out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        <Loader2 size={20} className="animate-spin inline-block mr-2" />Loading…
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                        {historySearch ? "No records match your search." : "No attendance records yet. Scan in to a session to record attendance."}
                      </td>
                    </tr>
                  ) : filteredHistory.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {record.time_in ? format(new Date(record.time_in), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {record.session_sport_or_art || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <CalendarCheck size={14} className="text-gray-400" />
                          {record.session_name || "Session"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {record.time_in ? (
                          record.status === "late" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <Clock size={11} /> Late
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle2 size={11} /> Present
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircle size={11} /> Absent
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        {record.time_in ? format(new Date(record.time_in), "h:mm a") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        {record.time_out ? format(new Date(record.time_out), "h:mm a") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {historyTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Previous
                </button>
                <span className="text-sm text-gray-500">Page {historyPage} of {historyTotalPages}</span>
                <button onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))} disabled={historyPage === historyTotalPages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
