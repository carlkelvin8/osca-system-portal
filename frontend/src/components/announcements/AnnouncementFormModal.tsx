"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, ElementType, FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, ImagePlus, Loader2, Megaphone, PartyPopper, Pin, X } from "lucide-react";
import { announcementsApi } from "@/lib/api";
import type { Announcement } from "@/types";

export const tagConfig: Record<string, { label: string; icon: ElementType; bg: string; text: string; border: string }> = {
  urgent: { label: "Urgent", icon: AlertTriangle, bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
  event: { label: "Event", icon: PartyPopper, bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-300" },
  notice: { label: "Notice", icon: Megaphone, bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
};

export const VISIBILITY_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "all_dashboards", label: "All Dashboards", desc: "Dashboards only" },
  { value: "public_website", label: "Public Website", desc: "Public site only" },
  { value: "both", label: "Both", desc: "Dashboards + public site" },
];

export function announcementImages(ann: Announcement | undefined): string[] {
  if (!ann) return [];
  if (ann.image_urls && ann.image_urls.length) return ann.image_urls;
  return ann.image_url ? [ann.image_url] : [];
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface AnnouncementFormProps {
  existing?: Announcement;
  onClose: () => void;
}

export function AnnouncementFormModal({ existing, onClose }: AnnouncementFormProps) {
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
  const [visibility, setVisibility] = useState<string>(existing?.visibility ?? "all_dashboards");
  const [linkUrl, setLinkUrl] = useState<string>(existing?.link_url ?? "");
  const [newImages, setNewImages] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [existingImages] = useState<string[]>(() => announcementImages(existing));
  const [removedExisting, setRemovedExisting] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { mutate: saveAnnouncement, isPending } = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title,
        content,
        event_date: eventDate ? new Date(eventDate).toISOString() : null,
        tag,
        pinned,
        visibility,
        link_url: linkUrl.trim() || null,
      };
      let annId: string;
      if (existing) {
        const res = await announcementsApi.update(existing.id, payload);
        annId = existing.id;
      } else {
        const res = await announcementsApi.create(payload);
        annId = res.data.id as string;
      }
      for (const img of newImages) {
        await announcementsApi.uploadImage(annId, img.file);
      }
      const toRemove = [...removedExisting].sort((a, b) => b - a);
      for (const idx of toRemove) {
        await announcementsApi.deleteImage(annId, idx);
      }
    },
    onSuccess: () => {
      newImages.forEach((img) => URL.revokeObjectURL(img.preview));
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      onClose();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const status = axiosErr?.response?.status;
      const detail = axiosErr?.response?.data?.detail;
      const msg = detail
        ? `${detail}${status ? ` (HTTP ${status})` : ""}`
        : status
          ? `Failed to save announcement (HTTP ${status}).`
          : axiosErr?.message || "Failed to save announcement.";
      setError(msg);
    },
  });

  const handleFilesChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const accepted: { id: string; file: File; preview: string }[] = [];
    let rejected = "";
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejected = "Only JPEG, PNG, and WebP images are allowed.";
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        rejected = "Each image must be 5 MB or smaller.";
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    if (accepted.length) {
      setNewImages((prev) => [...prev, ...accepted]);
      setError(null);
    }
    if (rejected) setError(rejected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeNewImage = (id: string) => {
    setNewImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((img) => img.id !== id);
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!content.trim()) { setError("Content is required."); return; }
    saveAnnouncement();
  };

  const visibleExisting = existingImages
    .map((url, idx) => ({ url, idx, removed: removedExisting.includes(idx) }))
    .filter((img) => !img.removed);
  const totalImages = visibleExisting.length + newImages.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {existing ? "Edit Announcement" : "New Announcement"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Publish To</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {VISIBILITY_OPTIONS.map((opt) => {
                const selected = visibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setVisibility(opt.value)}
                    className={`flex flex-col items-start gap-0.5 px-3 py-2 text-left text-xs rounded-lg border transition ${
                      selected
                        ? "border-[#1E3A5F] bg-[#1E3A5F]/5 ring-2 ring-[#1E3A5F]/20"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <span className={`flex items-center gap-1.5 font-semibold ${selected ? "text-[#1E3A5F]" : "text-gray-600"}`}>
                      <span className={`inline-block w-3 h-3 rounded-full border-2 ${selected ? "border-[#1E3A5F] bg-[#1E3A5F]" : "border-gray-300 bg-white"}`} />
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link / URL <span className="text-gray-400 font-normal">(optional — makes the announcement clickable)</span>
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com/path"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Images <span className="text-gray-400 font-normal">(optional — JPEG, PNG, WebP · max 5 MB each)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFilesChange}
              className="hidden"
            />
            {totalImages > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {visibleExisting.map(({ url, idx }) => (
                  <div key={`ex-${idx}`} className="relative group aspect-square bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <img
                      src={url}
                      alt="Existing"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setRemovedExisting((prev) => [...prev, idx])}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition"
                      title="Remove image"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {newImages.map((img) => (
                  <div key={img.id} className="relative group aspect-square bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <img
                      src={img.preview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(img.id)}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition"
                      title="Remove image"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {removedExisting.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {existingImages
                  .map((url, idx) => ({ url, idx, removed: removedExisting.includes(idx) }))
                  .filter((img) => img.removed)
                  .map(({ url, idx }) => (
                    <button
                      key={`rm-${idx}`}
                      type="button"
                      onClick={() => setRemovedExisting((prev) => prev.filter((i) => i !== idx))}
                      className="flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition"
                      title="Restore image"
                    >
                      <img src={url} alt="" className="w-6 h-6 object-contain rounded" />
                      <span className="line-through">Removed</span>
                    </button>
                  ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition w-full justify-center"
            >
              <ImagePlus size={16} />
              {totalImages > 0 ? "Add more images" : "Choose images"}
            </button>
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
              {isPending
                ? <><Loader2 size={14} className="animate-spin" /> {existing ? "Saving…" : "Posting…"}</>
                : existing ? "Save Changes" : "Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
