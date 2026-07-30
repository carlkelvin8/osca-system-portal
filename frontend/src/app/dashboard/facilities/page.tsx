"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facilitiesApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { Building2, Plus, X, Loader2, Calendar, Clock } from "lucide-react";
import type { Facility, FacilitySchedule, PaginatedResponse } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-800",
  in_use: "bg-blue-100 text-blue-800",
  maintenance: "bg-yellow-100 text-yellow-800",
  closed: "bg-red-100 text-red-800",
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-800",
  good: "bg-blue-100 text-blue-800",
  fair: "bg-yellow-100 text-yellow-800",
  poor: "bg-orange-100 text-orange-800",
  needs_repair: "bg-red-100 text-red-800",
};

export default function FacilitiesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === "admin" || role === "director" || role === "staff";
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showSchedule, setShowSchedule] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Facility>>({
    queryKey: ["facilities"],
    queryFn: async () => (await facilitiesApi.list({ page_size: 50 })).data,
  });

  const { data: schedules } = useQuery<FacilitySchedule[]>({
    queryKey: ["facility-schedules", showSchedule],
    queryFn: async () => (await facilitiesApi.listSchedules({ facility_id: showSchedule! })).data,
    enabled: !!showSchedule,
  });

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => facilitiesApi.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["facilities"] }); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => facilitiesApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facilities"] }),
  });

  const [form, setForm] = useState({ name: "", description: "", location: "", capacity: "", status: "available", condition: "good" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 size={22} className="text-[#1E3A5F]" />
          <h1 className="text-xl font-bold text-[#111827]">Facility Monitoring</h1>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f]">
            <Plus size={14} /> Add Facility
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.items.map((f) => (
            <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-[#111827]">{f.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {f.status.replace("_", " ")}
                </span>
              </div>
              {f.description && <p className="text-sm text-gray-500 mb-2">{f.description}</p>}
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                {f.location && <span>📍 {f.location}</span>}
                {f.capacity && <span>👥 Capacity: {f.capacity}</span>}
                <span className={`px-2 py-0.5 rounded-full ${CONDITION_COLORS[f.condition] ?? "bg-gray-100"}`}>{f.condition}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSchedule(f.id)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Calendar size={12} /> Schedules
                </button>
                {isAdmin && (
                  <select
                    className="text-xs border rounded px-2 py-1"
                    value={f.status}
                    onChange={(e) => updateMutation.mutate({ id: f.id, data: { status: e.target.value } })}
                  >
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="closed">Closed</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Facility Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Add Facility</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ ...form, capacity: form.capacity ? +form.capacity : null }); }} className="space-y-3">
              <input placeholder="Name *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
              <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
              <input placeholder="Capacity" type="number" min="0" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full px-3 py-2 text-sm border rounded-lg" />
              <button type="submit" disabled={createMutation.isPending} className="w-full py-2 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {createMutation.isPending ? "Saving..." : "Create Facility"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Facility Schedule</h2>
              <button onClick={() => setShowSchedule(null)}><X size={18} /></button>
            </div>
            {schedules && schedules.length > 0 ? (
              <div className="space-y-2">
                {schedules.map((s) => (
                  <div key={s.id} className="border rounded-lg p-3 text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-gray-500 text-xs flex items-center gap-2 mt-1">
                      <Calendar size={12} /> {s.scheduled_date}
                      <Clock size={12} /> {s.start_time} - {s.end_time}
                    </p>
                    {s.sport_or_activity && <p className="text-xs text-blue-600 mt-1">{s.sport_or_activity}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No schedules yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
