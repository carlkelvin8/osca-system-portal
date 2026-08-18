"use client";

import { forwardRef, useState } from "react";
import type { User } from "@/types";
import { format, addYears } from "date-fns";

interface DigitalIDProps {
  user: User;
  qrDataUrl: string | null;
  borrowingQrCode: string;
}

const DigitalID = forwardRef<HTMLDivElement, DigitalIDProps>(
  ({ user, qrDataUrl, borrowingQrCode }, ref) => {
    const [qrZoom, setQrZoom] = useState(false);

    const roleLabel: Record<string, string> = {
      admin: "System Administrator",
      director: "OSCA Director",
      staff: "OSCA Staff",
      coach: "Coach",
      pe_instructor: "PE Instructor",
      student: "Student",
    };

    const sportOrDept =
      user.role === "pe_instructor"
        ? user.department
        : user.assigned_sport || user.sport_or_art;

    const validThru = user.created_at
      ? addYears(new Date(user.created_at), 1)
      : addYears(new Date(), 1);

    return (
      <>
        {qrZoom && qrDataUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setQrZoom(false)}
          >
            <div
              className="bg-white rounded-2xl p-4 shadow-2xl max-w-xs w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={qrDataUrl}
                alt="Static QR Code"
                className="w-full aspect-square rounded-xl"
              />
              <p className="text-center text-xs text-gray-500 mt-2 font-medium uppercase tracking-wider">
                Static QR Code
              </p>
              <p className="text-center text-[10px] text-gray-400 font-mono truncate mt-1">
                {borrowingQrCode}
              </p>
              <button
                onClick={() => setQrZoom(false)}
                className="mt-3 w-full py-2 rounded-lg bg-[#0d1f3c] text-white text-sm font-medium hover:bg-[#0d1f3c]/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

      <div
        ref={ref}
        id="digital-id-card"
        className="w-full max-w-[360px] rounded-2xl overflow-hidden shadow-xl bg-[#0d1f3c] text-white"
        style={{ fontFamily: "Inter, system-ui, sans-serif", aspectRatio: "3.375 / 2.125" }}
      >
        <div className="h-[3px] bg-[#C9A84C]" />

        <div className="flex items-center gap-3 px-5 pt-3.5 pb-2">
          <img
            src="/osca-logo.png"
            alt="OSCA"
            className="w-9 h-9 rounded-full border-2 border-[#C9A84C] object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[#C9A84C] tracking-wider uppercase leading-tight">
              OSCA Management System
            </p>
            <p className="text-[9px] text-white/50 leading-tight">
              Office of Sports &amp; Cultural Affairs
            </p>
            <p className="text-[9px] text-white/40 leading-tight">
              NAAP – Villamor Campus
            </p>
          </div>
        </div>

        <div className="mx-5 border-t border-white/10" />

        <div className="flex items-stretch gap-4 px-5 py-3.5 flex-1">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-[56px] h-[56px] rounded-full border-2 border-[#C9A84C] overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
              {user.profile_picture_url ? (
                <img
                  src={user.profile_picture_url}
                  alt={user.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg font-bold text-[#C9A84C]">
                  {user.full_name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="font-bold text-[13px] leading-tight truncate">
                {user.full_name}
              </p>
              <p className="text-[11px] text-[#C9A84C] font-medium leading-tight">
                {roleLabel[user.role] ?? user.role.replace("_", " ")}
              </p>
              {sportOrDept && (
                <p className="text-[10px] text-white/60 leading-tight truncate">
                  {sportOrDept}
                </p>
              )}
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                  user.is_active
                    ? "bg-green-500/20 text-green-300 border border-green-500/40"
                    : "bg-red-500/20 text-red-300 border border-red-500/40"
                }`}
              >
                {user.is_active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
          </div>

          {qrDataUrl && (
            <div
              className="flex flex-col items-center justify-center shrink-0 cursor-pointer"
              onClick={() => setQrZoom(true)}
            >
              <div className="bg-white rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow">
                <img
                  src={qrDataUrl}
                  alt="Static QR Code"
                  className="w-[110px] h-[110px] rounded-lg"
                />
              </div>
              <p className="text-[8px] text-white/40 mt-1.5 uppercase tracking-widest font-medium">
                Static QR Code
              </p>
            </div>
          )}
        </div>

        <div className="mx-5 border-t border-white/10" />

        <div className="flex items-center px-5 py-2.5 gap-4">
          <div className="flex-1">
            <p className="text-[8px] text-white/40 uppercase tracking-wider">
              {user.role === "coach" ? "Coach ID" : user.role === "student" ? "Student ID" : "Employee ID"}
            </p>
            <p className="font-mono text-[11px] font-medium leading-tight">
              {user.employee_id || user.student_id || "—"}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[8px] text-white/40 uppercase tracking-wider">
              Valid Thru
            </p>
            <p className="font-mono text-[11px] font-medium leading-tight">
              {format(validThru, "MMM d, yyyy")}
            </p>
          </div>
        </div>
      </div>
      </>
    );
  }
);

DigitalID.displayName = "DigitalID";

export default DigitalID;
