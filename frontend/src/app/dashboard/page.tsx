"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { reportsApi, announcementsApi, usersApi, attendanceApi, eligibilityApi } from "@/lib/api";
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
  Trophy,
  ShieldCheck,
  UserCheck,
  ScanFace,
  Percent,
  Award,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
} from "lucide-react";
import type { User, UserSummary } from "@/types";
import type { DashboardSummary, Announcement, AnnouncementComment, AttendanceRecord, PaginatedResponse, UserRole, AthleteEligibility } from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { AnnouncementFormModal, announcementImages, tagConfig } from "@/components/announcements/AnnouncementFormModal";
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


const visibilityConfig: Record<string, { label: string; cls: string }> = {
  all_dashboards: { label: "Dashboards", cls: "bg-gray-100 text-gray-600" },
  public_website: { label: "Public Website", cls: "bg-sky-100 text-sky-700" },
  both: { label: "Dashboards + Website", cls: "bg-violet-100 text-violet-700" },
};


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
  wide = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  tone?: string;
  valueCls?: string;
  badge?: React.ReactNode;
  wide?: boolean;
}) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className={`group relative w-full overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.06),0_16px_40px_-16px_rgba(16,24,40,0.18)] ${wide ? "" : "max-w-[280px]"}`}>
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


interface WeeklyAttendanceLog {
  id: string;
  time_in: string | null;
  time_out: string | null;
  attendance_date: string;
  status: string | null;
}


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


function useAnnouncementActions(ann: Announcement) {
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

  const handleAck = useCallback(async () => {
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
  }, [ackLoading, acknowledged, ann.id]);

  const handleCommentSubmit = useCallback(
    async (e: React.FormEvent) => {
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
    },
    [commentText, commentLoading, ann.id, queryClient]
  );

  return {
    acknowledged,
    ackCount,
    commentCount,
    ackLoading,
    commentsOpen,
    setCommentsOpen,
    commentText,
    setCommentText,
    commentLoading,
    error,
    commentsQuery,
    handleAck,
    handleCommentSubmit,
  };
}

type AnnouncementActions = ReturnType<typeof useAnnouncementActions>;

function AckButton({ actions, size = "sm" }: { actions: AnnouncementActions; size?: "sm" | "md" }) {
  const { acknowledged, ackCount, ackLoading, handleAck } = actions;
  const pad = size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <button
      onClick={handleAck}
      disabled={ackLoading}
      className={`flex items-center gap-1.5 rounded-lg font-medium transition disabled:opacity-60 ${pad} ${
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
  );
}

function CommentSection({ actions, autoFocus }: { actions: AnnouncementActions; autoFocus?: boolean }) {
  const { commentText, setCommentText, commentLoading, error, commentsQuery, handleCommentSubmit } = actions;
  return (
    <div>
      <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write a comment…"
          autoFocus={autoFocus}
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
  );
}


interface AnnouncementCardProps {
  ann: Announcement;
  isEditor: boolean;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
}


function PhotoGrid({
  images,
  onOpen,
  alt,
}: {
  images: string[];
  onOpen: (index: number) => void;
  alt: string;
}) {
  const tile = "relative block w-full cursor-zoom-in overflow-hidden";
  const img = "absolute inset-0 h-full w-full object-cover";

  const renderTile = (index: number, cls: string, overlay?: number) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(index); }}
      className={`${tile} ${cls}`}
      title="View full image"
    >
      <img src={images[index]} alt={alt} className={img} loading="lazy" />
      {overlay !== undefined && overlay > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">
          +{overlay}
        </span>
      )}
    </button>
  );

  const n = images.length;

  if (n === 1) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-100">
        {renderTile(0, "aspect-[4/3]")}
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl border border-gray-100">
        {renderTile(0, "aspect-[4/3]")}
        {renderTile(1, "aspect-[4/3]")}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl border border-gray-100">
        {renderTile(0, "aspect-[4/3]")}
        <div className="flex flex-col gap-1">
          {renderTile(1, "min-h-0 flex-1")}
          {renderTile(2, "min-h-0 flex-1")}
        </div>
      </div>
    );
  }

  if (n === 4) {
    return (
      <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl border border-gray-100">
        {renderTile(0, "aspect-square")}
        {renderTile(1, "aspect-square")}
        {renderTile(2, "aspect-square")}
        {renderTile(3, "aspect-square")}
      </div>
    );
  }

  const rest = images.slice(4);
  const visibleRest = rest.slice(0, 2);
  const extra = images.length - 4 - visibleRest.length;
  const twoPerRow = visibleRest.length === 2;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100">
      <div className="grid grid-cols-2 gap-1">
        {renderTile(0, "aspect-square")}
        {renderTile(1, "aspect-square")}
        {renderTile(2, "aspect-square")}
        {renderTile(3, "aspect-square")}
      </div>
      <div className={`mt-1 grid gap-1 ${twoPerRow ? "grid-cols-2" : "grid-cols-1"}`}>
        {visibleRest.map((_, i) => {
          const absoluteIndex = 4 + i;
          const isLast = absoluteIndex === images.length - 1;
          return renderTile(
            absoluteIndex,
            twoPerRow ? "aspect-[4/3]" : "aspect-[16/9]",
            isLast && extra > 0 ? extra : undefined,
          );
        })}
      </div>
    </div>
  );
}

function AnnouncementCard({ ann, isEditor, onEdit, onDelete }: AnnouncementCardProps) {
  const actions = useAnnouncementActions(ann);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const tc = ann.tag ? tagConfig[ann.tag] : null;
  const vc = ann.visibility ? visibilityConfig[ann.visibility] : null;
  const hasLink = !!ann.link_url;
  const images = announcementImages(ann);

  const openViewer = (index = 0) => {
    actions.setCommentsOpen(true);
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const openLink = (e: React.MouseEvent) => {
    if (!hasLink) return;
    e.preventDefault();
    window.open(ann.link_url!, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      onClick={hasLink ? openLink : undefined}
      title={hasLink ? "Open link" : undefined}
      className={`group border rounded-xl overflow-hidden transition ${hasLink ? "cursor-pointer" : ""} ${ann.pinned ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white"}`}
    >
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
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
          {vc && (
            <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${vc.cls}`} title="Where this announcement is published">
              <Globe size={10} /> {vc.label}
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

      <div className="px-4 pb-2">
        <p className="text-sm font-bold text-gray-900">{ann.title}</p>
        <p className="text-sm text-gray-600 mt-1 leading-relaxed whitespace-pre-line">{ann.content}</p>
      </div>

      {images.length > 0 && (
        <div className="px-4 pb-2">
          <PhotoGrid images={images} onOpen={openViewer} alt={ann.title} />
        </div>
      )}

      {ann.event_date && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-[#1E3A5F] font-medium">
          <Calendar size={12} />
          {format(new Date(ann.event_date), "MMM d, yyyy · h:mm a")}
        </div>
      )}

      {hasLink && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1557C0] hover:underline">
            <ExternalLink size={12} /> Open Link
          </span>
        </div>
      )}

      <div className="border-t border-gray-100 mx-4" />
      <div className="flex items-center gap-1 px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <AckButton actions={actions} />
        <button
          onClick={() => actions.setCommentsOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition"
        >
          <MessageSquare size={13} />
          {actions.commentsOpen ? "Hide Comments" : "Comment"}
          {actions.commentCount > 0 && (
            <span className="ml-0.5 bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {actions.commentCount}
            </span>
          )}
        </button>
      </div>

      {actions.commentsOpen && (
        <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          <CommentSection actions={actions} />
        </div>
      )}

      {viewerOpen && (
        <AnnouncementPhotoViewer
          ann={ann}
          images={images}
          initialIndex={viewerIndex}
          actions={actions}
          isEditor={isEditor}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}


function AnnouncementPhotoViewer({
  ann,
  images,
  initialIndex,
  actions,
  isEditor,
  onEdit,
  onDelete,
  onClose,
}: {
  ann: Announcement;
  images: string[];
  initialIndex: number;
  actions: AnnouncementActions;
  isEditor: boolean;
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const total = images.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), total - 1));
  const [zoom, setZoom] = useState(1);
  const tc = ann.tag ? tagConfig[ann.tag] : null;

  const goTo = (next: number) => {
    setIndex(Math.min(Math.max(next, 0), total - 1));
    setZoom(1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, index]);

  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)));
  const resetZoom = () => setZoom(1);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative z-10 flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="relative flex min-h-[45vh] flex-1 items-center justify-center overflow-hidden bg-black lg:min-h-0">
          <img
            key={images[index] ?? ""}
            src={images[index] ?? ""}
            alt={ann.title}
            className="max-h-full max-w-full select-none object-contain"
            style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease-out" }}
          />

          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white tabular-nums">
            {total > 0 ? `${index + 1} / ${total}` : "0 / 0"}
          </div>

          {total > 1 && (
            <>
              <button
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-30 disabled:hover:bg-black/60"
                aria-label="Previous image"
                title="Previous"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => goTo(index + 1)}
                disabled={index === total - 1}
                className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-30 disabled:hover:bg-black/60"
                aria-label="Next image"
                title="Next"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-2 py-1.5 text-white">
            <button
              onClick={zoomOut}
              className="rounded-full p-1.5 transition hover:bg-white/20"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              onClick={zoomIn}
              className="rounded-full p-1.5 transition hover:bg-white/20"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={resetZoom}
              className="rounded-full p-1.5 transition hover:bg-white/20"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div className="flex w-full flex-col overflow-y-auto bg-white lg:w-[400px] lg:shrink-0 lg:border-l lg:border-gray-100">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-sm font-semibold text-white">
              {(ann.created_by_name || "OSCA").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{ann.created_by_name || "OSCA Admin"}</p>
              <p className="text-xs text-gray-400">{format(new Date(ann.created_at), "MMM d, yyyy · h:mm a")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {ann.pinned && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  <Pin size={10} /> Pinned
                </span>
              )}
              {tc && (
                <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${tc.bg} ${tc.text} border ${tc.border}`}>
                  <tc.icon size={10} /> {tc.label}
                </span>
              )}
              {isEditor && (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => onEdit(ann)} className="p-1 hover:bg-gray-200 rounded text-gray-500" title="Edit">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => onDelete(ann.id)} className="p-1 hover:bg-red-100 rounded text-red-400" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4">
            <h3 className="text-base font-bold text-gray-900">{ann.title}</h3>
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-line">{ann.content}</p>
            {ann.event_date && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-[#1E3A5F] font-medium">
                <Calendar size={12} />
                {format(new Date(ann.event_date), "MMM d, yyyy · h:mm a")}
              </div>
            )}
            {ann.link_url && (
              <a
                href={ann.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#1557C0] hover:underline"
              >
                <ExternalLink size={12} /> Open Link
              </a>
            )}
          </div>

          <div className="flex items-center justify-between border-y border-gray-100 px-5 py-3">
            <AckButton actions={actions} size="md" />
            <span className="flex items-center gap-1 text-sm font-medium text-gray-500">
              <MessageSquare size={15} />
              {actions.commentCount} comment{actions.commentCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="px-5 py-4">
            <CommentSection actions={actions} autoFocus />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


const WELCOME_SUBTITLES: Record<UserRole, string> = {
  admin: "Here's what's happening with OSCA today.",
  director: "Here's an overview of OSCA operations today.",
  staff: "Here's what's happening with OSCA today.",
  coach: "Here's your team, sessions, and today's attendance.",
  pe_instructor: "Here's what's happening with OSCA activities today.",
  student: "Here's your attendance, updates, and account overview.",
};


function WelcomeSection({ user }: { user: User }) {
  return (
    <div className={`${CARD} p-6`}>
      <h2 className="text-xl font-bold text-[#0B1F3A] md:text-2xl">
        Welcome back, {user.first_name}! 👋
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {WELCOME_SUBTITLES[user.role] ?? "Here's what's happening with OSCA today."}
      </p>
    </div>
  );
}


function OSCABanner() {
  const { isDark } = useThemeStore();

  return (
    <div className="sticky top-0 z-30 -mx-5 -mt-5 mb-6 overflow-hidden rounded-b-[20px] lg:-mx-7 lg:-mt-7 lg:mb-7">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/NAAP.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        className={
          isDark
            ? "absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/90 via-[#123B68]/55 to-[#1E3A5F]/30"
            : "absolute inset-0 bg-gradient-to-r from-[#061a38]/95 via-[#123b68]/75 to-[#123b68]/45"
        }
      />

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
      </div>
    </div>
  );
}


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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          wide
          icon={Users}
          label="Total Students"
          value={summary?.students.total ?? 0}
          sub={`${summary?.students.face_enrolled ?? 0} face-enrolled · ${summary?.students.enrollment_rate ?? 0}%`}
          tone="blue"
        />
        <StatCard
          wide
          icon={CheckCircle}
          label="Attendance Today"
          value={summary?.attendance.today ?? 0}
          sub="Scans recorded today"
          tone="green"
        />
        <StatCard
          wide
          icon={Package}
          label="Equipment Available"
          value={summary?.equipment.available ?? 0}
          sub={`${summary?.equipment.borrowed ?? 0} currently borrowed`}
          tone="indigo"
        />
        <StatCard
          wide
          icon={AlertTriangle}
          label="Overdue Returns"
          value={summary?.transactions.overdue ?? 0}
          sub="Transactions past due"
          tone={summary?.transactions.overdue ? "red" : "gray"}
          valueCls={summary?.transactions.overdue ? "text-red-600" : ""}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="Attendance This Week"
          subtitle="Scans logged from Monday to Sunday"
          icon={TrendingUp}
          className="h-full"
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
          <div className="h-[200px]">
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

        <SectionCard
          title="Equipment Status"
          subtitle="Current availability across the inventory"
          icon={Package}
          className="h-full"
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
          <div className="h-[200px]">
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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.key}
            wide
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            sub={stat.sub}
            tone={toneFromLegacy(stat.color)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <SectionCard
          title="Attendance This Week"
          subtitle="Your scans from the past seven days"
          icon={TrendingUp}
          className="lg:col-span-12"
        >
          <div className="h-[240px]">
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
      </div>

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


function eligibilityTone(status?: AthleteEligibility["status"] | null): string {
  if (status === "eligible") return "green";
  if (status === "restricted") return "amber";
  if (status === "ineligible") return "red";
  return "blue";
}

function InfoTile({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: string;
}) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.chip}`}>
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-400">{label}</p>
          <p className="truncate text-sm font-bold capitalize text-[#0B1F3A]">{value}</p>
        </div>
      </div>
    </div>
  );
}

interface StudentViewProps {
  user: User;
  studentRecords?: PaginatedResponse<AttendanceRecord>;
  studentTodayAttendance: number;
  attendanceTrend: { day: string; scans: number }[];
  announcements: Announcement[];
  isEditor: boolean;
  summary?: DashboardSummary;
  onCreateAnnouncement: () => void;
  onEditAnnouncement: (a: Announcement) => void;
  onDeleteAnnouncement: (id: string) => void;
}

function StudentView({
  user,
  studentRecords,
  studentTodayAttendance,
  attendanceTrend,
  announcements,
  isEditor,
  onCreateAnnouncement,
  onEditAnnouncement,
  onDeleteAnnouncement,
}: StudentViewProps) {
  const weekStats = useMemo(() => {
    const items = studentRecords?.items ?? [];
    let present = 0,
      late = 0,
      absent = 0,
      excused = 0;
    for (const r of items) {
      const s = r.status?.toLowerCase();
      if (s === "present") present++;
      else if (s === "late") late++;
      else if (s === "absent") absent++;
      else if (s === "excused") excused++;
    }
    const total = present + late + absent + excused;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, excused, rate };
  }, [studentRecords]);

  const { data: eligibilityData } = useQuery<PaginatedResponse<AthleteEligibility>>({
    queryKey: ["student-eligibility", user?.id],
    queryFn: async () => {
      const res = await eligibilityApi.list({ page_size: 1 });
      return res.data;
    },
    enabled: !!user?.id,
  });
  const eligibility = eligibilityData?.items?.[0] ?? null;

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3A] md:text-2xl">
              Welcome back, {user.first_name}! 👋
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Here's your attendance, updates, and account overview.
            </p>
          </div>
          {user.sport_or_art && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1557C0]/10 px-3 py-1 text-xs font-semibold text-[#1557C0]">
              <Trophy size={14} /> {user.sport_or_art}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          wide
          icon={CheckCircle}
          label="Attendance Today"
          value={studentTodayAttendance}
          sub="Your scans today"
          tone="green"
        />
        <StatCard wide icon={Percent} label="Attendance Rate" value={`${weekStats.rate}%`} sub="This week" tone="blue" />
        <StatCard wide icon={Award} label="Present" value={weekStats.present} sub="This week" tone="indigo" />
        <StatCard
          wide
          icon={Clock}
          label="Late / Absent"
          value={`${weekStats.late} / ${weekStats.absent}`}
          sub="This week"
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <SectionCard title="Attendance This Week" subtitle="Your scans from the past seven days" icon={TrendingUp}>
            <div className="h-[240px]">
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
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <SectionCard title="My Attendance" subtitle="This week's breakdown" icon={CalendarCheck}>
            <div className="space-y-2.5">
              {[
                { label: "Present", value: weekStats.present, cls: "text-emerald-600" },
                { label: "Late", value: weekStats.late, cls: "text-amber-600" },
                { label: "Absent", value: weekStats.absent, cls: "text-red-500" },
                { label: "Excused", value: weekStats.excused, cls: "text-blue-600" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
                >
                  <span className="text-sm font-medium text-gray-500">{row.label}</span>
                  <span className={`text-xl font-extrabold tabular-nums ${row.cls}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-[#1557C0]/5 px-4 py-3">
                <span className="text-sm font-medium text-[#1557C0]">Attendance Rate</span>
                <span className="text-xl font-extrabold tabular-nums text-[#1557C0]">{weekStats.rate}%</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <AnnouncementsFeed
        announcements={announcements}
        isEditor={isEditor}
        onCreate={onCreateAnnouncement}
        onEdit={onEditAnnouncement}
        onDelete={onDeleteAnnouncement}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={Trophy} label="Assigned Sport / Art" value={user.sport_or_art ?? "—"} />
        <InfoTile
          icon={ShieldCheck}
          label="Eligibility Status"
          value={eligibility ? eligibility.status.replace("_", " ") : "No record"}
          tone={eligibilityTone(eligibility?.status)}
        />
        <InfoTile
          icon={UserCheck}
          label="Account Status"
          value={user.is_active ? "Active" : "Inactive"}
          tone={user.is_active ? "green" : "red"}
        />
        <InfoTile
          icon={ScanFace}
          label="Face Recognition"
          value={user.is_face_enrolled ? "Enrolled" : "Not Enrolled"}
          tone={user.is_face_enrolled ? "green" : "amber"}
        />
      </div>
    </div>
  );
}


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

  const studentTodayAttendance = (() => {
    if (role !== "student" || !studentRecords?.items) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return studentRecords.items.filter((r) => {
      if (!r.time_in) return false;
      return new Date(r.time_in) >= todayStart;
    }).length;
  })();

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

  const stats = allStats.filter((s) => {
    if (role === "student") return s.key === "attendance";
    if (role === "pe_instructor") return s.key === "equipment" || s.key === "overdue";
    if (role === "coach") return s.key !== "students" && s.key !== "pending";
    return true;
  });

  const equipmentChartData = summary
    ? [
        { name: "Available", qty: summary.equipment.available, fill: "#22c55e" },
        { name: "Borrowed", qty: summary.equipment.borrowed, fill: "#6366f1" },
      ]
    : [];

  const attendanceTrend = (() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (role === "student" && studentRecords?.items) {
      const dayCount = [0, 0, 0, 0, 0, 0, 0];
      const now = new Date();
      for (const rec of studentRecords.items) {
        if (!rec.time_in) continue;
        const d = new Date(rec.time_in);
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0 || diffDays > 6) continue;
        const dayIdx = (d.getDay() + 6) % 7;
        dayCount[dayIdx]++;
      }
      return days.map((day, i) => ({ day, scans: dayCount[i] }));
    }
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
      <OSCABanner />

      {announcementModal && (
        <AnnouncementFormModal
          existing={announcementModal === "new" ? undefined : announcementModal}
          onClose={() => setAnnouncementModal(null)}
        />
      )}

      {role === "student" ? (
        <StudentView
          user={user}
          studentRecords={studentRecords}
          studentTodayAttendance={studentTodayAttendance}
          attendanceTrend={attendanceTrend}
          announcements={announcements}
          isEditor={isEditor}
          {...announcementHandlers}
        />
      ) : (
        <div className="space-y-7">
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
      )}
    </>
  );
}
