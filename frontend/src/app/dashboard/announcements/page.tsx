"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { announcementsApi } from "@/lib/api";
import { AnnouncementFormModal } from "@/components/announcements/AnnouncementFormModal";
import { useAuthStore } from "@/store/useAuthStore";
import type { Announcement, PaginatedResponse } from "@/types";

const PUBLISH_TO_FILTERS = [
  { value: "", label: "All Locations" },
  { value: "all_dashboards", label: "All Dashboards" },
  { value: "public_website", label: "Public Website" },
  { value: "both", label: "Both" },
];

const STATUS_FILTERS = [
  { value: "", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "deleted", label: "Deleted" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const PUBLISH_LABELS: Record<string, string> = {
  all_dashboards: "All Dashboards",
  public_website: "Public Website",
  both: "Both",
};

const PUBLISH_CLASSES: Record<string, string> = {
  all_dashboards: "bg-gray-100 text-gray-600",
  public_website: "bg-sky-100 text-sky-700",
  both: "bg-violet-100 text-violet-700",
};

const PAGE_SIZE = 10;

export default function AnnouncementManagementPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isEditor = role === "admin" || role === "director" || role === "staff";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [publishTo, setPublishTo] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"new" | Announcement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Announcement | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Announcement | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching } = useQuery<PaginatedResponse<Announcement>>({
    queryKey: ["announcements", "manage", { search: debouncedSearch, publishTo, status, sort, page }],
    enabled: isEditor,
    queryFn: async () =>
      (
        await announcementsApi.manageList({
          search: debouncedSearch || undefined,
          publish_to: publishTo || undefined,
          status: status || undefined,
          sort,
          page,
          page_size: PAGE_SIZE,
        })
      ).data,
  });

  const { mutate: deleteAnnouncement, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => {
      return announcementsApi.remove(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setDeleteTarget(null);
      setToast({ type: "success", message: "Announcement moved to trash." });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string }; status?: number } })?.response?.data?.detail ??
        (err as { response?: { status?: number } })?.response?.status
          ? `Failed to delete announcement (HTTP ${ (err as { response: { status: number } }).response.status }).`
          : "Failed to delete announcement.";
      setToast({ type: "error", message: msg });
      setDeleteTarget(null);
    },
  });

  const { mutate: restoreAnnouncement, isPending: isRestoring } = useMutation({
    mutationFn: (id: string) => {
      return announcementsApi.restore(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setRestoreTarget(null);
      setToast({ type: "success", message: "Announcement restored successfully." });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to restore announcement.";
      setToast({ type: "error", message: msg });
      setRestoreTarget(null);
    },
  });

  const { mutate: permanentDeleteAnnouncement, isPending: isPermanentDeleting } = useMutation({
    mutationFn: (id: string) => {
      return announcementsApi.permanentDelete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setPermanentDeleteTarget(null);
      setToast({ type: "success", message: "Announcement permanently deleted." });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to permanently delete announcement.";
      setToast({ type: "error", message: msg });
      setPermanentDeleteTarget(null);
    },
  });

  if (!role) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>;
  }

  if (!isEditor) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={40} className="text-red-400 mb-4" />
        <h1 className="text-lg font-bold text-[#111827]">Access Denied</h1>
        <p className="text-sm text-gray-500 mt-1">You do not have permission to manage announcements.</p>
      </div>
    );
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1557C0]/10 text-[#1557C0]">
              <Megaphone size={20} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-[#111827]">Announcement Management</h1>
              <p className="text-sm text-gray-500">
                Create, edit, and remove announcements published to dashboards and the public website.
              </p>
            </div>
          </div>
          <button
            onClick={() => setModal("new")}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#16304f]"
          >
            <Plus size={15} />
            Create Announcement
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search announcements…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
            />
          </div>
          <select
            value={publishTo}
            onChange={(e) => { setPublishTo(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
          >
            {PUBLISH_TO_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
          >
            {SORT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/70 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Title</th>
                <th className="px-5 py-3 font-semibold">Publish To</th>
                <th className="px-5 py-3 font-semibold">Date Posted</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created By</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isFetching && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Loader2 size={22} className="mx-auto animate-spin text-gray-400" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-500">
                    No announcements match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((ann) => (
                  <tr key={ann.id} className="transition hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{ann.title}</p>
                      <p className="mt-0.5 line-clamp-2 max-w-[24rem] whitespace-pre-line text-xs text-gray-500">{ann.content}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${PUBLISH_CLASSES[ann.visibility ?? "all_dashboards"]}`}
                      >
                        <Globe size={11} />
                        {PUBLISH_LABELS[ann.visibility ?? "all_dashboards"]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600">
                      {format(new Date(ann.created_at), "MMM d, yyyy · h:mm a")}
                    </td>
                    <td className="px-5 py-3">
                      {ann.deleted_at ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Deleted
                        </span>
                      ) : ann.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{ann.created_by_name || "OSCA Admin"}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {ann.deleted_at ? (
                          <>
                            <button
                              onClick={() => setRestoreTarget(ann)}
                              title="Restore announcement"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                            >
                              <RotateCcw size={15} />
                            </button>
                            <button
                              onClick={() => setPermanentDeleteTarget(ann)}
                              title="Delete permanently"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setModal(ann)}
                              title="Edit announcement"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#1557C0]"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(ann)}
                              title="Delete announcement"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-500">
            Showing {start}–{end} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={13} />
              Prev
            </button>
            <span className="text-xs text-gray-500">
              Page {page} of {Math.max(1, pages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || pages === 0 || isFetching}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <AnnouncementFormModal
          existing={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <Trash2 size={20} />
              </span>
              <div>
                <h3 className="font-bold text-gray-900">Delete this announcement?</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  The announcement will be moved to the trash. You can restore it later or delete it permanently.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAnnouncement(deleteTarget.id)}
                disabled={isDeleting}
                className="flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreTarget && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setRestoreTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <RotateCcw size={20} />
              </span>
              <div>
                <h3 className="font-bold text-gray-900">Restore this announcement?</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  The announcement will be reactivated and become visible in its original locations.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setRestoreTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => restoreAnnouncement(restoreTarget.id)}
                disabled={isRestoring}
                className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  "Restore"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {permanentDeleteTarget && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setPermanentDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <Trash2 size={20} />
              </span>
              <div>
                <h3 className="font-bold text-gray-900">Permanently delete?</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  This action cannot be undone. The announcement will be permanently removed from the database.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setPermanentDeleteTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => permanentDeleteAnnouncement(permanentDeleteTarget.id)}
                disabled={isPermanentDeleting}
                className="flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isPermanentDeleting ? (
                  <>
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete Permanently"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
