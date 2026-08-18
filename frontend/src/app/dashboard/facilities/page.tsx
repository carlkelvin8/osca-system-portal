"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facilitiesApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  Building2,
  Eye,
  Pencil,
  X,
  Loader2,
  Activity,
  Calendar,
  Clock,
  Plus,
  Trash2,
  ImageUp,
  CalendarPlus,
  AlertTriangle,
} from "lucide-react";
import type { Facility, PaginatedResponse, ReservationCreate, VenueReservation } from "@/types";

type VenueDef = { name: string; image: string };

const RES_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
};

const VENUES: VenueDef[] = [
  { name: "Covered Court", image: "/covered_court.png" },
  { name: "Upper Gym", image: "/upper_gym.png" },
  { name: "Band Room", image: "/band_room.jpg" },
  { name: "CAU Studio", image: "/cau_studio.png" },
  { name: "Open Ground", image: "/open_ground.png" },
  { name: "Weights Room", image: "/weights_room.jpg" },
];

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  available: { label: "Available", className: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500" },
  in_use: { label: "In Use", className: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  maintenance: { label: "Under Maintenance", className: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500" },
  closed: { label: "Closed", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  reserved: { label: "Reserved", className: "bg-indigo-100 text-indigo-800 border-indigo-200", dot: "bg-indigo-500" },
};

function venueImageOf(name: string) {
  return VENUES.find((v) => v.name === name)?.image ?? "";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function VenueImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#1E3A5F] to-[#16304f]">
        <Building2 size={44} className="text-white/40" />
        <span className="text-xs text-white/50">No image available</span>
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setErrored(true)} className="w-full h-full object-cover" />;
}

const STATUS_BADGE = (status: string) => {
  const st = STATUS_CONFIG[status] ?? STATUS_CONFIG.available;
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shadow-sm ${st.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
};

const statusOptions = [
  { value: "available", label: "Available" },
  { value: "maintenance", label: "Under Maintenance" },
  { value: "closed", label: "Closed" },
];

export default function FacilitiesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "admin" || role === "director" || role === "staff";
  const isRequester = role === "coach" || role === "pe_instructor";
  const queryClient = useQueryClient();

  const [viewFacility, setViewFacility] = useState<Facility | null>(null);
  const [editFacility, setEditFacility] = useState<Facility | null>(null);
  const [deleteFacility, setDeleteFacility] = useState<Facility | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const [editForm, setEditForm] = useState({ status: "available", description: "", notes: "" });
  const [addForm, setAddForm] = useState({ name: "", description: "", notes: "" });
  const [reqForm, setReqForm] = useState<ReservationCreate>({
    facility_id: "",
    purpose: "",
    reservation_date: new Date().toISOString().slice(0, 10),
    start_time: "08:00:00",
    end_time: "10:00:00",
    remarks: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [reqError, setReqError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Facility>>({
    queryKey: ["facilities"],
    queryFn: async () => (await facilitiesApi.list({ page_size: 50 })).data,
  });

  const { data: venueReservations, isLoading: resLoading } = useQuery<VenueReservation[]>({
    queryKey: ["venue-reservations", viewFacility?.id],
    queryFn: async () =>
      viewFacility ? (await facilitiesApi.listVenueReservations(viewFacility.id)).data : [],
    enabled: !!viewFacility,
  });

  const facilities = data?.items ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data: body }: { id: string; data: Record<string, unknown> }) =>
      facilitiesApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setEditFacility(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => facilitiesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setDeleteFacility(null);
    },
  });

  const imageMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return facilitiesApi.uploadImage(id, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setEditFacility(null);
      setShowAdd(false);
      setImageFile(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => facilitiesApi.create(data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      if (imageFile) {
        await imageMutation.mutateAsync({ id: res.data.id, file: imageFile });
      }
      setShowAdd(false);
      setAddForm({ name: "", description: "", notes: "" });
      setImageFile(null);
    },
  });

  const requestMutation = useMutation({
    mutationFn: (data: ReservationCreate) => facilitiesApi.createReservation(data as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facility-reservations"] });
      setShowRequest(false);
      setReqForm({
        facility_id: "",
        purpose: "",
        reservation_date: new Date().toISOString().slice(0, 10),
        start_time: "08:00:00",
        end_time: "10:00:00",
        remarks: "",
      });
      setReqError("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Unable to submit the request.";
      setReqError(msg);
    },
  });

  const openEdit = (f: Facility) => {
    setEditForm({ status: f.status, description: f.description ?? "", notes: f.notes ?? "" });
    setEditFacility(f);
  };

  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (reqForm.end_time <= reqForm.start_time) {
      setReqError("End time must be after start time.");
      return;
    }
    setReqError("");
    requestMutation.mutate(reqForm);
  };

  if (role === "student") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={40} className="text-red-400 mb-4" />
        <h1 className="text-lg font-bold text-[#111827]">Access Denied</h1>
        <p className="text-sm text-gray-500 mt-1">You do not have permission to view facilities.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 size={22} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Facility Monitoring</h1>
            <p className="text-sm text-gray-500">Venue availability across OSCA</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isRequester && (
            <button
              onClick={() => setShowRequest(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] transition-colors"
            >
              <CalendarPlus size={15} /> Request Venue
            </button>
          )}
          {isManager && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] transition-colors"
            >
              <Plus size={15} /> Add Venue
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {facilities.map((fac) => {
            const st = STATUS_CONFIG[fac.status] ?? STATUS_CONFIG.available;
            return (
              <div
                key={fac.id}
                className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col"
              >
                <div className="relative aspect-video">
                  <VenueImage src={fac.image_url ?? venueImageOf(fac.name)} alt={fac.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <span className={`absolute top-3 right-3 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border shadow-sm ${st.className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                  <h3 className="absolute bottom-3 left-4 text-white font-semibold text-lg drop-shadow">{fac.name}</h3>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <p className="text-sm text-gray-500 line-clamp-2 flex-1 min-h-[2.5rem]">
                    {fac.description || "No description available."}
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setViewFacility(fac)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                    >
                      <Eye size={14} /> View Details
                    </button>
                    {isManager && (
                      <button
                        onClick={() => openEdit(fac)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] transition-colors"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    )}
                    {isRequester && (
                      <button
                        onClick={() => {
                          setReqForm({ ...reqForm, facility_id: fac.id });
                          setShowRequest(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] transition-colors"
                      >
                        <CalendarPlus size={14} /> Request
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="relative aspect-video shrink-0">
              <VenueImage src={viewFacility.image_url ?? venueImageOf(viewFacility.name)} alt={viewFacility.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <button onClick={() => setViewFacility(null)} className="absolute top-3 left-3 text-white bg-black/30 rounded-full p-1.5 hover:bg-black/50 transition-colors"><X size={16} /></button>
              {STATUS_BADGE(viewFacility.status)}
              <h2 className="absolute bottom-3 left-4 text-white font-bold text-xl drop-shadow">{viewFacility.name}</h2>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Activity size={15} className="text-[#9ca3af] shrink-0" /> Status
                </div>
                {STATUS_BADGE(viewFacility.status)}
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar size={15} className="text-[#9ca3af] shrink-0" /> Date Created
                </div>
                <span className="text-sm font-medium text-[#111827]">{formatDateTime(viewFacility.created_at)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Clock size={15} className="text-[#9ca3af] shrink-0" /> Last Updated
                </div>
                <span className="text-sm font-medium text-[#111827]">{formatDateTime(viewFacility.updated_at)}</span>
              </div>

              <div className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#111827]">Upcoming Reservations</h3>
                  {resLoading && <Loader2 size={14} className="animate-spin text-gray-400" />}
                </div>
                {!resLoading && venueReservations && venueReservations.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
                    No upcoming reservations
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                          <th className="py-2 pr-2 font-semibold">Date</th>
                          <th className="py-2 pr-2 font-semibold">Time</th>
                          <th className="py-2 pr-2 font-semibold">Purpose</th>
                          <th className="py-2 font-semibold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(venueReservations ?? []).map((r) => {
                          const rs = RES_STATUS[r.status] ?? RES_STATUS.pending;
                          return (
                            <tr key={r.id} className="border-b last:border-0 border-gray-50">
                              <td className="py-2 pr-2 whitespace-nowrap text-[#374151]">{r.reservation_date}</td>
                              <td className="py-2 pr-2 whitespace-nowrap text-[#374151]">
                                {formatTime(r.start_time)} – {formatTime(r.end_time)}
                              </td>
                              <td className="py-2 pr-2 text-[#374151] max-w-[9rem] truncate" title={r.purpose}>{r.purpose}</td>
                              <td className="py-2 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${rs.className}`}>{rs.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="relative aspect-video shrink-0">
              <VenueImage src={editFacility.image_url ?? venueImageOf(editFacility.name)} alt={editFacility.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <button onClick={() => setEditFacility(null)} className="absolute top-3 left-3 text-white bg-black/30 rounded-full p-1.5 hover:bg-black/50 transition-colors"><X size={16} /></button>
              <h2 className="absolute bottom-3 left-4 text-white font-bold text-xl drop-shadow">Edit {editFacility.name}</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({ id: editFacility.id, data: editForm });
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Enter a brief description..."
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Optional internal notes..."
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Venue Image</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                  >
                    <ImageUp size={14} /> {imageFile ? imageFile.name : "Change Image"}
                  </button>
                  {imageFile && (
                    <button
                      type="button"
                      onClick={() => setImageFile(null)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setEditFacility(null); setImageFile(null); }}
                  className="px-4 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                {imageFile ? (
                  <button
                    type="button"
                    disabled={imageMutation.isPending}
                    onClick={() => imageMutation.mutate({ id: editFacility.id, file: imageFile })}
                    className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] disabled:opacity-50 transition-colors"
                  >
                    {imageMutation.isPending ? "Uploading..." : "Upload Image"}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] disabled:opacity-50 transition-colors"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                )}
              </div>
              <div className="pt-2 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteFacility(editFacility)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} /> Delete Venue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="relative aspect-video shrink-0">
              <VenueImage src={imageFile ? URL.createObjectURL(imageFile) : ""} alt="New venue" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <button onClick={() => { setShowAdd(false); setImageFile(null); }} className="absolute top-3 left-3 text-white bg-black/30 rounded-full p-1.5 hover:bg-black/50 transition-colors"><X size={16} /></button>
              <h2 className="absolute bottom-3 left-4 text-white font-bold text-xl drop-shadow">Add Venue</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name: addForm.name,
                  description: addForm.description || null,
                  notes: addForm.notes || null,
                  status: "available",
                });
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Venue Name</label>
                <input
                  required
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g. Covered Court"
                  list="venue-suggestions"
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                />
                <datalist id="venue-suggestions">
                  {VENUES.map((v) => (
                    <option key={v.name} value={v.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Enter a brief description..."
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  placeholder="Optional internal notes..."
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Venue Image (optional)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                  >
                    <ImageUp size={14} /> {imageFile ? imageFile.name : "Choose Image"}
                  </button>
                  {imageFile && (
                    <button type="button" onClick={() => setImageFile(null)} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setImageFile(null); }}
                  className="px-4 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || imageMutation.isPending}
                  className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending || imageMutation.isPending ? "Creating..." : "Create Venue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-[#111827]">Request Venue</h2>
              <button onClick={() => { setShowRequest(false); setReqError(""); }} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={submitRequest} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Venue</label>
                <select
                  required
                  value={reqForm.facility_id}
                  onChange={(e) => setReqForm({ ...reqForm, facility_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                >
                  <option value="" disabled>Select a venue...</option>
                  {facilities.map((f) => (
                    <option
                      key={f.id}
                      value={f.id}
                      disabled={f.status === "maintenance" || f.status === "closed"}
                    >
                      {f.name}
                      {f.status === "maintenance" ? " (Under Maintenance)" : f.status === "closed" ? " (Closed)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Date</label>
                <input
                  required
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={reqForm.reservation_date}
                  onChange={(e) => setReqForm({ ...reqForm, reservation_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1.5">Start Time</label>
                  <input
                    required
                    type="time"
                    value={reqForm.start_time.slice(0, 5)}
                    onChange={(e) => setReqForm({ ...reqForm, start_time: `${e.target.value}:00` })}
                    className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1.5">End Time</label>
                  <input
                    required
                    type="time"
                    value={reqForm.end_time.slice(0, 5)}
                    onChange={(e) => setReqForm({ ...reqForm, end_time: `${e.target.value}:00` })}
                    className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Purpose</label>
                <textarea
                  required
                  rows={2}
                  value={reqForm.purpose}
                  onChange={(e) => setReqForm({ ...reqForm, purpose: e.target.value })}
                  placeholder="e.g. Basketball practice"
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">Remarks (optional)</label>
                <textarea
                  rows={2}
                  value={reqForm.remarks ?? ""}
                  onChange={(e) => setReqForm({ ...reqForm, remarks: e.target.value })}
                  placeholder="Additional notes for the approver..."
                  className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
                />
              </div>
              {reqError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{reqError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowRequest(false); setReqError(""); }}
                  className="px-4 py-2 text-sm border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestMutation.isPending}
                  className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-medium hover:bg-[#16304f] disabled:opacity-50 transition-colors"
                >
                  {requestMutation.isPending ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteFacility && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete Venue</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Are you sure you want to delete <span className="font-semibold">{deleteFacility.name}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteFacility(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteFacility.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
