"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facilitiesApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CalendarDays,
  Loader2,
  Eye,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { PaginatedResponse, VenueReservation } from "@/types";

const RES_STATUS: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
};

const RES_STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

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

export default function FacilityReservationsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "admin" || role === "director" || role === "staff";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [viewRes, setViewRes] = useState<VenueReservation | null>(null);
  const [rejectRes, setRejectRes] = useState<VenueReservation | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<VenueReservation>>({
    queryKey: ["facility-reservations", statusFilter],
    queryFn: async () =>
      (
        await facilitiesApi.listReservations(
          statusFilter ? { status: statusFilter, page_size: 100 } : { page_size: 100 }
        )
      ).data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => facilitiesApi.approveReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facility-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setViewRes(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      facilitiesApi.rejectReservation(id, { rejection_reason: reason || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facility-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setRejectRes(null);
      setRejectReason("");
      setRejectError("");
    },
    onError: (err: unknown) => {
      setRejectError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Unable to reject the request."
      );
    },
  });

  const rows = data?.items ?? [];

  if (role === "student") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={40} className="text-red-400 mb-4" />
        <h1 className="text-lg font-bold text-[#111827]">Access Denied</h1>
        <p className="text-sm text-gray-500 mt-1">You do not have permission to view venue reservations.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-[#1E3A5F]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Venue Reservation Requests</h1>
            <p className="text-sm text-gray-500">
              {isManager ? "Review and manage all venue reservation requests" : "Your venue reservation requests"}
            </p>
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[#d1d5db] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
        >
          {RES_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CalendarDays size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">No venue reservation requests found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9fafb] text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold">Requester</th>
                  <th className="px-4 py-3 font-semibold">Venue</th>
                  <th className="px-4 py-3 font-semibold">Purpose</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Requested At</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = RES_STATUS[r.status] ?? RES_STATUS.pending;
                  return (
                    <tr key={r.id} className="border-b last:border-0 border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#111827]">{r.requester_name ?? "—"}</p>
                        <p className="text-xs text-gray-400 capitalize">{r.requester_role?.replace("_", " ") ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 text-[#374151]">{r.facility_name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#374151] max-w-[16rem]">
                        <p className="truncate" title={r.purpose}>{r.purpose}</p>
                      </td>
                      <td className="px-4 py-3 text-[#374151] whitespace-nowrap">{r.reservation_date}</td>
                      <td className="px-4 py-3 text-[#374151] whitespace-nowrap">
                        {formatTime(r.start_time)} – {formatTime(r.end_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border w-fit ${st.className}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#374151] whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewRes(r)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] transition-colors"
                          >
                            <Eye size={13} /> View
                          </button>
                          {isManager && r.status === "pending" && (
                            <>
                              <button
                                onClick={() => approveMutation.mutate(r.id)}
                                disabled={approveMutation.isPending}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle2 size={13} /> Approve
                              </button>
                              <button
                                onClick={() => { setRejectRes(r); setRejectReason(""); setRejectError(""); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                              >
                                <XCircle size={13} /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isFetching && !isLoading && (
            <div className="flex justify-center py-3"><Loader2 className="animate-spin text-gray-400" size={16} /></div>
          )}
        </div>
      )}

      {viewRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-lg text-[#111827]">Reservation Details</h2>
              <button onClick={() => setViewRes(null)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                {(() => {
                  const st = RES_STATUS[viewRes.status] ?? RES_STATUS.pending;
                  return (
                    <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${st.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Requester</p>
                  <p className="text-sm font-medium text-[#111827]">{viewRes.requester_name ?? "—"}</p>
                  <p className="text-xs text-gray-400 capitalize">{viewRes.requester_role?.replace("_", " ") ?? ""}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Venue</p>
                  <p className="text-sm font-medium text-[#111827]">{viewRes.facility_name ?? "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Purpose</p>
                <p className="text-sm text-[#374151]">{viewRes.purpose}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Date</p>
                  <p className="text-sm font-medium text-[#111827]">{viewRes.reservation_date}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Time</p>
                  <p className="text-sm font-medium text-[#111827]">
                    {formatTime(viewRes.start_time)} – {formatTime(viewRes.end_time)}
                  </p>
                </div>
              </div>
              {viewRes.remarks && (
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Remarks</p>
                  <p className="text-sm text-[#374151]">{viewRes.remarks}</p>
                </div>
              )}
              {viewRes.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-500 font-semibold mb-0.5">Rejection Reason</p>
                  <p className="text-sm text-red-700">{viewRes.rejection_reason}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Requested At</p>
                  <p className="text-sm text-[#374151]">{formatDateTime(viewRes.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Last Updated</p>
                  <p className="text-sm text-[#374151]">{formatDateTime(viewRes.updated_at)}</p>
                </div>
              </div>
              {isManager && viewRes.status === "pending" && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => approveMutation.mutate(viewRes.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 size={15} /> Approve
                  </button>
                  <button
                    onClick={() => { setRejectRes(viewRes); setRejectReason(""); setRejectError(""); setViewRes(null); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                  >
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectRes && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <XCircle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Reject Reservation</h3>
                <p className="text-sm text-gray-500">
                  {rejectRes.facility_name} — {rejectRes.reservation_date}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">Reason (optional)</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Facility in use"
                className="w-full px-3 py-2 text-sm border border-[#d1d5db] rounded-lg placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb] resize-none"
              />
            </div>
            {rejectError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{rejectError}</p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setRejectRes(null); setRejectError(""); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectRes.id, reason: rejectReason })}
                disabled={rejectMutation.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50 transition"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
