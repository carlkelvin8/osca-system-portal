"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Webcam from "react-webcam";
import { useFacialRecognition } from "@/hooks/useFacialRecognition";
import { attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { FaceScanResponse, PaginatedResponse, Session } from "@/types";

export default function StudentScanPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { user } = useAuthStore();

  const [scanType, setScanType] = useState<"time_in" | "time_out">("time_in");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    name?: string;
  } | null>(null);

  // Fetch session info
  const { data: sessionData } = useQuery<Session | null>({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const res = await attendanceApi.listSessions({ page: 1, page_size: 100 });
      const sessions: Session[] = (res.data as PaginatedResponse<Session>).items;
      return sessions.find((s) => s.id === sessionId) ?? null;
    },
  });

  const isStudent = user?.role === "student";
  const sportMismatch = !!(
    isStudent &&
    user?.sport_or_art &&
    sessionData?.sport_or_art &&
    user.sport_or_art !== sessionData.sport_or_art
  );

  const { webcamRef, isScanning, captureAndScan } = useFacialRecognition({
    sessionId,
    scanType,
    onSuccess: (result: FaceScanResponse) => {
      setFeedback({
        type: "success",
        message: scanType === "time_in" ? "Time-In Recorded!" : "Time-Out Recorded!",
        name: result.matched_user_name ?? undefined,
      });
      setTimeout(() => setFeedback(null), 5000);
    },
    onFailure: (result: FaceScanResponse) => {
      setFeedback({
        type: "error",
        message: result.message || "Recognition failed. Please try again.",
      });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/attendance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
      >
        <ArrowLeft size={15} /> Back to Sessions
      </Link>

      {/* Session info */}
      {sessionData && (
        <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
          <CalendarCheck size={18} className="text-[#1E3A5F]" />
          <div>
            <p className="font-semibold text-gray-900">{sessionData.name}</p>
            <p className="text-xs text-gray-500">
              {format(new Date(sessionData.scheduled_start), "MMMM d, yyyy · h:mm a")}
              {sessionData.sport_or_art ? ` · ${sessionData.sport_or_art}` : ""}
            </p>
          </div>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
              sessionData.is_active
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {sessionData.is_active ? "Active" : "Closed"}
          </span>
        </div>
      )}

      {/* Scan card */}
      <div className="bg-[#1E3A5F] rounded-2xl p-6 flex flex-col items-center gap-6">
        <div className="text-center text-white">
          <h1 className="text-xl font-bold">Attendance Scan</h1>
          <p className="text-blue-200 text-sm mt-1">
            Welcome, <span className="font-semibold">{user?.first_name}</span>. Look
            directly at the camera and press the button.
          </p>
        </div>

        {/* Sport mismatch warning */}
        {sportMismatch && (
          <div className="w-full max-w-sm px-4 py-3 rounded-xl text-center text-white font-semibold bg-red-500/90">
            <AlertCircle size={20} className="inline mr-1.5" />
            This session is for <strong>{sessionData?.sport_or_art}</strong>, but your
            assigned sport/art is <strong>{user?.sport_or_art}</strong>. You cannot scan for this session.
          </div>
        )}

        {/* Scan type toggle */}
        <div className="flex gap-3">
          {(["time_in", "time_out"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setScanType(type)}
              disabled={sportMismatch}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                scanType === type
                  ? "bg-white text-[#1E3A5F]"
                  : "bg-white/20 text-white hover:bg-white/30"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {type === "time_in" ? "Time In" : "Time Out"}
            </button>
          ))}
        </div>

        {/* Webcam */}
        <div className="relative rounded-xl overflow-hidden border-4 border-white/30 shadow-xl w-full max-w-sm">
          <Webcam
            ref={webcamRef as React.RefObject<Webcam>}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.9}
            width={480}
            height={360}
            videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
            className="block w-full"
          />

          {isScanning && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="text-white animate-spin" size={48} />
            </div>
          )}

          {!isScanning && !feedback && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-36 h-44 border-4 border-white/60 rounded-full" />
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`w-full max-w-sm px-6 py-4 rounded-xl text-center text-white font-semibold ${
              feedback.type === "success"
                ? "bg-green-500"
                : feedback.type === "error"
                ? "bg-red-500"
                : "bg-yellow-500"
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              {feedback.type === "success" ? (
                <CheckCircle2 size={22} />
              ) : feedback.type === "error" ? (
                <XCircle size={22} />
              ) : (
                <AlertCircle size={22} />
              )}
              <span>{feedback.message}</span>
            </div>
            {feedback.name && (
              <p className="text-sm opacity-90">{feedback.name}</p>
            )}
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={captureAndScan}
          disabled={isScanning || !sessionData?.is_active || sportMismatch}
          className="px-12 py-4 bg-white text-[#1E3A5F] text-lg font-bold rounded-full shadow-lg hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? "Scanning..." : "Scan Face"}
        </button>

        {!sessionData?.is_active && (
          <p className="text-red-300 text-sm">This session is closed. Scanning is disabled.</p>
        )}
      </div>
    </div>
  );
}
