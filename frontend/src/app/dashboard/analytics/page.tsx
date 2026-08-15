"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, attendanceApi, sanctionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { BarChart3, TrendingUp, Users, Package, Gavel } from "lucide-react";
import type { PaginatedResponse, Sanction, AttendanceRecord } from "@/types";

const PIE_COLORS = ["#2563eb", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function groupByDayOfWeek(records: AttendanceRecord[]) {
  const counts: Record<string, number> = {};
  DAYS_OF_WEEK.forEach((d) => (counts[d] = 0));

  records.forEach((r) => {
    const dateStr = r.time_in;
    if (dateStr) {
      const day = new Date(dateStr).getDay();
      counts[DAYS_OF_WEEK[day]] += 1;
    }
  });

  return DAYS_OF_WEEK.map((day) => ({ day, count: counts[day] }));
}

function groupByWeek(records: AttendanceRecord[]) {
  const weekMap: Record<string, number> = {};

  records.forEach((r) => {
    if (r.time_in) {
      const date = new Date(r.time_in);
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(
        ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
      );
      const key = `Week ${weekNum}`;
      weekMap[key] = (weekMap[key] || 0) + 1;
    }
  });

  return Object.entries(weekMap)
    .sort((a, b) => {
      const numA = parseInt(a[0].replace("Week ", ""));
      const numB = parseInt(b[0].replace("Week ", ""));
      return numA - numB;
    })
    .slice(-8)
    .map(([week, count]) => ({ week, count }));
}

function groupByMonth(records: AttendanceRecord[]) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthMap: Record<string, number> = {};

  records.forEach((r) => {
    if (r.time_in) {
      const date = new Date(r.time_in);
      const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    }
  });

  return Object.entries(monthMap)
    .slice(-6)
    .map(([month, count]) => ({ month, count }));
}

function getTopAthletes(records: AttendanceRecord[]) {
  const countMap: Record<string, number> = {};

  records.forEach((r) => {
    if (r.student_name) {
      countMap[r.student_name] = (countMap[r.student_name] || 0) + 1;
    }
  });

  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
}

function groupSanctionsByType(sanctions: Sanction[]) {
  const typeMap: Record<string, number> = {};

  sanctions.forEach((s) => {
    const type = s.violation_type || "other";
    typeMap[type] = (typeMap[type] || 0) + 1;
  });

  return Object.entries(typeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }));
}

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [trendView, setTrendView] = useState<"week" | "month">("week");

  const { data: attendanceData, isLoading: loadingAttendance } = useQuery({
    queryKey: ["analytics-attendance"],
    queryFn: async () => {
      const res = await attendanceApi.getRecords({ page_size: 100 });
      return res.data as PaginatedResponse<AttendanceRecord>;
    },
    enabled: !!user,
  });

  const { data: sanctionsData, isLoading: loadingSanctions } = useQuery({
    queryKey: ["analytics-sanctions"],
    queryFn: async () => {
      const res = await sanctionsApi.list({ page_size: 100 });
      return res.data as PaginatedResponse<Sanction>;
    },
    enabled: !!user,
  });

  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ["analytics-dashboard-summary"],
    queryFn: async () => {
      const res = await reportsApi.dashboardSummary();
      return res.data as {
        equipment: { total: number; borrowed: number; available: number };
        transactions: { overdue: number };
      };
    },
    enabled: !!user,
  });

  const isLoading = loadingAttendance || loadingSanctions || loadingSummary;

  const attendanceRecords = attendanceData?.items || [];
  const sanctions = sanctionsData?.items || [];

  const trendData =
    trendView === "week"
      ? groupByWeek(attendanceRecords)
      : groupByMonth(attendanceRecords);

  const topAthletes = getTopAthletes(attendanceRecords);
  const sanctionsByType = groupSanctionsByType(sanctions);

  const equipmentPieData = summaryData
    ? [
        { name: "Available", value: summaryData.equipment.available },
        { name: "Borrowed", value: summaryData.equipment.borrowed },
        {
          name: "Overdue",
          value: summaryData.transactions.overdue,
        },
      ]
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Analytics
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Attendance Trends
              </h2>
            </div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setTrendView("week")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  trendView === "week"
                    ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm font-medium"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setTrendView("month")}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  trendView === "month"
                    ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm font-medium"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey={trendView === "week" ? "week" : "month"}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ fill: "#2563eb", r: 4 }}
                  name="Attendance"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 dark:text-gray-500">
              No attendance data available
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Most Active Athletes
            </h2>
          </div>
          {topAthletes.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topAthletes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={120}
                  stroke="#9ca3af"
                />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 dark:text-gray-500">
              No attendance data available
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Equipment Utilization
            </h2>
          </div>
          {equipmentPieData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={equipmentPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {equipmentPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 dark:text-gray-500">
              No equipment data available
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gavel className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sanctions by Violation Type
            </h2>
          </div>
          {sanctionsByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={sanctionsByType}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="type"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} name="Violations" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 dark:text-gray-500">
              No sanctions data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
