"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportsApi, announcementsApi, usersApi, attendanceApi } from "@/lib/api";
import {
  Users,
  CheckCircle,
  Package,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  X,
  Loader2,
  Clock,
  ImagePlus,
  Megaphone,
  PartyPopper,
  Pin,
  MessageSquare,
  ThumbsUp,
  Send,
  CalendarCheck,
  UserPlus,
  Building2,
  BarChart3,
  ArrowUpRight,
  LayoutDashboard,
  TrendingUp,
  History,
  Gauge,
} from "lucide-react";
import type { User, UserSummary } from "@/types";
import type { DashboardSummary, Announcement, AnnouncementComment, AttendanceRecord, PaginatedResponse, UserRole } from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Announcement Tag Config ───────────────────────────────────────────────────

const tagConfig: Record<string, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  urgent: { label: "Urgent", icon: AlertTriangle, bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  event: { label: "Event", icon: PartyPopper, bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  notice: { label: "Notice", icon: Megaphone, bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
};

// ── Dashboard Design System ────────────────────────────────────────────────────
// Shared card + stat primitives for the premium school-management look.

const CARD =
  "rounded-2xl border border-gray-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)]";

const TONES: Record<string, { chip: string }> = {
  blue: { chip: "bg-[#1557C0]/10 text-[#1557C0]" },
  navy: { chip: "bg-[#1E3A5F]/10 text-[#1E3A5F]" },
  green: { chip: "bg-emerald-50 text-emerald-600" },
  amber: { chip: "bg-amber-50 text-amber-600" },
  red: { chip: "bg-red-50 text-red-600" },
  indigo: { chip: "bg-indigo-50 text-indigo-600" },
  gray: { chip: "bg-slate-100 text-slate-500" },
};

// Map legacy `bg-{color}-500` badge classes to the new restrained tones.
function toneFromLegacy(color: string): string {
  if (color.includes("amber")) return "amber";
  if (color.includes("green")) return "green";
  if (color.includes("red")) return "red";
  if (color.includes("indigo")) return "indigo";
  if (color.includes("blue")) return "blue";
  if (color.includes("gray")) return "gray";
  return "blue";
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD} p-6 ${className ?? ""}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1557C0]/10 text-[#1557C0]">
                <Icon size={17} strokeWidth={1.9} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="truncate text-[15px] font-bold leading-tight text-[#0B1F3A]">{title}</h3>}
              {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "blue",
  valueCls,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  tone?: string;
  valueCls?: string;
  badge?: React.ReactNode;
}) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className="group relative w-full max-w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.06),0_16px_40px_-16px_rgba(16,24,40,0.18)]">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.chip}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
        {badge}
      </div>
      <p className={`mt-4 text-[26px] font-extrabold leading-none tracking-tight tabular-nums text-[#0B1F3A] ${valueCls ?? ""}`}>
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold text-gray-700">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-2">
      <span className="text-lg font-extrabold tabular-nums text-[#0B1F3A]">{value}</span>
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-50 text-emerald-600",
  late: "bg-amber-50 text-amber-600",
  absent: "bg-red-50 text-red-600",
  excused: "bg-blue-50 text-blue-600",
};

function StatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? "").toLowerCase();
  const cls = STATUS_STYLE[key] ?? "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${cls}`}>
      {key ? key : "—"}
    </span>
  );
}

// ── Quick Actions (role-aware) ────────────────────────────────────────────────
// Each action's `roles` mirrors the existing sidebar/navigation role permissions.
// Do NOT add actions for roles that cannot already access the target route.

interface QuickAction {
  href: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  roles: UserRole[];
  accent: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/dashboard/users",
    label: "Create Account",
    desc: "Register a new user",
    icon: UserPlus,
    roles: ["admin", "director", "staff"],
    accent: "from-[#1557C0] to-[#123D78]",
  },
  {
    href: "/dashboard/attendance",
    label: "New Attendance Session",
    desc: "Open a new session",
    icon: CalendarCheck,
    roles: ["admin", "director"],
    accent: "from-[#0e9f6e] to-[#0b7a56]",
  },
  {
    href: "/dashboard/inventory",
    label: "Add Equipment",
    desc: "Manage inventory",
    icon: Package,
    roles: ["admin", "director", "staff"],
    accent: "from-[#6d28d9] to-[#5b21b6]",
  },
  {
    href: "/dashboard/facilities",
    label: "Manage Facilities",
    desc: "Venues & reservations",
    icon: Building2,
    roles: ["admin", "director", "staff"],
    accent: "from-[#d97706] to-[#b45309]",
  },
  {
    href: "/dashboard/reports",
    label: "View Reports",
    desc: "Attendance & exports",
    icon: BarChart3,
    roles: ["admin", "director", "staff"],
    accent: "from-[#0891b2] to-[#0e7490]",
  },
  {
    href: "/dashboard/incidents",
    label: "Log Incident",
    desc: "Record an incident",
    icon: AlertTriangle,
    roles: ["admin", "director", "staff"],
    accent: "from-[#dc2626] to-[#b91c1c]",
  },
];

// ── Weekly attendance log row (subset of GET /reports/attendance/weekly) ──────

interface WeeklyAttendanceLog {
  id: string;
  time_in: string | null;
  time_out: string | null;
  attendance_date: string;
  status: string | null;
}

// ── Announcement Form Modal ───────────────────────────────────────────────────

interface AnnouncementFormProps {
  existing?: Announcement;
  onClose: () => void;
}

function AnnouncementFormModal({ existing, onClose }: AnnouncementFormProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [eventDate, setEventDate] = useState(
    existing?.event_date
      ? format(new Date(existing.event_date), "yyyy-MM-dd'T'HH:mm")
      : ""
  );
  const [tag, setTag] = useState<string>(existing?.tag ?? "notice");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(existing?.image_url ?? null);
  const [error, setError] = useState<string | null>(null);

  const { mutate: saveAnnouncement, isPending } = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title,
        content,
        event_date: eventDate ? new Date(eventDate).toISOString() : null,
        tag,
        pinned,
      };
      if (existing) {
        await announcementsApi.update(existing.id, payload);
        if (imageFile) {
          await announcementsApi.uploadImage(existing.id, imageFile);
        }
      } else {
        const res = await announcementsApi.create(payload);
        const newId = res.data.id as string;
        if (imageFile) {
          await announcementsApi.uploadImage(newId, imageFile);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to save announcement.";
      setError(msg);
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!content.trim()) { setError("Content is required."); return; }
    saveAnnouncement();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {existing ? "Edit Announcement" : "New Announcement"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Announcement content…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tag</label>
            <div className="flex gap-2">
              {(["urgent", "event", "notice"] as const).map((t) => {
                const cfg = tagConfig[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                      tag === t
                        ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                        : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <Icon size={12} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image <span className="text-gray-400 font-normal">(optional — max 5 MB)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
              className="hidden"
            />
            {imagePreview ? (
              <div className="relative inline-block w-full">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full max-h-40 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="absolute top-2 right-2 p-1 bg-white/80 rounded-full text-gray-500 hover:text-red-500 hover:bg-white transition"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition w-full justify-center"
              >
                <ImagePlus size={16} /> Choose image
              </button>
            )}
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]/30"
            />
            <div className="flex items-center gap-1.5">
              <Pin size={13} className="text-gray-400" />
              <span className="text-sm text-gray-700 font-medium">Pin Post</span>
            </div>
          </label>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50 font-medium"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Announcements Feed ────────────────────────────────────────────────────────

interface AnnouncementsFeedProps {
  announcements: Announcement[];
  isEditor: boolean;
  onCreate: () => void;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
}

function AnnouncementsFeed({ announcements, isEditor, onCreate, onEdit, onDelete }: AnnouncementsFeedProps) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-gray-800">Updates & Notices</h2>
          <p className="text-xs text-gray-400 mt-0.5">Latest announcements and OSCA updates</p>
        </div>
        {isEditor && (
          <button
            onClick={onCreate}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition font-medium"
          >
            <Plus size={12} /> Create Post
          </button>
        )}
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No announcements yet.</p>
      ) : (
        <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
          {announcements.map((ann) => (
            <AnnouncementCard key={ann.id} ann={ann} isEditor={isEditor} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Announcement Card (Acknowledge + Comment) ─────────────────────────────────

interface AnnouncementCardProps {
  ann: Announcement;
  isEditor: boolean;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
}

function AnnouncementCard({ ann, isEditor, onEdit, onDelete }: AnnouncementCardProps) {
  const queryClient = useQueryClient();
  const [acknowledged, setAcknowledged] = useState(ann.acknowledged_by_me ?? false);
  const [ackCount, setAckCount] = useState(ann.acknowledgement_count ?? 0);
  const [commentCount, setCommentCount] = useState(ann.comment_count ?? 0);
  const [ackLoading, setAckLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: ["announcements", ann.id, "comments"],
    queryFn: () => announcementsApi.comments(ann.id).then((res) => res.data.items as AnnouncementComment[]),
    enabled: commentsOpen,
  });

  const handleAck = async () => {
    if (ackLoading) return;
    setAckLoading(true);
    setError(null);
    try {
      if (acknowledged) {
        await announcementsApi.unacknowledge(ann.id);
        setAcknowledged(false);
        setAckCount((c) => Math.max(0, c - 1));
      } else {
        const res = await announcementsApi.acknowledge(ann.id);
        setAcknowledged(true);
        setAckCount(res.data.count);
      }
    } catch (err) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to update acknowledgement. Please try again."
      );
    } finally {
      setAckLoading(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = commentText.trim();
    if (!content || commentLoading) return;
    setCommentLoading(true);
    setError(null);
    try {
      await announcementsApi.addComment(ann.id, { content });
      setCommentText("");
      setCommentCount((c) => c + 1);
      queryClient.invalidateQueries({ queryKey: ["announcements", ann.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Failed to post comment. Please try again."
      );
    } finally {
      setCommentLoading(false);
    }
  };

  const tc = ann.tag ? tagConfig[ann.tag] : null;

  return (
    <div className={`group border rounded-xl overflow-hidden transition ${ann.pinned ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {(ann.created_by_name || "OSCA").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">{ann.created_by_name || "OSCA Admin"}</p>
            <p className="text-xs text-gray-400">{formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ann.pinned && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              <Pin size={10} /> Pinned
            </span>
          )}
          {tc && (
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tc.bg} ${tc.text} border ${tc.border}`}>
              <tc.icon size={10} /> {tc.label}
            </span>
          )}
          {isEditor && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(ann); }}
                className="p-1 hover:bg-gray-200 rounded text-gray-500"
                title="Edit"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
                className="p-1 hover:bg-red-100 rounded text-red-400"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title + Content */}
      <div className="px-4 pb-2">
        <p className="text-sm font-bold text-gray-900">{ann.title}</p>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed whitespace-pre-line">{ann.content}</p>
      </div>

      {/* Image */}
      {ann.image_url && (
        <div className="px-4 pb-2">
          <img
            src={ann.image_url}
            alt={ann.title}
            className="w-full max-h-64 object-cover rounded-lg border border-gray-100"
          />
        </div>
      )}

      {/* Event Date */}
      {ann.event_date && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-[#1E3A5F] font-medium">
          <Calendar size={12} />
          {format(new Date(ann.event_date), "MMM d, yyyy · h:mm a")}
        </div>
      )}

      {/* Actions: Acknowledge + Comment */}
      <div className="border-t border-gray-100 mx-4" />
      <div className="flex items-center gap-1 px-4 py-2">
        <button
          onClick={handleAck}
          disabled={ackLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-60 ${
            acknowledged ? "text-[#1557C0] bg-blue-50 hover:bg-blue-100" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          {ackLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : acknowledged ? (
            <CheckCircle size={13} />
          ) : (
            <ThumbsUp size={13} />
          )}
          {ackLoading ? "Saving…" : acknowledged ? "Acknowledged" : "Acknowledge"}
          {ackCount > 0 && (
            <span className="ml-0.5 bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {ackCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition"
        >
          <MessageSquare size={13} />
          {commentsOpen ? "Hide Comments" : "Comment"}
          {commentCount > 0 && (
            <span className="ml-0.5 bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {commentCount}
            </span>
          )}
        </button>
      </div>

      {/* Comment section */}
      {commentsOpen && (
        <div className="px-4 pb-4">
          <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
            <button
              type="submit"
              disabled={commentLoading || !commentText.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#16304f] transition disabled:opacity-50"
            >
              {commentLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {commentLoading ? "Posting…" : "Post"}
            </button>
          </form>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-2">{error}</p>
          )}

          <div className="mt-3 space-y-2.5">
            {commentsQuery.isLoading && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Loading comments…
              </p>
            )}
            {!commentsQuery.isLoading && commentsQuery.data?.length === 0 && (
              <p className="text-xs text-gray-400">No comments yet. Be the first to comment.</p>
            )}
            {(commentsQuery.data ?? []).map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-semibold shrink-0">
                  {(c.author_name || "U").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-xs font-semibold text-gray-800">{c.author_name || "User"}</p>
                    <p className="text-[10px] text-gray-400">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line break-words">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role-aware welcome subtitle ───────────────────────────────────────────────

const WELCOME_SUBTITLES: Record<UserRole, string> = {
  admin: "Here's what's happening with OSCA today.",
  director: "Here's an overview of OSCA operations today.",
  staff: "Here's what's happening with OSCA today.",
  coach: "Here's your team, sessions, and today's attendance.",
  pe_instructor: "Here's what's happening with OSCA activities today.",
  student: "Here's your attendance, updates, and account overview.",
};

// ── OSCA Header Banner (shared by ALL roles) ─────────────────────────────────
// Wide NAAP campus banner with a dark navy overlay, subtle wave decoration,
// and a live clock — one consistent header for every role.

function WelcomeHeader() {
  const [now, setNow] = useState(new Date());
  const { isDark } = useThemeStore();
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-5 mb-6 overflow-hidden lg:-mx-7 lg:-mt-7 lg:mb-7">
      {/* NAAP campus photo */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/NAAP.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Soft deep-navy overlay — photo stays visible underneath */}
      <div
        className={
          isDark
            ? "absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/90 via-[#123B68]/55 to-[#1E3A5F]/30"
            : "absolute inset-0 bg-gradient-to-r from-[#061a38]/95 via-[#123b68]/75 to-[#123b68]/45"
        }
      />

      {/* Smooth curved wave along the bottom edge — blends into page bg */}
      <svg
        className="pointer-events-none absolute bottom-[-1px] left-0 h-[38px] w-full md:h-[45px]"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,65 C240,20 480,85 720,55 C960,25 1200,80 1440,45 L1440,100 L0,100 Z"
          fill={isDark ? "#0F172A" : "#f2f5f9"}
        />
      </svg>

      <div className="relative z-10 flex h-[150px] flex-col justify-center gap-4 px-6 py-6 md:h-[165px] md:flex-row md:items-center md:justify-between md:gap-5 md:px-10">
        {/* Left: OSCA branding (logo sits directly on the photo, no white box) */}
        <div className="flex items-center gap-3 md:gap-4">
          <Image
            src="/osca-logo.png"
            alt="OSCA Logo"
            width={64}
            height={64}
            className="h-12 w-12 shrink-0 object-contain md:h-16 md:w-16"
          />
          <div className="min-w-0">
            <h1 className={`text-[20px] font-extrabold leading-tight tracking-tight md:text-[30px] ${isDark ? "text-[#E2E8F0]" : "text-white"}`}>
              OSCA Management System
            </h1>
            <p className={`mt-1 text-[13px] font-medium leading-snug md:text-[16px] ${isDark ? "text-[#CBD5E1]" : "text-white/95"}`}>
              Office of Sports and Cultural Affairs
            </p>
            <p className={`text-[11px] font-medium md:text-[13px] ${isDark ? "text-blue-300/80" : "text-blue-100/90"}`}>NAAP – Villamor Campus</p>
          </div>
        </div>

        {/* Right: current date + live time (glass panel) */}
        <div className={`flex shrink-0 items-center gap-3 self-start rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-md md:self-center md:px-5 ${isDark ? "border-white/10 bg-white/[0.06]" : "border-white/20 bg-white/10"}`}>
          <Calendar className={`shrink-0 ${isDark ? "text-blue-300/70" : "text-blue-100"}`} size={20} />
          <div className="min-w-0">
            <p className={`text-xs font-medium ${isDark ? "text-blue-300/80" : "text-blue-100"}`}>{format(now, "EEEE, MMMM d, yyyy")}</p>
            <p className={`font-mono text-lg font-bold leading-tight tabular-nums ${isDark ? "text-[#E2E8F0]" : "text-white"}`}>
              {format(now, "hh:mm:ss a")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Welcome Section (shared by ALL roles, role-specific subtitle) ─────────────

function WelcomeSection({ user }: { user: User }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-[#0B1F3A] md:text-2xl">
        Welcome back, {user.first_name}! 👋
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {WELCOME_SUBTITLES[user.role] ?? "Here's what's happening with OSCA today."}
      </p>
    </div>
  );
}

// ── Manager Dashboard (Admin / Director / Staff) ─────────────────────────────

interface ManagerViewProps {
  user: User;
  summary?: DashboardSummary;
  pendingCount: number;
  attendanceTrend: { day: string; scans: number }[];
  weeklyLoading: boolean;
  equipmentChartData: { name: string; qty: number; fill: string }[];
  announcements: Announcement[];
  isEditor: boolean;
  onCreateAnnouncement: () => void;
  onEditAnnouncement: (a: Announcement) => void;
  onDeleteAnnouncement: (id: string) => void;
}

function ManagerView({
  user,
  summary,
  pendingCount,
  attendanceTrend,
  weeklyLoading,
  equipmentChartData,
  announcements,
  isEditor,
  onCreateAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
}: ManagerViewProps) {
  const role = user.role as string;
  const quickActions = QUICK_ACTIONS.filter((a) => a.roles.includes(user.role));

  return (
    <div className="space-y-7">
      {/* Pending accounts alert */}
      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Clock size={16} /> {pendingCount} account{pendingCount > 1 ? "s" : ""} awaiting approval
          </p>
          <Link href="/dashboard/users" className="text-sm font-semibold text-amber-700 hover:underline">
            Review now →
          </Link>
        </div>
      )}

      {/* KPI cards */}
      <div className="flex flex-wrap gap-5">
        <StatCard
          icon={Users}
          label="Total Students"
          value={summary?.students.total ?? 0}
          sub={`${summary?.students.face_enrolled ?? 0} face-enrolled · ${summary?.students.enrollment_rate ?? 0}%`}
          tone="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Attendance Today"
          value={summary?.attendance.today ?? 0}
          sub="Scans recorded today"
          tone="green"
        />
        <StatCard
          icon={Package}
          label="Equipment Available"
          value={summary?.equipment.available ?? 0}
          sub={`${summary?.equipment.borrowed ?? 0} currently borrowed`}
          tone="indigo"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue Returns"
          value={summary?.transactions.overdue ?? 0}
          sub="Transactions past due"
          tone={summary?.transactions.overdue ? "red" : "gray"}
          valueCls={summary?.transactions.overdue ? "text-red-600" : ""}
        />
      </div>

      {/* Attendance chart (wide) + Quick Actions (right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Attendance This Week */}
          <SectionCard
            title="Attendance This Week"
            subtitle="Scans logged from Monday to Sunday"
            icon={TrendingUp}
            action={
              (role === "admin" || role === "director") && (
                <Link
                  href="/dashboard/attendance"
                  className="flex items-center gap-1 text-xs font-semibold text-[#1557C0] transition hover:text-[#123D78]"
                >
                  Manage sessions <ArrowUpRight size={13} />
                </Link>
              )
            }
          >
            <div className="h-[220px]">
              {weeklyLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="animate-spin text-gray-300" size={28} />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceTrend} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="scans" fill="#1557C0" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Quick Actions */}
        <SectionCard
          title="Quick Actions"
          subtitle="Jump straight to the tools you use most"
          icon={LayoutDashboard}
          className="h-full"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition hover:border-[#1557C0]/30 hover:bg-[#1557C0]/5"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${action.accent} text-white shadow`}>
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 transition group-hover:text-[#1557C0]">
                      {action.label}
                    </p>
                    <p className="text-xs text-gray-500">{action.desc}</p>
                  </div>
                  <ArrowUpRight size={14} className="mt-0.5 shrink-0 text-gray-300 transition group-hover:text-[#1557C0]" />
                </Link>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Equipment Status — full width */}
      <SectionCard
        title="Equipment Status"
        subtitle="Current availability across the inventory"
        icon={Package}
        action={
          <Link
            href="/dashboard/inventory"
            className="flex items-center gap-1 text-xs font-semibold text-[#1557C0] transition hover:text-[#123D78]"
          >
            Manage inventory <ArrowUpRight size={13} />
          </Link>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2.5">
          {equipmentChartData.map((e) => (
            <MiniStat key={e.name} label={e.name} value={e.qty} />
          ))}
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={equipmentChartData} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                {equipmentChartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Updates & Notices */}
      <AnnouncementsFeed
        announcements={announcements}
        isEditor={isEditor}
        onCreate={onCreateAnnouncement}
        onEdit={onEditAnnouncement}
        onDelete={onDeleteAnnouncement}
      />

      <p className="text-xs text-gray-400 text-right">
        Last updated: {summary ? new Date(summary.generated_at).toLocaleString("en-PH") : "—"}
      </p>
    </div>
  );
}

// ── Role Dashboard (Coach / PE Instructor / Student) ─────────────────────────
// Same light card design as the manager dashboard, but only role-appropriate content.

interface RoleViewProps {
  role: string;
  stats: { key: string; label: string; value: number; sub: string; icon: React.ElementType; color: string }[];
  attendanceTrend: { day: string; scans: number }[];
  equipmentChartData: { name: string; qty: number; fill: string }[];
  announcements: Announcement[];
  isEditor: boolean;
  summary?: DashboardSummary;
  onCreateAnnouncement: () => void;
  onEditAnnouncement: (a: Announcement) => void;
  onDeleteAnnouncement: (id: string) => void;
}

function RoleView({
  role,
  stats,
  attendanceTrend,
  equipmentChartData,
  announcements,
  isEditor,
  summary,
  onCreateAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
}: RoleViewProps) {
  return (
    <div className="space-y-7">
      {/* Role-specific stat cards */}
      <div className="flex flex-wrap gap-5">
        {stats.map((stat) => (
          <StatCard
            key={stat.key}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            sub={stat.sub}
            tone={toneFromLegacy(stat.color)}
          />
        ))}
      </div>

      {/* Charts grid */}
      <div className={`grid grid-cols-1 ${role === "student" ? "lg:grid-cols-1" : "lg:grid-cols-2"} gap-6`}>
        {/* Attendance Trend */}
        <SectionCard
          title="Attendance This Week"
          subtitle="Your scans from the past seven days"
          icon={TrendingUp}
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="scans" fill="#1557C0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Equipment Status — hidden for students */}
        {role !== "student" && (
          <SectionCard
            title="Equipment Status"
            subtitle="Current availability across the inventory"
            icon={Package}
          >
            <div className="mb-4 flex flex-wrap gap-2.5">
              {equipmentChartData.map((e) => (
                <MiniStat key={e.name} label={e.name} value={e.qty} />
              ))}
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipmentChartData} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                    {equipmentChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Announcements Feed */}
      <AnnouncementsFeed
        announcements={announcements}
        isEditor={isEditor}
        onCreate={onCreateAnnouncement}
        onEdit={onEditAnnouncement}
        onDelete={onDeleteAnnouncement}
      />

      <p className="text-xs text-gray-400 text-right">
        Last updated: {summary ? new Date(summary.generated_at).toLocaleString("en-PH") : "—"}
      </p>
    </div>
  );
}

// ── Main Dashboard Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [announcementModal, setAnnouncementModal] = useState<"new" | Announcement | null>(null);

  const role = user?.role;

  const { data: summary, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await reportsApi.dashboardSummary();
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const { data: announcementsData } = useQuery<PaginatedResponse<Announcement>>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await announcementsApi.list({ page_size: 10 });
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { mutate: deleteAnnouncement } = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });

  // Staff: fetch pending account count for dashboard card
  const { data: pendingData } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["users", "pending-count"],
    queryFn: async () => {
      const res = await usersApi.list({ page: 1, page_size: 1, is_active: false });
      return res.data;
    },
    enabled: role === "staff" || role === "admin" || role === "director",
    refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.total ?? 0;

  // Student: fetch own attendance records for weekly chart
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  startOfWeek.setHours(0, 0, 0, 0);
  const { data: studentRecords } = useQuery<PaginatedResponse<AttendanceRecord>>({
    queryKey: ["student-dashboard-attendance", user?.id],
    queryFn: async () => {
      const res = await attendanceApi.getRecords({ date_from: startOfWeek.toISOString(), page_size: 200 });
      return res.data;
    },
    enabled: role === "student" && !!user?.id,
  });

  // Student: count today's attendance from own records
  const studentTodayAttendance = (() => {
    if (role !== "student" || !studentRecords?.items) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return studentRecords.items.filter((r) => {
      if (!r.time_in) return false;
      return new Date(r.time_in) >= todayStart;
    }).length;
  })();

  // Manager: real weekly attendance logs (current week, Mon–Sun)
  const isManager = role === "admin" || role === "director" || role === "staff";
  const { data: weeklyLogs, isLoading: weeklyLoading } = useQuery<WeeklyAttendanceLog[]>({
    queryKey: ["dashboard-weekly-attendance"],
    queryFn: async () => {
      const res = await reportsApi.weeklyAttendance({ format: "json" });
      return res.data;
    },
    enabled: isManager,
    refetchInterval: 60_000,
  });

  const managerAttendanceTrend = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    for (const row of weeklyLogs ?? []) {
      if (!row.time_in) continue;
      const d = new Date(row.time_in);
      const diffDays = Math.floor((d.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > 6) continue;
      counts[(d.getDay() + 6) % 7]++;
    }
    return days.map((day, i) => ({ day, scans: counts[i] }));
  }, [weeklyLogs]);

  const isEditor = role === "admin" || role === "director" || role === "staff";
  const announcements = [...(announcementsData?.items ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1E3A5F]" />
      </div>
    );
  }

  const allStats = [
    {
      key: "pending",
      label: "Pending Accounts",
      value: pendingCount,
      sub: "Accounts awaiting approval",
      icon: Clock,
      color: pendingCount > 0 ? "bg-amber-500" : "bg-gray-400",
    },
    {
      key: "students",
      label: "Total Students",
      value: summary?.students.total ?? 0,
      sub: `${summary?.students.face_enrolled ?? 0} face-enrolled (${summary?.students.enrollment_rate ?? 0}%)`,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      key: "attendance",
      label: "Attendance Today",
      value: role === "student" ? studentTodayAttendance : (summary?.attendance.today ?? 0),
      sub: role === "coach" && user?.sport_or_art
        ? `Scans recorded today · ${user.sport_or_art}`
        : role === "student"
          ? "Your scans today"
          : "Scans recorded today",
      icon: CheckCircle,
      color: "bg-green-500",
    },
    {
      key: "equipment",
      label: "Equipment Available",
      value: summary?.equipment.available ?? 0,
      sub: `${summary?.equipment.borrowed ?? 0} currently borrowed`,
      icon: Package,
      color: "bg-indigo-500",
    },
    {
      key: "overdue",
      label: "Overdue Returns",
      value: summary?.transactions.overdue ?? 0,
      sub: "Transactions past due",
      icon: AlertTriangle,
      color: summary?.transactions.overdue ? "bg-red-500" : "bg-gray-400",
    },
  ];

  // Student: only equipment available + attendance
  // PE Instructor: only equipment + overdue stats
  // Coach: attendance + equipment + overdue (sport-specific label)
  // Staff: equipment + overdue (inventory-focused)
  // Admin/Director: all stats
  const stats = allStats.filter((s) => {
    if (role === "student") return s.key === "attendance";
    if (role === "pe_instructor") return s.key === "equipment" || s.key === "overdue";
    if (role === "coach") return s.key !== "students" && s.key !== "pending";
    return true; // admin, director, staff see all
  });

  const equipmentChartData = summary
    ? [
        { name: "Available", qty: summary.equipment.available, fill: "#22c55e" },
        { name: "Borrowed", qty: summary.equipment.borrowed, fill: "#6366f1" },
      ]
    : [];

  // Weekly attendance trend (legacy roles — unchanged behavior)
  const attendanceTrend = (() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // Student: compute from real attendance records
    if (role === "student" && studentRecords?.items) {
      const dayCount = [0, 0, 0, 0, 0, 0, 0];
      const now = new Date();
      for (const rec of studentRecords.items) {
        if (!rec.time_in) continue;
        const d = new Date(rec.time_in);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > 6) continue;
        const dayIdx = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
        dayCount[dayIdx]++;
      }
      return days.map((day, i) => ({ day, scans: dayCount[i] }));
    }
    // Others: mock based on summary data
    return days.map((d, i) => ({
      day: d,
      scans: i <= (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) ? Math.floor(Math.random() * (summary?.attendance.today || 5) + 2) : 0,
    }));
  })();

  const announcementHandlers = {
    onCreateAnnouncement: () => setAnnouncementModal("new"),
    onEditAnnouncement: (a: Announcement) => setAnnouncementModal(a),
    onDeleteAnnouncement: (id: string) => deleteAnnouncement(id),
  };

  return (
    <>
      {announcementModal && (
        <AnnouncementFormModal
          existing={announcementModal === "new" ? undefined : announcementModal}
          onClose={() => setAnnouncementModal(null)}
        />
      )}

      {/* Full-width NAAP banner header — flush against the left sidebar */}
      <WelcomeHeader />

      <div className="mx-auto max-w-7xl space-y-7">
        {/* Shared welcome section (role-specific subtitle) */}
        <WelcomeSection user={user} />

        {isManager ? (
          <ManagerView
            user={user}
            summary={summary}
            pendingCount={pendingCount}
            attendanceTrend={managerAttendanceTrend}
            weeklyLoading={weeklyLoading}
            equipmentChartData={equipmentChartData}
            announcements={announcements}
            isEditor={isEditor}
            {...announcementHandlers}
          />
        ) : (
          <RoleView
            role={role as string}
            stats={stats}
            attendanceTrend={attendanceTrend}
            equipmentChartData={equipmentChartData}
            announcements={announcements}
            isEditor={isEditor}
            summary={summary}
            {...announcementHandlers}
          />
        )}
      </div>
    </>
  );
}
