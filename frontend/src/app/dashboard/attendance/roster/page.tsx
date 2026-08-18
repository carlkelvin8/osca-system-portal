"use client";

import { useQuery } from "@tanstack/react-query";
import { usersApi, attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { ArrowLeft, Loader2, Users, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { AttendanceRecord, PaginatedResponse, Session } from "@/types";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_id: string | null;
  sport_or_art: string | null;
  is_face_enrolled: boolean;
}

export default function PlayerRosterPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const sport =
    user?.role === "coach"
      ? user?.assigned_sport ?? null
      : user?.sport_or_art ?? null;

  const { data: studentsData, isLoading: studentsLoading } = useQuery<
    PaginatedResponse<Student>
  >({
    queryKey: ["students", "roster", sport],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        role: "student",
        page_size: 100,
      };
      if (sport) params.sport = sport;
      const res = await usersApi.list(params);
      return res.data;
    },
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<
    PaginatedResponse<Session>
  >({
    queryKey: ["sessions", "roster", sport],
    queryFn: async () => {
      const params: Record<string, string | number> = { page: 1, page_size: 10 };
      if (sport) params.sport = sport;
      const res = await attendanceApi.listSessions(params);
      return res.data;
    },
  });

  const sessionIds = (sessionsData?.items ?? []).map((s) => s.id);
  const { data: recordsData, isLoading: recordsLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["roster-records", sessionIds],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const results = await Promise.all(
        sessionIds.map((sid) =>
          attendanceApi
            .getRecords({ session_id: sid, page_size: 100 })
            .then((r) => r.data.items as AttendanceRecord[])
            .catch(() => [] as AttendanceRecord[])
        )
      );
      return results.flat();
    },
    enabled: sessionIds.length > 0,
  });

  const isLoading = studentsLoading || sessionsLoading || recordsLoading;
  const students = studentsData?.items ?? [];
  const sessions = sessionsData?.items ?? [];
  const records = recordsData ?? [];

  const getAttendanceStats = (studentId: string) => {
    const attended = records.filter((r) => r.student_id === studentId).length;
    const total = sessions.length;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { attended, total, pct };
  };

  const getLastSeen = (studentId: string): string | null => {
    const studentRecords = records
      .filter((r) => r.student_id === studentId && r.time_in)
      .sort((a, b) => new Date(b.time_in!).getTime() - new Date(a.time_in!).getTime());
    return studentRecords[0]?.time_in ?? null;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/attendance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
      >
        <ArrowLeft size={15} /> Back to Sessions
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Player Roster</h1>
          <p className="text-sm text-gray-500">
            {sport ? `${sport} — ` : ""}
            {students.length} player{students.length !== 1 ? "s" : ""} assigned
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F]/10 rounded-lg text-[#1E3A5F] text-sm">
          <Users size={16} />
          <span className="font-semibold">{students.length}</span>
          <span className="text-gray-500">players</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-[#1E3A5F]">{students.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Players</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {students.filter((s) => s.is_face_enrolled).length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Face Enrolled</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{sessions.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Recent Sessions</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1E3A5F] text-white">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Player Name</th>
              <th className="px-4 py-3 text-left font-medium">Student ID</th>
              <th className="px-4 py-3 text-center font-medium">Face Enrolled</th>
              <th className="px-4 py-3 text-center font-medium">Sessions Attended</th>
              <th className="px-4 py-3 text-center font-medium">Attendance Rate</th>
              <th className="px-4 py-3 text-left font-medium">Last Seen</th>
              <th className="px-4 py-3 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  <Loader2 size={20} className="animate-spin inline-block mr-2" />
                  Loading roster…
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                  {sport
                    ? `No students assigned to ${sport} yet.`
                    : "No sport assigned to your account. Contact an admin."}
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const stats = getAttendanceStats(student.id);
                const lastSeen = getLastSeen(student.id);
                return (
                  <tr key={student.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {student.last_name}, {student.first_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {student.student_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {student.is_face_enrolled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 size={13} /> Enrolled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <XCircle size={13} /> Not enrolled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      {stats.attended} / {stats.total}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${
                              stats.pct >= 75
                                ? "bg-green-500"
                                : stats.pct >= 50
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${stats.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-8">{stats.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {lastSeen ? format(new Date(lastSeen), "MMM d, yyyy") : "Never"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          const lastSession = records
                            .filter((r) => r.student_id === student.id)
                            .sort(
                              (a, b) =>
                                new Date(b.time_in ?? 0).getTime() -
                                new Date(a.time_in ?? 0).getTime()
                            )[0];
                          if (lastSession) {
                            router.push(
                              `/dashboard/attendance/${lastSession.session_id}`
                            );
                          }
                        }}
                        disabled={!records.some((r) => r.student_id === student.id)}
                        className="px-3 py-1 text-xs bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {sessions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Recent Sessions (last {sessions.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/dashboard/attendance/${s.id}`)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-700"
              >
                {s.name} · {format(new Date(s.scheduled_start), "MMM d")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
