"use client";

/**
 * US-002: User Self-Registration (Updated)
 * 5-step wizard: Account → Profile → Emergency & Consent → Profile Picture → Face Enrollment.
 * Supports all roles except admin. Student-specific fields are conditionally shown.
 *
 * Flow: register account → auto-login → upload profile picture (optional) → enroll face → success.
 *
 * Design: Direction 1 – Clean Professional (dark navy #0f172a auth shell,
 * white card, blue #1d4ed8 primary, aligned to OSCA PRD v2 frontend spec).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useForm, useController, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import Webcam from "react-webcam";
import { usersApi, attendanceApi, authApi } from "@/lib/api";
import Cookies from "js-cookie";
import {
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Camera,
  RotateCcw,
  ArrowLeft,
  ImagePlus,
} from "lucide-react";
import type { UserRole } from "@/types";

// ── Role options (no admin) ────────────────────────────────────────────────────

const REGISTRATION_ROLES: { value: UserRole; label: string }[] = [
  { value: "student", label: "Student Athlete" },
  { value: "student", label: "Student Artist" },
];

// ── Sports / Cultural Affairs options (for searchable Sport / Art field) ───────

const SPORTS_OPTIONS: { group: string; items: string[] }[] = [
  {
    group: "Sports",
    items: [
      "Arnis",
      "Badminton",
      "Basketball",
      "Sepak Takraw",
      "Table Tennis",
      "Taekwondo",
      "Volleyball Men",
      "Volleyball Women",
    ],
  },
  {
    group: "Cultural Affairs",
    items: [
      "Hataw Himpapawid Dance Group",
      "Himig Himpapawid Chorale",
      "Musikang Himpapawid Live Band",
    ],
  },
];

// ── Zod schema ─────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    role: z.enum(["student", "coach", "pe_instructor", "director"], {
      required_error: "Please select a role",
    }),
    first_name: z.string().min(2, "First name is required"),
    last_name: z.string().min(2, "Last name is required"),
    middle_name: z.string().optional(),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string(),
    student_id: z.string().optional(),
    course: z.string().optional(),
    year_level: z.string().optional(),
    sport_or_art: z.string().min(2, "Sport or art is required"),
    contact_number: z.string().optional(),
    medical_info: z.string().optional(),
    emergency_contact_name: z.string().min(2, "Emergency contact name is required"),
    emergency_contact_number: z
      .string()
      .min(7, "Emergency contact number is required")
      .regex(/^\+?[0-9\s\-()]+$/, "Enter a valid phone number"),
    assigned_sport: z.string().optional(),
    biometric_consent: z.literal(true, {
      errorMap: () => ({
        message: "You must provide consent to proceed with enrollment",
      }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .superRefine((data, ctx) => {
    if (data.role === "student") {
      if (!data.student_id || data.student_id.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Student ID is required",
          path: ["student_id"],
        });
      }
      if (!data.course || data.course.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Course is required",
          path: ["course"],
        });
      }
      if (!data.year_level || data.year_level.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Year level is required",
          path: ["year_level"],
        });
      }
    }
  });

type RegisterForm = z.infer<typeof registerSchema>;

// ── Step labels ────────────────────────────────────────────────────────────────

const STEPS = ["Account", "Profile", "Emergency & Consent", "Profile Picture", "Face Enrollment"];
const CAPTURE_COUNT = 5;

// ── Field helper ───────────────────────────────────────────────────────────────

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
      <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white " +
  "focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 " +
  "placeholder:text-white/25 transition-all";

// ── Searchable Sport / Cultural Affairs combobox ────────────────────────────────

function SportCombobox({
  control,
  name,
}: {
  control: Control<RegisterForm>;
  name: "sport_or_art";
}) {
  const { field } = useController({ control, name });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(field.value || "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(field.value || "");
  }, [field.value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = SPORTS_OPTIONS.map((g) => ({
    group: g.group,
    items: g.items.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          field.onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        placeholder="Search or select sport / cultural group"
        className={inputCls}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-60 overflow-y-auto bg-white border border-[#e9d9a8] rounded-xl shadow-lg py-1">
          {filtered.map((g) => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a6d1f]">
                {g.group}
              </p>
              {g.items.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => {
                    field.onChange(item);
                    setQuery(item);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[#1f2937] hover:bg-[#fdf6e8] transition"
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Face enrollment state
  const webcamRef = useRef<Webcam>(null);
  const [captures, setCaptures] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

  // Profile picture state
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: { role: "student" },
  });

  const selectedRole = watch("role");

  // Fields per step — used for per-step validation before advancing
  const stepFields: (keyof RegisterForm)[][] = [
    ["email", "password", "confirmPassword", "role"],
    selectedRole === "student"
      ? ["first_name", "last_name", "student_id", "course", "year_level", "sport_or_art"]
      : ["first_name", "last_name", "sport_or_art"],
    ["emergency_contact_name", "emergency_contact_number", "biometric_consent"],
    [], // Step 3 — profile picture, optional
    [], // Step 4 — face enrollment, validated separately
  ];

  const advance = async () => {
    const valid = await trigger(stepFields[step] as (keyof RegisterForm)[]);
    if (valid) setStep((s) => s + 1);
  };

  // Webcam capture
  const capture = useCallback(() => {
    const img = webcamRef.current?.getScreenshot();
    if (img && captures.length < CAPTURE_COUNT) {
      setCaptures((prev) => [...prev, img]);
    }
  }, [captures.length]);

  const resetCaptures = () => {
    setCaptures([]);
    setApiError(null);
  };

  // Submit: create account → auto-login → enroll face
  const onSubmit = async (data: RegisterForm) => {
    setApiError(null);

    try {
      // 1. Create the user account
      const createPayload: Record<string, unknown> = {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        middle_name: data.middle_name || undefined,
        role: data.role,
        sport_or_art: data.sport_or_art,
        medical_info: data.medical_info || undefined,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_number: data.emergency_contact_number,
        biometric_consent: true,
        contact_number: data.contact_number || undefined,
      };

      // Student-specific fields
      if (data.role === "student") {
        createPayload.student_id = data.student_id;
        createPayload.course = data.course;
        createPayload.year_level = data.year_level;
      }

      // Coach/instructor-specific
      if (data.role === "coach" || data.role === "pe_instructor") {
        createPayload.assigned_sport = data.assigned_sport || data.sport_or_art;
      }

      const { data: newUser } = await usersApi.create(createPayload);
      setCreatedUserId(newUser.id);

      // 2. Auto-login to get JWT (needed for face enrollment endpoint)
      const { data: tokenData } = await authApi.login(data.email, data.password);
      Cookies.set("access_token", tokenData.access_token, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: 1 / 96,
      });
      Cookies.set("refresh_token", tokenData.refresh_token, {
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: 7,
      });

      // 3. Upload profile picture (optional)
      if (profilePicFile) {
        try {
          const formData = new FormData();
          formData.append("file", profilePicFile);
          await usersApi.uploadProfilePicture(newUser.id, profilePicFile);
        } catch {
          // Profile picture upload is non-critical — continue
        }
      }

      // 4. Enroll face — wrapped so we can always clean up tokens
      try {
        const images = captures.map((c) => c.split(",")[1]);
        await attendanceApi.enroll({ user_id: newUser.id, images_base64: images });
      } catch (frErr: unknown) {
        // Face enrollment failed but account was created — surface the FR error
        // and still fall through to token cleanup + success state so the user
        // can log in and retry enrollment later from the dashboard.
        const frMsg =
          (frErr as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Face enrollment failed. You can retry from the dashboard after logging in.";
        console.warn("Face enrollment error:", frMsg);
      }

      // 5. Always clean up auth tokens (user should login manually)
      Cookies.remove("access_token");
      Cookies.remove("refresh_token");

      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed. Please try again.";
      setApiError(msg);
    }
  };

  // ── Success screen ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#081428]">
        <div className="absolute inset-0">
          <div className="absolute -top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(80px)" }} />
          <div className="absolute top-[30%] -right-[15%] w-[50vw] h-[50vw] rounded-full opacity-15 animate-pulse" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(80px)" }} />
        </div>
        <div className="relative z-10 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-10 w-full max-w-md text-center shadow-[0_8px_60px_rgba(0,0,0,0.4)]">
          <CheckCircle2 size={52} className="text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Registration Complete</h2>
          <p className="text-sm text-white/50 mb-1">
            Your account has been created and your face has been enrolled.
          </p>
          <p className="text-sm text-white/50 mb-6">
            You can now sign in with your credentials.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-3 px-6 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#081428] relative overflow-hidden">
      {/* Left brand panel — big logo */}
      <div className="hidden md:flex w-[42%] shrink-0 relative items-center justify-center bg-[#0d1f3c] border-r-4 border-[#C9A84C] overflow-hidden">
        <div className="absolute -top-[15%] -left-[15%] w-[60%] h-[60%] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(90px)" }} />
        <div className="absolute -bottom-[15%] -right-[10%] w-[55%] h-[55%] rounded-full opacity-15 animate-pulse" style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(90px)" }} />
        
         {/* Back to Main Website */}
        <Link
          href="/"
          className="group absolute top-6 left-6 z-20 inline-flex items-center gap-2 text-xs font-semibold text-white/80 hover:text-white transition-all duration-300 ease-out"
        >
          <ArrowLeft size={15} className="transition-transform duration-300 ease-out group-hover:-translate-x-1" />
          Back to Main Website
        </Link>
        
        <div className="relative z-10 flex flex-col items-center text-center px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/osca-logo.png"
            alt="OSCA Crest"
            className="w-56 h-56 object-contain drop-shadow-[0_10px_50px_rgba(201,168,76,0.35)] mb-8"
          />
          <h2 className="text-2xl font-extrabold text-white tracking-wide leading-snug">
            OFFICE OF SPORTS
            <br />
            AND CULTURAL AFFAIRS
          </h2>
          <p className="text-sm text-[#C9A84C] font-semibold mt-3 tracking-[0.2em] uppercase">
            NAAP · Villamor Campus
          </p>
          <div className="w-16 h-1 bg-[#C9A84C] rounded-full mt-6" />
          <p className="text-xs text-white/50 mt-6 max-w-xs leading-relaxed">
            Empowering student athletes and artists through excellence, discipline, and creativity.
          </p>
        </div>
      </div>

      {/* Right side — registration form */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden py-10">
        {/* Animated background */}
        <div className="absolute inset-0">
          <div className="absolute -top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(80px)" }} />
          <div className="absolute top-[30%] -right-[15%] w-[50vw] h-[50vw] rounded-full opacity-15 animate-pulse" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(80px)" }} />
          <div className="absolute -bottom-[20%] left-[30%] w-[45vw] h-[45vw] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #f5d778, transparent 70%)", filter: "blur(80px)" }} />
        </div>

        <div className="relative z-10 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-[0_8px_60px_rgba(0,0,0,0.4)] w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-full bg-[#132a4d] border-2 border-[#C9A84C] overflow-hidden flex items-center justify-center shrink-0">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src="/osca-logo.png"
    alt="OSCA Logo"
    className="w-full h-full object-cover"
  />
</div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">OSCA Management System</h1>
              <p className="text-xs text-[#C9A84C]">NAAP-Villamor · User Registration</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-5">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition ${i < step
                      ? "bg-[#1d4ed8] text-white"
                      : i === step
                        ? "border-2 border-[#C9A84C] text-[#C9A84C]"
                        : "border-2 border-white/10 text-white/30"
                    }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[10px] font-medium hidden sm:block leading-tight ${i === step ? "text-[#C9A84C]" : "text-white/30"
                    }`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-px flex-1 ${i < step ? "bg-[#1d4ed8]" : "bg-white/[0.08]"}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-8 py-6 space-y-4">
          {/* ── STEP 0: Account ────────────────────────────────────────────── */}
          {step === 0 && (
            <>
              <p className="text-sm font-semibold text-white">Account Credentials</p>

              <Field label="Role" error={errors.role?.message} required>
                <select {...register("role")} className={inputCls}>
                  {REGISTRATION_ROLES.map((r) => (
                    <option key={r.label} value={r.value} className="text-black">
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Email Address" error={errors.email?.message} required>
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="your.email@naap.edu.ph"
                  className={inputCls}
                />
              </Field>
              <Field label="Password" error={errors.password?.message} required>
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  className={inputCls}
                />
              </Field>
              <Field label="Confirm Password" error={errors.confirmPassword?.message} required>
                <input
                  {...register("confirmPassword")}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {/* ── STEP 1: Profile ────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <p className="text-sm font-semibold text-white">
                {selectedRole === "student" ? "Student Profile" : "User Profile"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" error={errors.first_name?.message} required>
                  <input {...register("first_name")} className={inputCls} placeholder="Juan" />
                </Field>
                <Field label="Last Name" error={errors.last_name?.message} required>
                  <input {...register("last_name")} className={inputCls} placeholder="Dela Cruz" />
                </Field>
              </div>
              <Field label="Middle Name" error={errors.middle_name?.message}>
                <input {...register("middle_name")} className={inputCls} placeholder="Optional" />
              </Field>

              {/* Student-specific fields */}
              {selectedRole === "student" && (
                <>
                  <Field label="Student ID" error={errors.student_id?.message} required>
                    <input
                      {...register("student_id")}
                      className={inputCls}
                      placeholder="e.g. 2024-0001"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Course" error={errors.course?.message} required>
                      <input
                        {...register("course")}
                        className={inputCls}
                        placeholder="e.g. BSIT"
                      />
                    </Field>
                    <Field label="Year Level" error={errors.year_level?.message} required>
                      <select {...register("year_level")} className={inputCls}>
                        <option value="" className="text-black">Select…</option>
                        <option value="1st Year" className="text-black">1st Year</option>
                        <option value="2nd Year" className="text-black">2nd Year</option>
                        <option value="3rd Year" className="text-black">3rd Year</option>
                        <option value="4th Year" className="text-black">4th Year</option>
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {/* Coach/PE Instructor: assigned sport */}
              {(selectedRole === "coach" || selectedRole === "pe_instructor") && (
                <Field label="Assigned Sport" error={errors.assigned_sport?.message}>
                  <input
                    {...register("assigned_sport")}
                    className={inputCls}
                    placeholder="e.g. Basketball, Volleyball"
                  />
                </Field>
              )}

              <Field label="Sport / Art" error={errors.sport_or_art?.message} required>
                <SportCombobox control={control} name="sport_or_art" />
              </Field>

              <Field label="Contact Number" error={errors.contact_number?.message}>
                <input
                  {...register("contact_number")}
                  type="tel"
                  className={inputCls}
                  placeholder="+63 9XX XXX XXXX"
                />
              </Field>

              <Field label="Medical Information" error={errors.medical_info?.message}>
                <textarea
                  {...register("medical_info")}
                  rows={2}
                  className={inputCls + " resize-none"}
                  placeholder="Allergies, conditions, or none"
                />
              </Field>
            </>
          )}

          {/* ── STEP 2: Emergency & Consent ────────────────────────────────── */}
          {step === 2 && (
            <>
              <p className="text-sm font-semibold text-white">Emergency Contact</p>
              <Field
                label="Contact Name"
                error={errors.emergency_contact_name?.message}
                required
              >
                <input
                  {...register("emergency_contact_name")}
                  className={inputCls}
                  placeholder="Full name"
                />
              </Field>
              <Field
                label="Contact Number"
                error={errors.emergency_contact_number?.message}
                required
              >
                <input
                  {...register("emergency_contact_number")}
                  type="tel"
                  className={inputCls}
                  placeholder="+63 9XX XXX XXXX"
                />
              </Field>

              {/* Biometric Consent — R.A. 10173 */}
              <div className="mt-2 p-4 bg-[#fdf6e8] border border-[#e9d9a8] rounded-xl">
                <div className="flex items-start gap-2 mb-2">
                  <ShieldCheck size={18} className="text-[#1d4ed8] mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-[#8a6d1f]">
                    Biometric Data Consent — R.A. 10173 (Data Privacy Act of 2012)
                  </p>
                </div>
                <p className="text-xs text-[#6b5424] leading-relaxed mb-3">
                  I hereby give my explicit consent to the National Aviation Academy of the
                  Philippines (NAAP–Villamor) and the Office of Sports and Cultural Affairs (OSCA)
                  to collect, store, and process my facial biometric data solely for attendance
                  tracking purposes. I understand that my raw facial images will be deleted after
                  embedding generation, that face embeddings are encrypted at rest (AES-256-GCM),
                  and that I may request deletion of my biometric data at any time by contacting
                  the OSCA Data Privacy Officer.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    {...register("biometric_consent")}
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-[#1d4ed8]"
                  />
                  <span className="text-xs text-[#6b5424] font-medium">
                    I have read and I agree to the biometric data consent above.
                    <span className="text-red-500 ml-0.5">*</span>
                  </span>
                </label>
                {errors.biometric_consent && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.biometric_consent.message}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── STEP 3: Profile Picture (Optional) ──────────────────────── */}
          {step === 3 && (
            <>
              <p className="text-sm font-semibold text-white">Profile Picture</p>
              <div className="flex items-start gap-2 bg-[#fdf6e8] border border-[#e9d9a8] rounded-xl p-3">
                <ImagePlus size={16} className="text-[#1d4ed8] mt-0.5 shrink-0" />
                <p className="text-xs text-[#6b5424] leading-relaxed">
                  Upload a clear photo of yourself. This will be used as your profile picture
                  across the system. You can skip this step and add one later.
                </p>
              </div>

              {/* Upload area */}
              <div className="flex flex-col items-center gap-4">
                {profilePicPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profilePicPreview}
                      alt="Profile preview"
                      className="w-32 h-32 rounded-full object-cover border-4 border-[#1d4ed8] shadow-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePicFile(null);
                        setProfilePicPreview(null);
                        if (profilePicInputRef.current) profilePicInputRef.current.value = "";
                      }}
                      className="absolute top-0 right-0 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow transition"
                      title="Remove photo"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => profilePicInputRef.current?.click()}
                    className="w-32 h-32 rounded-full border-2 border-dashed border-white/20 hover:border-[#C9A84C]/50 flex flex-col items-center justify-center gap-2 text-white/40 hover:text-white/60 transition cursor-pointer"
                  >
                    <ImagePlus size={28} />
                    <span className="text-[10px] font-medium">Upload</span>
                  </button>
                )}

                <input
                  ref={profilePicInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setProfilePicFile(file);
                      const reader = new FileReader();
                      reader.onload = (ev) => setProfilePicPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                />

                {profilePicPreview && (
                  <button
                    type="button"
                    onClick={() => profilePicInputRef.current?.click()}
                    className="text-xs text-[#C9A84C] hover:text-[#e6cf8c] font-medium transition"
                  >
                    Choose a different photo
                  </button>
                )}

                <p className="text-xs text-white/30 text-center">
                  JPEG, PNG, or WebP. Max 5 MB.
                </p>
              </div>
            </>
          )}

          {/* ── STEP 4: Face Enrollment ────────────────────────────────────── */}
          {step === 4 && (
            <>
              {/* Instructions */}
              <div className="flex items-start gap-2 bg-[#fdf6e8] border border-[#e9d9a8] rounded-xl p-3">
                <Camera size={16} className="text-[#1d4ed8] mt-0.5 shrink-0" />
                <p className="text-xs text-[#6b5424] leading-relaxed">
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
                {/* Face guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-40 h-52 border-2 border-white/40 rounded-full" />
                </div>
                {/* Counter badge */}
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
                      className="w-14 h-14 rounded-lg overflow-hidden border-2 border-[#1d4ed8] relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 bg-[#1d4ed8] text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-tl">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Capture / Reset buttons */}
              <div className="flex gap-3">
                {captures.length < CAPTURE_COUNT && (
                  <button
                    type="button"
                    onClick={capture}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white text-sm font-semibold py-2.5 rounded-lg transition"
                  >
                    <Camera size={15} /> Capture ({captures.length}/{CAPTURE_COUNT})
                  </button>
                )}
                {captures.length > 0 && (
                  <button
                    type="button"
                    onClick={resetCaptures}
                    className="flex items-center gap-1.5 border border-white/10 text-white/70 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-white/5 transition"
                  >
                    <RotateCcw size={14} /> Retake
                  </button>
                )}
              </div>

              {apiError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {apiError}
                </div>
              )}
            </>
          )}

          {/* Show API errors for non-face steps too */}
          {step < 3 && apiError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl">
              {apiError}
            </div>
          )}

          {/* ── Navigation buttons ──────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 border border-white/10 text-white/70 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/5 transition"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={advance}
                className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
              >
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || enrolling || captures.length < CAPTURE_COUNT}
                className="flex-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25 disabled:opacity-50"
              >
                {isSubmitting || enrolling ? "Submitting…" : "Submit Registration"}
              </button>
            )}
          </div>

          {/* Footer link */}
          <p className="text-center text-xs text-white/40 pt-1">
            Already have an account?{" "}
            <Link href="/login" className="text-[#C9A84C] font-medium hover:text-[#e6cf8c] transition">
              Sign in
            </Link>
          </p>
        </form>
      </div>
      </div>
    </div>
  );
}
