"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Webcam from "react-webcam";
import { useFacialRecognition } from "@/hooks/useFacialRecognition";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  Info,
  Loader2,
  MapPin,
  Power,
  ScanFace,
  Shield,
  ShieldCheck,
  Timer,
  User,
  UserCheck,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FaceScanResponse, LatestAttendance, PaginatedResponse, Session, SessionStats } from "@/types";
import { attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useThemeStore } from "@/store/useThemeStore";
import { format } from "date-fns";
import Link from "next/link";

const ALLOWED_ROLES = ["admin", "director", "staff", "coach", "pe_instructor"] as const;

const CARD =
  "rounded-2xl border border-gray-100 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)]";

function DecoBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#1557C0]/5 blur-3xl" />
      <div className="absolute right-0 top-80 h-80 w-80 rounded-full bg-[#1E3A5F]/5 blur-3xl" />
      <div className="absolute bottom-40 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#1557C0]/[0.04] blur-3xl" />
    </div>
  );
}

function KioskBanner() {
  const { isDark } = useThemeStore();

  return (
    <header className="sticky top-0 z-30 overflow-hidden rounded-b-[20px]">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/logo/NAAP.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#061a38]/95 via-[#123b68]/75 to-[#123b68]/45" />

      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent md:h-16 ${
          isDark ? "to-[#0F172A]" : "to-[#f7faff]"
        }`}
      />

      <div className="relative z-10 flex h-[150px] flex-col justify-center gap-4 px-6 py-6 md:h-[165px] md:flex-row md:items-center md:justify-between md:gap-5 md:px-10">
        <div className="flex items-center gap-3 md:gap-4">
          <Image
            src="/logo/osca-logo.png"
            alt="OSCA Logo"
            width={64}
            height={64}
            className="h-12 w-12 shrink-0 object-contain md:h-16 md:w-16"
          />
          <div className="min-w-0">
            <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-white md:text-[30px]">
              OSCA Management System
            </h1>
            <p className="mt-1 text-[13px] font-medium leading-snug text-white/95 md:text-[16px]">
              Office of Sports and Cultural Affairs
            </p>
            <p className="text-[11px] font-medium text-blue-100/90 md:text-[13px]">NAAP – Villamor Campus</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <Icon className="shrink-0 text-[#1E3A5F]" size={18} />
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="truncate text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  iconCls,
  bgCls,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  iconCls: string;
  bgCls: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 p-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.10)] ${bgCls}`}
    >
      <Icon className={iconCls} size={22} />
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
    </div>
  );
}

function ActivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Active
    </span>
  );
}

export default function KioskPage() {
  const { user, isAuthenticated, isLoading: authLoading, fetchCurrentUser } = useAuthStore();
  const router = useRouter();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [scanType, setScanType] = useState<"time_in" | "time_out">("time_in");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
    name?: string;
  } | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (!ALLOWED_ROLES.includes(user.role as typeof ALLOWED_ROLES[number])) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, user, router]);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<PaginatedResponse<Session>>({
    queryKey: ["kiosk-active-sessions"],
    queryFn: async () => {
      const res = await attendanceApi.listSessions({ is_active: true, page_size: 50 });
      return res.data;
    },
    refetchInterval: 30_000,
    enabled: !!user && ALLOWED_ROLES.includes(user.role as typeof ALLOWED_ROLES[number]),
  });

  const activeSessions = sessionsData?.items ?? [];

  const { data: sessionStats } = useQuery<SessionStats | null>({
    queryKey: ["kiosk-session-stats", selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return null;
      const res = await attendanceApi.getSessionStats(selectedSessionId);
      return res.data;
    },
    enabled: !!selectedSessionId,
    retry: false,
    staleTime: 30_000,
  });

  const queryClient = useQueryClient();
  const { data: latestAttendance } = useQuery<LatestAttendance | null>({
    queryKey: ["kiosk-latest-attendance", selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) return null;
      const res = await attendanceApi.getSessionLatest(selectedSessionId);
      return res.data;
    },
    enabled: !!selectedSessionId,
    retry: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const { webcamRef, isScanning, captureAndScan } = useFacialRecognition({
    sessionId: selectedSessionId ?? "",
    scanType,
    onSuccess: (result: FaceScanResponse) => {
      setConsecutiveFailures(0);
      const isStaff = !!result.matched_user_role && result.matched_user_role !== "student";
      setFeedback({
        type: "success",
        message: isStaff
          ? "Face Recognized!"
          : scanType === "time_in"
          ? "Time-In Recorded!"
          : "Time-Out Recorded!",
        name: result.matched_user_name ?? undefined,
      });
      setTimeout(() => setFeedback(null), 4000);
      if (selectedSessionId) {
        queryClient.invalidateQueries({
          queryKey: ["kiosk-latest-attendance", selectedSessionId],
        });
        queryClient.invalidateQueries({
          queryKey: ["kiosk-session-stats", selectedSessionId],
        });
      }
    },
    onFailure: (result: FaceScanResponse) => {
      const newCount = consecutiveFailures + 1;
      setConsecutiveFailures(newCount);
      setFeedback({
        type: newCount >= 3 ? "warning" : "error",
        message:
          newCount >= 3
            ? "Multiple scan failures detected. Admin has been alerted."
            : result.message || "Recognition failed. Please try again.",
      });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1E3A5F]">
        <Loader2 className="animate-spin text-white" size={40} />
      </div>
    );
  }

  const roleLabel = user.role.replace("_", " ").toUpperCase();

  if (!selectedSessionId) {
    return (
      <div className="relative flex flex-col bg-[#f7faff]">
        <DecoBg />
        <KioskBanner />

        <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col space-y-4 px-6 pb-8 pt-4">
          <div className="-ml-6">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] transition-colors duration-300 hover:text-[#0c1c33] dark:text-blue-100 dark:hover:text-white"
            >
              <ArrowLeft
                size={15}
                className="transition-transform duration-300 group-hover:-translate-x-0.5"
              />
              Back to Dashboard
            </Link>
          </div>

          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1557C0] to-[#071A3A] shadow-lg">
              <ScanFace className="text-white" size={30} />
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-[#0c1c33]">
              Select Active Attendance Session
            </h1>
            <p className="mt-1.5 text-sm font-semibold text-[#1557C0]">
              Choose a session to begin facial recognition attendance.
            </p>
            <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-[#1557C0]" />
          </div>

          <div className={`${CARD} p-6`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
              Active Sessions
            </h2>

            {sessionsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-gray-400" size={28} />
              </div>
            ) : activeSessions.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar className="mx-auto text-gray-300" size={32} />
                <p className="mt-2 text-sm font-semibold text-gray-600">No Active Attendance Session</p>
                <p className="mt-1 text-xs text-gray-400">
                  There are currently no active attendance sessions available.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-2">
                {activeSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className="w-full rounded-xl border border-gray-100 px-4 py-3.5 text-left transition hover:border-[#1557C0] hover:bg-[#1557C0]/5 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-gray-900">{session.name}</p>
                      <ActivePill />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {session.sport_or_art ? `${session.sport_or_art} · ` : ""}
                      {format(new Date(session.scheduled_start), "MMM d, h:mm a")} –{" "}
                      {format(new Date(session.scheduled_end), "h:mm a")}
                      {session.venue ? ` · ${session.venue}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const activeSession = activeSessions.find((s) => s.id === selectedSessionId);

  const feedbackOverlay = feedback
    ? feedback.type === "success"
      ? { cls: "bg-green-600/95 text-white", Icon: CheckCircle2 }
      : feedback.type === "error"
      ? { cls: "bg-red-600/95 text-white", Icon: XCircle }
      : { cls: "bg-amber-500/95 text-white", Icon: AlertCircle }
    : null;

  const latestIsStaff =
    !!latestAttendance?.person_role && latestAttendance.person_role !== "student";
  const latestBadge = latestIsStaff
    ? (latestAttendance?.person_role ?? "Personnel").replace("_", " ").toUpperCase()
    : latestAttendance?.status === "late"
    ? "Late"
    : latestAttendance?.status === "present"
    ? "Present"
    : latestIsStaff
    ? "Personnel"
    : "Attended";
  const latestTime = latestAttendance?.time
    ? `${format(new Date(latestAttendance.time), "hh:mm:ss a")} · ${format(
        new Date(latestAttendance.time),
        "MMM d, yyyy",
      )}`
    : null;
  const latestSessionLine = [
    latestAttendance?.session_sport_or_art,
    latestAttendance?.session_name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative flex min-h-screen flex-col bg-[#f7faff]">
      <DecoBg />
      <KioskBanner />

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 space-y-7 px-6 py-10">
        <div>
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] transition-colors duration-300 hover:text-[#0c1c33] dark:text-blue-100 dark:hover:text-white"
          >
            <ArrowLeft
              size={15}
              className="transition-transform duration-300 group-hover:-translate-x-0.5"
            />
            Back to Dashboard
          </Link>
        </div>

        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1557C0] to-[#071A3A] shadow-lg">
            <ScanFace className="text-white" size={30} />
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-[#0c1c33]">OSCA Attendance Scan</h1>
          <p className="mt-1.5 text-sm font-semibold text-[#1557C0]">Kiosk Mode – Facial Recognition</p>
          <p className="mt-1 text-xs text-gray-500">
            Position your face in the camera frame. Students record attendance; OSCA
            personnel are recognized for identity verification only.
          </p>
          <div className="mx-auto mt-3 h-0.5 w-16 rounded-full bg-[#1557C0]" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-7 lg:col-span-2">
            <div className={`${CARD} border-l-4 border-l-[#1557C0] p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                  <Calendar size={15} /> Active attendance session
                </h2>
                <div className="flex flex-col items-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    ACTIVE
                  </span>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Session is now accepting attendance.
                  </p>
                </div>
              </div>

              {activeSession ? (
                <>
                  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1E3A5F] to-[#1557C0] shadow-md">
                      <Activity className="text-white" size={30} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-gray-900">{activeSession.name}</p>
                      <p className="truncate text-sm font-medium text-[#1557C0]">
                        {activeSession.sport_or_art ?? activeSession.activity_type}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MetaRow
                      icon={Clock}
                      label="Start – End"
                      value={`${format(new Date(activeSession.scheduled_start), "h:mm a")} – ${format(
                        new Date(activeSession.scheduled_end),
                        "h:mm a",
                      )}`}
                    />
                    <MetaRow icon={MapPin} label="Venue" value={activeSession.venue ?? "Not set"} />
                    {activeSession.grace_period_minutes > 0 && (
                      <MetaRow
                        icon={Timer}
                        label="Grace period"
                        value={`${activeSession.grace_period_minutes} min`}
                      />
                    )}
                    <MetaRow
                      icon={Users}
                      label="Students scanned"
                      value={String(activeSession.attendance_count ?? 0)}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-5 text-sm text-gray-400">No active session selected.</p>
              )}

              <div className="mt-5 border-t border-gray-50 pt-3">
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F] transition hover:text-[#0c1c33]"
                  title="Change session"
                >
                  <ChevronDown size={15} /> Change session
                </button>
              </div>
            </div>

            <div className={`${CARD} p-6`}>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                <ScanFace size={15} /> Facial recognition scan
              </h2>

              <div className="mt-5 flex gap-2">
                {(["time_in", "time_out"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setScanType(type)}
                    className={`flex-1 rounded-full px-6 py-2 text-sm font-semibold transition ${
                      scanType === type
                        ? "bg-[#1E3A5F] text-white shadow"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {type === "time_in" ? "Time In" : "Time Out"}
                  </button>
                ))}
              </div>

              <div className="relative mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-black">
                <Webcam
                  ref={webcamRef as React.RefObject<Webcam>}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={0.9}
                  width={640}
                  height={480}
                  videoConstraints={{
                    width: 1280,
                    height: 720,
                    facingMode: "user",
                  }}
                  className="mx-auto block"
                />

                <div className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-[#1557C0]/70" />
                <div className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-[#1557C0]/70" />
                <div className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-[#1557C0]/70" />
                <div className="pointer-events-none absolute bottom-3 right-3 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-[#1557C0]/70" />

                {!isScanning && !feedback && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-60 w-48 rounded-[50%] border-2 border-white/60 shadow-[0_0_40px_10px_rgba(21,87,192,0.25)]" />
                  </div>
                )}

                {isScanning && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50">
                    <Loader2 className="animate-spin text-white" size={60} />
                    <p className="text-sm font-medium text-white">Scanning…</p>
                  </div>
                )}

                {feedback && feedbackOverlay && (
                  <div
                    className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 px-6 text-center ${feedbackOverlay.cls}`}
                  >
                    <feedbackOverlay.Icon size={40} />
                    <p className="text-xl font-bold">{feedback.message}</p>
                    {feedback.name && <p className="text-base font-semibold">{feedback.name}</p>}
                  </div>
                )}
              </div>

              <button
                onClick={captureAndScan}
                disabled={isScanning || !selectedSessionId}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#1557C0] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-[#1557C0]/20 transition hover:bg-[#123D78] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Scanning…
                  </>
                ) : (
                  <>
                    <ScanFace size={20} /> Scan Face
                  </>
                )}
              </button>

              <p className="mt-2 text-center text-xs text-gray-400">
                Look directly at the camera and press the button
              </p>
            </div>
          </div>

          <div className="space-y-7">
            <div className={`${CARD} p-6`}>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                <Calendar size={15} /> Today&apos;s attendance overview
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-5">
                <StatTile
                  icon={UserCheck}
                  label="Present"
                  value={String(sessionStats?.present ?? "—")}
                  iconCls="text-green-600"
                  bgCls="bg-green-50"
                />
                <StatTile
                  icon={Clock3}
                  label="Late"
                  value={String(sessionStats?.late ?? "—")}
                  iconCls="text-amber-500"
                  bgCls="bg-amber-50"
                />
                <StatTile
                  icon={UserX}
                  label="Absent"
                  value={String(sessionStats?.absent ?? "—")}
                  iconCls="text-red-500"
                  bgCls="bg-red-50"
                />
                <StatTile
                  icon={Users}
                  label="Total Students"
                  value={String(sessionStats?.total ?? "—")}
                  iconCls="text-[#1557C0]"
                  bgCls="bg-blue-50"
                />
              </div>
                  <p className="mt-3 text-[11px] text-gray-400">
                    Live counts for the selected session.
                  </p>
            </div>

            <div className={`${CARD} p-6`}>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                <Award size={15} /> Last successful attendance
              </h2>
              {latestAttendance?.has_record ? (
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white shadow">
                    <UserCheck size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">
                      {latestAttendance.person_name}
                    </p>
                    {latestTime && (
                      <p className="text-xs text-gray-500">{latestTime}</p>
                    )}
                    {latestSessionLine && (
                      <p className="mt-0.5 truncate text-[11px] text-gray-400">
                        {latestSessionLine}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      latestIsStaff ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {latestBadge}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Award className="text-gray-300" size={28} />
                  <p className="text-sm text-gray-500">No attendance recorded yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-[#1557C0]/10 bg-[#1557C0]/5 p-5 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 shrink-0 text-[#1557C0]" size={18} />
            <p className="text-sm text-gray-600">
              Please look at the camera and ensure your face is clearly visible. Keep a proper
              distance and avoid wearing face coverings.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-green-600" size={18} />
            <p className="text-sm text-gray-600">
              Thank you for your cooperation! Let&apos;s keep OSCA events organized and successful.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mt-7 border-t border-white/10 bg-[#0c1c33] px-6 py-4">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-3 text-center sm:grid-cols-3">
          <p className="flex items-center justify-center gap-2 text-xs font-medium text-blue-200 sm:justify-start">
            <Shield size={14} className="text-green-400" /> Secure. Accurate. Reliable.
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-blue-100">
            <User size={13} className="text-blue-300" /> Logged in as{" "}
            <strong className="text-white">{user.full_name}</strong> ({roleLabel})
          </p>
          <button
            onClick={() => setSelectedSessionId(null)}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/20 sm:justify-self-end"
          >
            <Power size={13} /> End Session
          </button>
        </div>
      </footer>
    </div>
  );
}
