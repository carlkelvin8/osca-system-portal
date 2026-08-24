"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Webcam from "react-webcam";
import { useFacialRecognition } from "@/hooks/useFacialRecognition";
import { attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
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
  const queryClient = useQueryClient();

  const [scanType, setScanType] = useState<"time_in" | "time_out">("time_in");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    name?: string;
  } | null>(null);

  // Fetch session info — refetch every 15 s so the UI auto-detects state changes
  const { data: sessionData } = useQuery<Session | null>({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const res = await attendanceApi.listSessions({ page: 1, page_size: 100 });
      const sessions: Session[] = (res.data as PaginatedResponse<Session>).items;
      return sessions.find((s) => s.id === sessionId) ?? null;
    },
    refetchInterval: 15_000,
  });

  // Local clock for real-time state detection (5 s tick)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  // Session state derived from actual scheduled_start / scheduled_end
  const sessionNotStarted = (() => {
    if (!sessionData) return false;
    return now < new Date(sessionData.scheduled_start).getTime();
  })();

  const sessionEnded = (() => {
    if (!sessionData) return false;
    if (!sessionData.is_active) return true;
    return now >= new Date(sessionData.scheduled_end).getTime();
  })();

  const sessionActive = !sessionNotStarted && !sessionEnded && !!sessionData;

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
      if (scanType === "time_out") {
        queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
        queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
        queryClient.invalidateQueries({ queryKey: ["student-dashboard-attendance"] });
      }
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

  const scanDisabled = isScanning || !sessionActive || sportMismatch || !!cameraError;

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
              sessionNotStarted
                ? "bg-amber-100 text-amber-700"
                : sessionEnded
                ? "bg-gray-100 text-gray-500"
                : "bg-green-100 text-green-800"
            }`}
          >
            {sessionNotStarted ? "Not Started" : sessionEnded ? "Closed" : "Active"}
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

        {/* Not started warning */}
        {sessionNotStarted && !sportMismatch && (
          <div className="w-full max-w-sm px-4 py-3 rounded-xl text-center text-white font-semibold bg-amber-500/90">
            <Clock size={20} className="inline mr-1.5" />
            Attendance has not started yet. Scanning opens at{" "}
            <strong>{format(new Date(sessionData!.scheduled_start), "h:mm a")}</strong>.
          </div>
        )}

        {/* Scan type toggle */}
        <div className="flex gap-3">
          {(["time_in", "time_out"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setScanType(type)}
              disabled={sportMismatch || sessionNotStarted}
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
          {cameraError ? (
            <div className="flex flex-col items-center justify-center gap-3 bg-gray-900 text-white p-8" style={{ height: 360 }}>
              <AlertCircle size={36} className="text-red-400" />
              <p className="text-sm text-center text-red-300">{cameraError}</p>
              <button
                onClick={() => { setCameraError(null); setCameraKey((k) => k + 1); }}
                className="px-4 py-2 text-sm font-medium bg-white/10 rounded-lg hover:bg-white/20 transition"
              >
                Retry Camera
              </button>
            </div>
          ) : (
            <Webcam
              key={cameraKey}
              ref={webcamRef as React.RefObject<Webcam>}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.9}
              width={480}
              height={360}
              videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
              className="block w-full"
              onUserMediaError={() => setCameraError("Camera access denied. Please allow camera permission in your browser settings and try again.")}
            />
          )}

          {!cameraError && isScanning && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="text-white animate-spin" size={48} />
            </div>
          )}

          {!cameraError && !isScanning && !feedback && (
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
          disabled={scanDisabled}
          className="px-12 py-4 bg-white text-[#1E3A5F] text-lg font-bold rounded-full shadow-lg hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanning ? "Scanning..." : "Scan Face"}
        </button>

        {sessionNotStarted && (
          <p className="text-amber-300 text-sm">Attendance has not started yet. Please wait.</p>
        )}

        {sessionEnded && (
          <p className="text-red-300 text-sm">Attendance Closed. The attendance period for this session has ended.</p>
        )}
      </div>
    </div>
  );
}
