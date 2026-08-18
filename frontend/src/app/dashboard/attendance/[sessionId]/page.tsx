"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { attendanceApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { ArrowLeft, Loader2, CalendarCheck, Users, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { AttendanceRecord, Session, PaginatedResponse } from "@/types";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
  sport_or_art: string | null;
}

type AttendanceStatus = "present" | "late" | "absent";

interface PlayerRow {
  user: User;
  record: AttendanceRecord | null;
  status: AttendanceStatus;
}

export default function SessionMonitorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { user: authUser } = useAuthStore();
  const isCoach = authUser?.role === "coach";

  // Fetch session detail via list + filter (no single-session endpoint in backend)
  const { data: sessionData, isLoading: sessionLoading } = useQuery<Session | null>({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const res = await attendanceApi.listSessions({ page: 1, page_size: 100 });
      const sessions: Session[] = res.data.items;
      return sessions.find((s) => s.id === sessionId) ?? null;
    },
  });

  const sport = sessionData?.sport_or_art ?? authUser?.sport_or_art ?? null;

  // Fetch attendance records for this session
  const { data: recordsData, isLoading: recordsLoading } = useQuery<
    PaginatedResponse<AttendanceRecord>
  >({
    queryKey: ["attendance-records", sessionId],
    queryFn: async () => {
      const res = await attendanceApi.getRecords({ session_id: sessionId, page_size: 100 });
      return res.data;
    },
    enabled: !!sessionId,
  });

  // Fetch all students in this sport
  const { data: studentsData, isLoading: studentsLoading } = useQuery<
    PaginatedResponse<User>
  >({
    queryKey: ["students", sport ?? "all"],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        role: "student",
        page_size: 100,
      };
      if (sport) params.sport_or_art = sport;
      const res = await usersApi.list(params);
      return res.data;
    },
  });

  const isLoading = sessionLoading || recordsLoading || studentsLoading;

  // Build player rows: prefer the student roster (so absent players show their
  // names), then append any scanned students missing from the roster list.
  const playerRows: PlayerRow[] = [];
  const students = studentsData?.items ?? [];
  const records = recordsData?.items ?? [];
  const seen = new Set<string>();

  students.forEach((student) => {
    seen.add(student.id);
    const record = records.find((r) => r.student_id === student.id) ?? null;
    let status: AttendanceStatus = "absent";
    if (record?.time_in) {
      status = record.status === "late" ? "late" : "present";
    }
    playerRows.push({ user: student, record, status });
  });

  records.forEach((record) => {
    if (seen.has(record.student_id)) return;
    seen.add(record.student_id);
    let status: AttendanceStatus = "absent";
    if (record.time_in) {
      status = record.status === "late" ? "late" : "present";
    }
    playerRows.push({
      user: {
        id: record.student_id,
        first_name: "",
        last_name: "",
        student_id: record.student_number,
        sport_or_art: null,
      },
      record,
      status,
    });
  });

  // Summary counts
  const presentCount = playerRows.filter((r) => r.status === "present").length;
  const lateCount = playerRows.filter((r) => r.status === "late").length;
  const absentCount = playerRows.filter((r) => r.status === "absent").length;
  const totalCount = playerRows.length;

  const activityColors: Record<string, string> = {
    practice: "bg-blue-100 text-blue-800",
    competition: "bg-red-100 text-red-800",
    training: "bg-green-100 text-green-800",
    event: "bg-purple-100 text-purple-800",
    other: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/attendance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
      >
        <ArrowLeft size={15} /> Back to Sessions
      </Link>

      {/* Session header */}
      {sessionLoading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" /> Loading session…
        </div>
      ) : sessionData ? (
        <div className="bg-white rounded-xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <CalendarCheck size={18} className="text-[#1E3A5F]" />
              <h1 className="text-xl font-bold text-gray-900">{sessionData.name}</h1>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                  activityColors[sessionData.activity_type] ?? ""
                }`}
              >
                {sessionData.activity_type}
              </span>
            </div>
            <p className="text-sm text-gray-500">
                {format(new Date(sessionData.scheduled_start), "MMMM d, yyyy · h:mm a")}
                {sessionData.venue ? ` · ${sessionData.venue}` : ""}
                {sessionData.sport_or_art ? ` · ${sessionData.sport_or_art}` : ""}
                {sessionData.grace_period_minutes > 0 ? ` · Grace: ${sessionData.grace_period_minutes}min` : ""}
              </p>
          </div>
          <span
            className={`self-start sm:self-auto px-3 py-1 rounded-full text-sm font-medium ${
              sessionData.is_active
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {sessionData.is_active ? "Active" : "Closed"}
          </span>
        </div>
      ) : (
        <p className="text-sm text-red-500">Session not found.</p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-[#1E3A5F]">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <Users size={12} /> Total Players
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{presentCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <CheckCircle2 size={12} /> Present
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{lateCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <Clock size={12} /> Late
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{absentCount}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
            <XCircle size={12} /> Absent
          </p>
        </div>
      </div>

      {/* Attendance table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead className="bg-[#1E3A5F] text-white">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Player Name</th>
              <th className="px-4 py-3 text-left font-medium">Student ID</th>
              <th className="px-4 py-3 text-left font-medium">Activity</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-center font-medium">Time In</th>
              <th className="px-4 py-3 text-center font-medium">Time Out</th>
              <th className="px-4 py-3 text-left font-medium">IP Address</th>
              <th className="px-4 py-3 text-left font-medium">Device</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 size={20} className="animate-spin inline-block mr-2" />
                  Loading…
                </td>
              </tr>
            ) : playerRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                  {sport
                    ? `No players found for ${sport}.`
                    : "No players found. Make sure students are assigned a sport."}
                </td>
              </tr>
            ) : (
              playerRows.map(({ user, record, status }) => (
                <tr
                  key={user.id}
                  className={status === "absent" ? "bg-red-50/30" : ""}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.first_name
                      ? `${user.last_name}, ${user.first_name}`
                      : (record?.student_name || "—")}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {user.student_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {sessionData?.activity_type
                      ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${activityColors[sessionData.activity_type] ?? ""}`}>
                          {sessionData.activity_type}
                        </span>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {sessionData
                      ? format(new Date(sessionData.scheduled_start), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {status === "present" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 size={11} /> Present
                      </span>
                    ) : status === "late" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <Clock size={11} /> Late
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle size={11} /> Absent
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">
                    {record?.time_in
                      ? format(new Date(record.time_in), "h:mm a")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600">
                    {record?.time_out
                      ? format(new Date(record.time_out), "h:mm a")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {record?.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                    {record?.device || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
