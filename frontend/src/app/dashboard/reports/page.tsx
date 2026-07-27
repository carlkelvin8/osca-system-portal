"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { FileText, FileSpreadsheet, Loader2, BarChart3 } from "lucide-react";
import type { MonthlyInventoryReport } from "@/types";

export default function ReportsPage() {
  const { user } = useAuthStore();
  const isCoach = user?.role === "coach";
  const isAdmin = user?.role === "admin" || user?.role === "director" || user?.role === "staff";
  const sportFilter: Record<string, string> | undefined =
    isCoach && user?.sport_or_art ? { sport_or_art: user.sport_or_art } : undefined;
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [year, month] = monthYear.split("-").map(Number);

  const { data: monthlyReport, isLoading: monthlyLoading, refetch: refetchMonthly } =
    useQuery<MonthlyInventoryReport>({
      queryKey: ["monthly-inventory", year, month],
      queryFn: async () => {
        const res = await reportsApi.inventoryMonthly(year, month, "json");
        return res.data;
      },
      enabled: false, // only on demand
    });

  const downloadBlob = (data: Blob, filename: string) => {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">
          {isCoach && user?.sport_or_art
            ? `Reports for ${user.sport_or_art}`
            : "Generate and export OSCA reports"}
        </p>
      </div>

      {/* Existing reports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attendance Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Complete attendance records with time-in/out, duration, and confidence scores.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                const res = await reportsApi.attendancePdf(sportFilter);
                downloadBlob(new Blob([res.data], { type: "application/pdf" }), "attendance_report.pdf");
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
            >
              <FileText size={16} /> Download PDF
            </button>
            <button
              onClick={async () => {
                const res = await reportsApi.attendanceXlsx(sportFilter);
                downloadBlob(
                  new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                  "attendance_report.xlsx"
                );
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
            >
              <FileSpreadsheet size={16} /> Download Excel
            </button>
          </div>
        </div>

        {/* Inventory — Admin/Director only */}
        {isAdmin && <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Inventory Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              Full equipment list with quantities, conditions, QR codes, and borrowing status.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                const res = await reportsApi.inventoryPdf();
                downloadBlob(new Blob([res.data], { type: "application/pdf" }), "inventory_report.pdf");
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
            >
              <FileText size={16} /> Download PDF
            </button>
            <button
              onClick={async () => {
                const res = await reportsApi.inventoryXlsx();
                downloadBlob(
                  new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                  "inventory_report.xlsx"
                );
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
            >
              <FileSpreadsheet size={16} /> Download Excel
            </button>
          </div>
        </div>}
      </div>

      {/* Monthly Inventory Summary — Admin/Director only */}
      {isAdmin && <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-[#1E3A5F]" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Monthly Inventory Summary</h2>
            <p className="text-sm text-gray-500">Borrow volume, overdue count, top equipment, condition breakdown.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="month"
            value={monthYear}
            onChange={(e) => setMonthYear(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
          />
          <button
            onClick={() => refetchMonthly()}
            disabled={monthlyLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50"
          >
            {monthlyLoading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            View Report
          </button>
          {monthlyReport && (
            <>
              <button
                onClick={async () => {
                  const res = await reportsApi.inventoryMonthly(year, month, "pdf");
                  downloadBlob(new Blob([res.data], { type: "application/pdf" }), `inventory_monthly_${year}_${String(month).padStart(2, "0")}.pdf`);
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                <FileText size={14} /> PDF
              </button>
              <button
                onClick={async () => {
                  const res = await reportsApi.inventoryMonthly(year, month, "xlsx");
                  downloadBlob(
                    new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                    `inventory_monthly_${year}_${String(month).padStart(2, "0")}.xlsx`
                  );
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
            </>
          )}
        </div>

        {/* Report results */}
        {monthlyReport && (
          <div className="mt-2 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Active Equipment",    value: monthlyReport.total_active_equipment, color: "text-[#1E3A5F]" },
                { label: "Borrowed This Month", value: monthlyReport.borrowed_this_month,    color: "text-indigo-600" },
                { label: "Returned This Month", value: monthlyReport.returned_this_month,    color: "text-green-600" },
                { label: "Overdue",             value: monthlyReport.overdue_at_end_of_month, color: monthlyReport.overdue_at_end_of_month > 0 ? "text-red-600" : "text-gray-500" },
              ].map((stat) => (
                <div key={stat.label} className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Top 5 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Top 5 Borrowed Equipment</h3>
                {monthlyReport.top_5_borrowed.length === 0 ? (
                  <p className="text-sm text-gray-400">No borrows recorded.</p>
                ) : (
                  <ol className="space-y-1">
                    {monthlyReport.top_5_borrowed.map((e, i) => (
                      <li key={e.name} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100">
                        <span className="text-gray-600"><span className="font-medium text-gray-800">{i + 1}.</span> {e.name}</span>
                        <span className="font-semibold text-[#1E3A5F]">{e.borrow_count}×</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Condition breakdown */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Equipment Condition</h3>
                <div className="space-y-1">
                  {Object.entries(monthlyReport.condition_breakdown).map(([cond, count]) => (
                    <div key={cond} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100">
                      <span className="text-gray-600 capitalize">{cond.replace("_", " ")}</span>
                      <span className="font-semibold text-gray-800">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-right">Generated: {new Date(monthlyReport.generated_at).toLocaleString("en-PH")}</p>
          </div>
        )}
      </div>}
    </div>
  );
}
