"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportsApi, announcementsApi, usersApi } from "@/lib/api";
import { Users, CheckCircle, Package, AlertTriangle, Plus, Pencil, Trash2, Calendar, X, Loader2, Clock, ImagePlus, Megaphone, PartyPopper, Pin, MessageSquare, ThumbsUp } from "lucide-react";
import type { UserSummary } from "@/types";
import type { DashboardSummary, Announcement, PaginatedResponse } from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { format, formatDistanceToNow } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Announcement Form Modal ────────────────────────────────────────────────────

const tagConfig: Record<string, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  urgent: { label: "Urgent", icon: AlertTriangle, bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  event: { label: "Event", icon: PartyPopper, bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  notice: { label: "Notice", icon: Megaphone, bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
};

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

// ── Main Dashboard Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [announcementModal, setAnnouncementModal] = useState<"new" | Announcement | null>(null);

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
    enabled: user?.role === "staff" || user?.role === "admin" || user?.role === "director",
    refetchInterval: 30_000,
  });
  const pendingCount = pendingData?.total ?? 0;

  const isEditor = user?.role === "admin" || user?.role === "director" || user?.role === "staff";
  const announcements = [...(announcementsData?.items ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1E3A5F]" />
      </div>
    );
  }

  const role = user?.role;

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
      value: summary?.attendance.today ?? 0,
      sub: role === "coach" && user?.sport_or_art
        ? `Scans recorded today · ${user.sport_or_art}`
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

  // Weekly attendance trend (last 7 days mock based on today's data)
  const attendanceTrend = (() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const today = new Date().getDay();
    return days.map((d, i) => ({
      day: d,
      scans: i <= (today === 0 ? 6 : today - 1) ? Math.floor(Math.random() * (summary?.attendance.today || 5) + 2) : 0,
    }));
  })();

  return (
    <>
      {announcementModal && (
        <AnnouncementFormModal
          existing={announcementModal === "new" ? undefined : announcementModal}
          onClose={() => setAnnouncementModal(null)}
        />
      )}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">OSCA Attendance & Inventory Overview</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white rounded-xl shadow-sm p-6 flex items-start gap-4">
                <div className={`${stat.color} p-3 rounded-xl text-white`}>
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-sm font-medium text-gray-700">{stat.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom grid: charts + announcements */}
        <div className={`grid grid-cols-1 ${role === "student" ? "lg:grid-cols-1" : "lg:grid-cols-2"} gap-6`}>
          {/* Attendance Trend */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Attendance This Week</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={attendanceTrend} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="scans" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Equipment Status — hidden for students */}
          {role !== "student" && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">Equipment Status</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={equipmentChartData} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="#1E3A5F" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Announcements Feed */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-800">Updates & Notices</h2>
            {isEditor && (
              <button
                onClick={() => setAnnouncementModal("new")}
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
              {announcements.map((ann) => {
                const tc = ann.tag ? tagConfig[ann.tag] : null;
                const TagIcon = tc?.icon;
                return (
                  <div key={ann.id} className={`group border rounded-xl overflow-hidden transition ${ann.pinned ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white"}`}>
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
                            <TagIcon size={10} /> {tc.label}
                          </span>
                        )}
                        {isEditor && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={(e) => { e.stopPropagation(); setAnnouncementModal(ann); }}
                              className="p-1 hover:bg-gray-200 rounded text-gray-500"
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteAnnouncement(ann.id); }}
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

                    {/* Divider */}
                    <div className="border-t border-gray-100 mx-4" />

                    {/* Actions */}
                    <div className="flex items-center gap-1 px-4 py-2">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition">
                        <ThumbsUp size={13} /> Acknowledge
                      </button>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition">
                        <MessageSquare size={13} /> Comment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

          <p className="text-xs text-gray-400 text-right">
            Last updated:{" "}
            {summary ? new Date(summary.generated_at).toLocaleString("en-PH") : "—"}
          </p>
        </div>
      </>
    );
}
