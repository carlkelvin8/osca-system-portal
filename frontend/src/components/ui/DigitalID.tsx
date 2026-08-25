"use client";

import { forwardRef, useState } from "react";
import type { User } from "@/types";

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

    const idNumber = user.employee_id || user.student_id || "—";
    const displayName = user.full_name;
    const role = roleLabel[user.role] ?? user.role.replace("_", " ");

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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div
          ref={ref}
          id="digital-id-card"
          className="relative w-full max-w-[640px] overflow-hidden shadow-xl"
          style={{
            aspectRatio: "1011 / 638",
            fontFamily: "Inter, system-ui, sans-serif",
            containerType: "inline-size",
          }}
        >
          {/* Full template background — never modified */}
          <img
            src="/id_temp.png"
            alt="OSCA Digital ID"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none"
          />

          {/* ROLE — x≈65, y≈220 on 1011×638 → 6.4%, 34.5% */}
          <div
            className="absolute font-bold uppercase"
            style={{
              left: "6.4%",
              top: "34.5%",
              color: "#FFFFFF",
              fontSize: "3.3cqw",
              letterSpacing: "0.06em",
              lineHeight: 1.2,
            }}
          >
            {role}
          </div>

          {/* NAME — x≈65, y≈295 on 1011×638 → 6.4%, 46.2% */}
          <div
            className="absolute font-bold"
            style={{
              left: "6.4%",
              top: "46.2%",
              color: "#C9A84C",
              fontSize: "4.75cqw",
              lineHeight: 1.15,
              maxWidth: "50%",
              wordBreak: "break-word",
            }}
          >
            {displayName}
          </div>

          {/* ID NUMBER — x≈120, y≈485 → 11.9%, 76.0% */}
          <div
            className="absolute"
            style={{ left: "11.9%", top: "76%" }}
          >
            <div
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "2.37cqw",
                lineHeight: 1.3,
              }}
            >
              ID #: {idNumber}
            </div>
          </div>



          {/* QR CODE — centered inside existing gold rounded rectangle on right */}
          {qrDataUrl && (
            <div
              className="absolute flex items-center justify-center cursor-pointer"
              style={{
                left: "65.3%",
                top: "31.3%",
                width: "23.7%",
                height: "37.6%",
              }}
              onClick={() => setQrZoom(true)}
              title="Click to enlarge QR code"
            >
              <img
                src={qrDataUrl}
                alt="Static QR Code"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
          )}
        </div>
      </>
    );
  }
);

DigitalID.displayName = "DigitalID";

export default DigitalID;
