"use client";

/**
 * Users page — Admin user management
 * Covers:
 *   US-001 → Admin Account Creation (Create User modal, role assignment, deactivate/activate)
 *   US-002 → Pending Approval tab (students awaiting activation)
 *   US-004 partial → Admin-side Face Enrollment modal (react-webcam)
 *
 * Design: Direction 1 – Clean Professional, OSCA PRD v2 frontend stack
 * (Next.js 15, Tailwind CSS, React Hook Form + Zod, TanStack Query, react-webcam)
 */

import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Webcam from "react-webcam";
import { usersApi, attendanceApi } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { UserSummary, PaginatedResponse, UserRole } from "@/types";
import {
  Search,
  UserPlus,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

// ── Shared style tokens ───────────────────────────────────────────────────────

const inputCls =
  "w-full border border-[#d1d5db] rounded-lg px-3 py-2.5 text-sm text-[#111827] " +
  "focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent " +
  "placeholder:text-[#9ca3af]";

const btnPrimary =
  "flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm " +
  "font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60";

const btnSecondary =
  "flex items-center gap-1.5 border border-[#d1d5db] text-[#374151] text-sm " +
  "font-medium px-4 py-2 rounded-lg hover:bg-[#f9fafb] transition";

// ── Role helpers ──────────────────────────────────────────────────────────────

const roleColors: Record<UserRole, string> = {
  admin: "bg-red-100 text-red-700",
  coach: "bg-blue-100 text-blue-700",
  pe_instructor: "bg-purple-100 text-purple-700",
  student: "bg-emerald-100 text-emerald-700",
  director: "bg-amber-100 text-amber-700",
  staff: "bg-cyan-100 text-cyan-700",
};

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  coach: "Coach",
  pe_instructor: "PE Instructor",
  student: "Student",
  director: "Director",
  staff: "Staff",
};

const ALL_ROLES: UserRole[] = ["admin", "coach", "pe_instructor", "student", "director", "staff"];

// ── Create User schema ────────────────────────────────────────────────────────

const createUserSchema = z
  .object({
    first_name: z.string().min(2, "First name required"),
    last_name: z.string().min(2, "Last name required"),
    email: z.string().email("Enter a valid email"),
    password: z
      .string()
      .min(8, "Min 8 characters")
      .regex(/[A-Z]/, "Needs an uppercase letter")
      .regex(/[0-9]/, "Needs a number"),
    confirmPassword: z.string(),
    role: z.enum(["admin", "coach", "pe_instructor", "student", "director", "staff"] as const),
    student_id: z.string().optional(),
    course: z.string().optional(),
    year_level: z.string().optional(),
    sport_or_art: z.string().optional(),
    assigned_sport: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (d) => {
      if (d.role === "coach" || d.role === "pe_instructor") {
        return !!d.assigned_sport && d.assigned_sport.length > 0;
      }
      return true;
    },
    { message: "Sport / Art is required for Coach and PE Instructor roles", path: ["assigned_sport"] }
  );

const SPORT_OPTIONS = [
  "Arnis",
  "Badminton",
  "Basketball",
  "Sepak Takraw",
  "Table Tennis",
  "Taekwondo",
  "Volleyball Men",
  "Volleyball Women",
  "Hataw Himpapawid Dance Group",
  "Himig Himpapawid Chorale",
  "Musikang Himpapawid Live Band",
];

type CreateUserForm = z.infer<typeof createUserSchema>;

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#374151] mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] ${wide ? "max-w-2xl" : "max-w-lg"
          }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f3f4f6]">
          <h2 className="text-base font-semibold text-[#111827]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-[#374151] transition"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ── Roles each creator role may assign ────────────────────────────────────────

const CREATOR_ROLE_LIMITS: Record<UserRole, UserRole[]> = {
  admin: ["admin", "director", "coach", "pe_instructor", "student", "staff"],
  director: ["coach", "pe_instructor", "student"],
  staff: ["coach", "pe_instructor", "student"],
  coach: [],
  pe_instructor: [],
  student: [],
};

// ── Create User Modal ─────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filter roles based on who is creating
  const allowedRoles = currentUser
    ? CREATOR_ROLE_LIMITS[currentUser.role] ?? []
    : [];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: (allowedRoles[0] as CreateUserForm["role"]) ?? "student" },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: CreateUserForm) => {
    setApiError(null);
    try {
      await usersApi.create({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role,
        is_active: true, // Admin-created users are active immediately
        ...(data.student_id ? { student_id: data.student_id } : {}),
        ...(data.course ? { course: data.course } : {}),
        ...(data.year_level ? { year_level: data.year_level } : {}),
        ...(data.sport_or_art ? { sport_or_art: data.sport_or_art } : {}),
        ...((data.role === "coach" || data.role === "pe_instructor") && data.assigned_sport
          ? { assigned_sport: data.assigned_sport }
          : {}),
      });
      qc.invalidateQueries({ queryKey: ["users"] });
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to create user. Please try again.";
      setApiError(msg);
    }
  };

  if (success) {
    return (
      <Modal title="Create User" onClose={onClose}>
        <div className="p-8 text-center">
          <CheckCircle size={44} className="text-[#2563eb] mx-auto mb-3" />
          <p className="text-[#111827] font-semibold">User created successfully</p>
          <p className="text-sm text-[#6b7280] mt-1">
            An email notification has been queued for the new user.
          </p>
          <button onClick={onClose} className={btnPrimary + " mx-auto mt-5"}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create User Account" onClose={onClose} wide>
      <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" error={errors.first_name?.message} required>
            <input {...register("first_name")} className={inputCls} placeholder="Juan" />
          </Field>
          <Field label="Last Name" error={errors.last_name?.message} required>
            <input {...register("last_name")} className={inputCls} placeholder="Dela Cruz" />
          </Field>
        </div>
        <Field label="Email Address" error={errors.email?.message} required>
          <input
            {...register("email")}
            type="email"
            className={inputCls}
            placeholder="user@naap.edu.ph"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" error={errors.password?.message} required>
            <input {...register("password")} type="password" className={inputCls} />
          </Field>
          <Field label="Confirm Password" error={errors.confirmPassword?.message} required>
            <input {...register("confirmPassword")} type="password" className={inputCls} />
          </Field>
        </div>

        {/* Role */}
        <Field label="Role" error={errors.role?.message} required>
          <select {...register("role")} className={inputCls}>
            {allowedRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
        </Field>

        {/* Student-specific fields */}
        {selectedRole === "student" && (
          <div className="bg-[#f8fafc] border border-[#e5e7eb] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
              Student Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student ID" error={errors.student_id?.message}>
                <input
                  {...register("student_id")}
                  className={inputCls}
                  placeholder="e.g. 2024-0001"
                />
              </Field>
              <Field label="Year Level" error={errors.year_level?.message}>
                <select {...register("year_level")} className={inputCls}>
                  <option value="">Select…</option>
                  <option>1st Year</option>
                  <option>2nd Year</option>
                  <option>3rd Year</option>
                  <option>4th Year</option>
                </select>
              </Field>
            </div>
            <Field label="Course" error={errors.course?.message}>
              <input {...register("course")} className={inputCls} placeholder="e.g. BSIT" />
            </Field>
            <Field label="Sport / Art" error={errors.sport_or_art?.message}>
              <input
                {...register("sport_or_art")}
                className={inputCls}
                placeholder="e.g. Basketball"
              />
            </Field>
          </div>
        )}

        {/* Coach / PE Instructor sport assignment */}
        {(selectedRole === "coach" || selectedRole === "pe_instructor") && (
          <div className="bg-[#f8fafc] border border-[#e5e7eb] rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
              {selectedRole === "coach" ? "Coach" : "PE Instructor"} Assignment
            </p>
            <Field label="Sport / Art" error={errors.assigned_sport?.message} required>
              <select {...register("assigned_sport")} className={inputCls}>
                <option value="">Select sport…</option>
                {SPORT_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {apiError}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className={btnPrimary + " flex-1 justify-center"}>
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Creating…
              </>
            ) : (
              <>
                <UserPlus size={14} /> Create User
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Face Enrollment Modal ─────────────────────────────────────────────────────

const CAPTURE_COUNT = 5;

function FaceEnrollModal({
  user,
  onClose,
}: {
  user: UserSummary;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const webcamRef = useRef<Webcam>(null);
  const [captures, setCaptures] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img && captures.length < CAPTURE_COUNT) {
      setCaptures((prev) => [...prev, img]);
    }
  }, [captures.length]);

  const reset = () => {
    setCaptures([]);
    setError(null);
  };

  const submitEnrollment = async () => {
    if (captures.length < CAPTURE_COUNT) return;
    setEnrolling(true);
    setError(null);
    try {
      // Strip data URL prefix → raw base64
      const images = captures.map((c) => c.split(",")[1]);
      await attendanceApi.enroll({ user_id: user.id, images_base64: images });
      qc.invalidateQueries({ queryKey: ["users"] });
      setEnrolled(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Enrollment failed. Check face images and try again.";
      setError(msg);
    } finally {
      setEnrolling(false);
    }
  };

  if (enrolled) {
    return (
      <Modal title="Face Enrollment" onClose={onClose}>
        <div className="p-8 text-center">
          <CheckCircle size={44} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-[#111827] font-semibold">Face enrolled successfully</p>
          <p className="text-sm text-[#6b7280] mt-1">
            {user.full_name}&apos;s facial embedding has been stored in the system.
          </p>
          <button onClick={onClose} className={btnPrimary + " mx-auto mt-5"}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Enroll Face — ${user.full_name}`} onClose={onClose} wide>
      <div className="px-6 py-5 space-y-4">
        {/* Instructions */}
        <div className="flex items-start gap-2 bg-[#f0f4ff] border border-[#bfdbfe] rounded-xl p-3">
          <ShieldCheck size={16} className="text-[#2563eb] mt-0.5 shrink-0" />
          <p className="text-xs text-[#374151] leading-relaxed">
            Capture <strong>{CAPTURE_COUNT} photos</strong> at different angles (front, left,
            right, slight up, slight down). Ensure good lighting. Liveness detection will be
            applied during recognition.
          </p>
        </div>

        {/* Webcam */}
        <div className="relative rounded-xl overflow-hidden bg-[#0f172a] aspect-video">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user", width: 640, height: 360 }}
            className="w-full h-full object-cover"
          />
          {/* Overlay face guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 h-52 border-2 border-white/40 rounded-full" />
          </div>
          {/* Capture count badge */}
          <div className="absolute top-3 right-3 bg-[#0f172a]/70 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {captures.length} / {CAPTURE_COUNT}
          </div>
        </div>

        {/* Thumbnails */}
        {captures.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {captures.map((src, i) => (
              <div
                key={i}
                className="w-14 h-14 rounded-lg overflow-hidden border-2 border-[#2563eb] relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 right-0 bg-[#2563eb] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-tl">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {captures.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className={btnSecondary}
              disabled={enrolling}
            >
              Retake All
            </button>
          )}
          {captures.length < CAPTURE_COUNT ? (
            <button
              type="button"
              onClick={capture}
              className={btnPrimary + " flex-1 justify-center"}
            >
              <Camera size={14} />
              Capture ({captures.length}/{CAPTURE_COUNT})
            </button>
          ) : (
            <button
              type="button"
              onClick={submitEnrollment}
              disabled={enrolling}
              className={btnPrimary + " flex-1 justify-center"}
            >
              {enrolling ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Enrolling…
                </>
              ) : (
                <>
                  <ShieldCheck size={14} /> Submit Enrollment
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Delete User Confirmation Modal ─────────────────────────────────────────────

function DeleteUserModal({
  user,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  user: UserSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <Modal title="Delete User Account" onClose={onCancel}>
      <div className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm text-[#111827] font-medium">
              Are you sure you want to permanently delete this account?
            </p>
            <p className="text-sm text-[#6b7280] mt-1">
              This will permanently remove <strong>{user.full_name}</strong> ({user.email}) from the
              system. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className={btnSecondary + " flex-1 justify-center"}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 flex-1 justify-center"
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 size={14} /> Delete Account
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Row actions ───────────────────────────────────────────────────────────────

function UserRow({
  user,
  onEnroll,
  onToggleActive,
  onDelete,
  canDelete,
}: {
  user: UserSummary;
  onEnroll: (u: UserSummary) => void;
  onToggleActive: (u: UserSummary) => void;
  onDelete: (u: UserSummary) => void;
  canDelete: boolean;
}) {
  return (
    <tr className="hover:bg-[#f9fafb] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar
            src={user.profile_picture_url}
            name={user.full_name}
            size="sm"
            className="bg-[#eff6ff] text-[#2563eb]"
          />
          <span className="text-sm font-medium text-[#111827]">{user.full_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#6b7280]">{user.email}</td>
      <td className="px-4 py-3 font-mono text-xs text-[#6b7280]">
        {user.student_id ?? "—"}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleColors[user.role]
            }`}
        >
          {roleLabel[user.role]}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {user.is_face_enrolled ? (
          <CheckCircle size={16} className="text-emerald-500 mx-auto" />
        ) : (
          <XCircle size={16} className="text-[#d1d5db] mx-auto" />
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${user.is_active
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
            }`}
        >
          {user.is_active ? "Active" : "Pending"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 justify-end">
          {/* Enroll face */}
          {!user.is_face_enrolled && (
            <button
              title="Enroll Face"
              onClick={() => onEnroll(user)}
              className="p-1.5 text-[#6b7280] hover:text-[#2563eb] hover:bg-[#eff6ff] rounded-lg transition-colors"
            >
              <Camera size={15} />
            </button>
          )}
          {/* Activate / Deactivate */}
          <button
            title={user.is_active ? "Deactivate" : "Activate"}
            onClick={() => onToggleActive(user)}
            className={`p-1.5 rounded-lg transition-colors ${user.is_active
              ? "text-[#6b7280] hover:text-red-600 hover:bg-red-50"
              : "text-[#6b7280] hover:text-emerald-600 hover:bg-emerald-50"
              }`}
          >
            {user.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
          </button>
          {/* Delete permanently */}
          {canDelete && (
            <button
              title="Delete Account"
              onClick={() => onDelete(user)}
              className="p-1.5 text-[#6b7280] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "approved" | "pending";

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [tab, setTab] = useState<Tab>("approved");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [enrollUser, setEnrollUser] = useState<UserSummary | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserSummary | null>(null);

  const canCreateUsers = currentUser && (CREATOR_ROLE_LIMITS[currentUser.role]?.length ?? 0) > 0;
  const canDeleteUsers = currentUser && ["admin", "staff", "director"].includes(currentUser.role);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const queryParams = {
    page,
    page_size: 20,
    ...(search ? { search } : {}),
    // Filter by is_active based on tab
    ...(tab === "approved" ? { is_active: true } : tab === "pending" ? { is_active: false } : {}),
    // Filter by role
    ...(roleFilter ? { role: roleFilter } : {}),
  };

  const { data, isLoading } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["users", tab, page, search, roleFilter],
    queryFn: async () => {
      const res = await usersApi.list(queryParams);
      return res.data;
    },
  });

  // ── Activate / deactivate ───────────────────────────────────────────────────

  const toggleActive = useMutation({
    mutationFn: async (user: UserSummary) => {
      if (user.is_active) {
        await usersApi.deactivate(user.id);
      } else {
        await usersApi.update(user.id, { is_active: true });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // ── Delete permanently ──────────────────────────────────────────────────────

  const deletePermanently = useMutation({
    mutationFn: async (user: UserSummary) => {
      await usersApi.deletePermanently(user.id);
    },
    onSuccess: () => {
      setDeleteUser(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // Separate query for pending count (always runs regardless of tab)
  const { data: pendingData } = useQuery<PaginatedResponse<UserSummary>>({
    queryKey: ["users", "pending-count"],
    queryFn: async () => {
      const res = await usersApi.list({ page: 1, page_size: 1, is_active: false });
      return res.data;
    },
  });
  const pendingCount = pendingData?.total ?? 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#111827]">Users</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">
            Manage OSCA system accounts, roles, and approvals
          </p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setShowCreate(true)} className={btnPrimary}>
            <UserPlus size={15} />
            Create User
          </button>
        )}
      </div>

      {/* Tabs + Search + Role Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 bg-[#f3f4f6] p-1 rounded-lg">
          {(["approved", "pending"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t
                ? "bg-white text-[#111827] shadow-sm"
                : "text-[#6b7280] hover:text-[#374151]"
                }`}
            >
              {t === "approved" ? "Approved Users" : "Pending Approval"}
              {t === "approved" && data && (
                <span className="ml-1.5 text-xs text-[#9ca3af]">({data.total})</span>
              )}
              {t === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as UserRole | "");
            setPage(1);
          }}
          className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
        >
          <option value="">All Roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className="w-full border border-[#d1d5db] rounded-lg pl-8 pr-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
        {/* Pending approval banner */}
        {tab === "pending" && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <ShieldCheck size={15} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800">
              Users below are awaiting approval before they can log in. Click the activate icon to approve.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Student ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Role
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Face
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#6b7280] uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 size={22} className="animate-spin text-[#2563eb] mx-auto" />
                  </td>
                </tr>
              ) : (data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[#9ca3af] text-sm">
                    {tab === "pending"
                      ? "No pending approvals — all registrations are activated."
                      : "No users found."}
                  </td>
                </tr>
              ) : (
                (data?.items ?? []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onEnroll={setEnrollUser}
                    onToggleActive={(usr) => toggleActive.mutate(usr)}
                    onDelete={setDeleteUser}
                    canDelete={!!canDeleteUsers}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#f3f4f6]">
            <p className="text-xs text-[#6b7280]">
              Page {data.page} of {data.pages} · {data.total} users
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] disabled:opacity-40 transition"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pages}
                className="p-1.5 border border-[#d1d5db] rounded-lg text-[#374151] hover:bg-[#f9fafb] disabled:opacity-40 transition"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {enrollUser && (
        <FaceEnrollModal user={enrollUser} onClose={() => setEnrollUser(null)} />
      )}
      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          onConfirm={() => deletePermanently.mutate(deleteUser)}
          onCancel={() => setDeleteUser(null)}
          isDeleting={deletePermanently.isPending}
        />
      )}
    </div>
  );
}
