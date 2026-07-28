"use client";

/**
 * US-002: User Self-Registration (Updated)
 * 4-step wizard: Account → Profile → Emergency & Consent → Profile Picture.
 * Supports all roles except admin. Student-specific fields are conditionally shown.
 *
 * Flow: register account → pending approval (admin must activate before login).
 *
 * Design: Direction 1 – Clean Professional (dark navy #0f172a auth shell,
 * white card, blue #1d4ed8 primary, aligned to OSCA PRD v2 frontend spec).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useForm, useController, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import { usersApi } from "@/lib/api";
import {
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  ImagePlus,
  Eye,
  EyeOff,
  Crop,
  Camera,
  CircleDot,
  X,
} from "lucide-react";
import type { UserRole } from "@/types";

// ── Role options (no admin) ────────────────────────────────────────────────────

const REGISTRATION_ROLES: { value: string; label: string }[] = [
  { value: "student_athlete", label: "Student Athlete" },
  { value: "student_artist", label: "Student Artist" },
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

// ── Course options (for searchable Course field) ────────────────────────────────

const COURSES: string[] = [
  "BSAT",
  "BSAeE",
  "BSAMT",
  "BSAET",
  "AAMT",
  "AAET",
  "BSAvCOMM",
  "BSATTM",
  "BSAvSSM",
  "BSSCM-AvLOG",
  "BSIT-AIT",
  "BSIS-AIS",
];

// ── Zod schema ─────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    role: z.enum(["student_athlete", "student_artist", "coach", "pe_instructor", "director"], {
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
    if (data.role === "student_athlete" || data.role === "student_artist") {
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

const STEPS = ["Account", "Profile", "Emergency & Consent", "Face Capture", "Profile Picture"];

function getCroppedImg(imageSrc: string, pixelCrop: { x: number; y: number; width: number; height: number }): Promise<File> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
      canvas.toBlob((blob) => {
        resolve(new File([blob!], "profile.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    };
    image.src = imageSrc;
  });
}

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
  filterGroup,
}: {
  control: Control<RegisterForm>;
  name: "sport_or_art";
  filterGroup?: "Sports" | "Cultural Affairs";
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

  const sourceOptions = filterGroup
    ? SPORTS_OPTIONS.filter((g) => g.group === filterGroup)
    : SPORTS_OPTIONS;

  const filtered = sourceOptions.map((g) => ({
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

function CourseCombobox({
  control,
  name,
}: {
  control: Control<RegisterForm>;
  name: "course";
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

  const filtered = COURSES.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase())
  );

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
        placeholder="Select your course"
        className={inputCls}
      />
      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-h-60 overflow-y-auto bg-white border border-[#e9d9a8] rounded-xl shadow-lg py-1">
          {filtered.length > 0 ? (
            filtered.map((course) => (
              <button
                type="button"
                key={course}
                onClick={() => {
                  field.onChange(course);
                  setQuery(course);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  field.value === course
                    ? "bg-[#fdf6e8] text-[#8a6d1f] font-semibold"
                    : "text-[#1f2937] hover:bg-[#fdf6e8]"
                }`}
              >
                {course}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-400 italic">No course found</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);

  // Face enrollment state
  const [faceImages, setFaceImages] = useState<string[]>([]); // base64 strings
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Face enrollment result state
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [faceEnrollLoading, setFaceEnrollLoading] = useState(false);

  // Profile picture state
  const profilePicInputRef = useRef<HTMLInputElement>(null);
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ width: number; height: number; x: number; y: number } | null>(null);

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
    defaultValues: { role: "student_athlete" },
  });

  const selectedRole = watch("role");
  const isStudent = selectedRole === "student_athlete" || selectedRole === "student_artist";

  // Fields per step — used for per-step validation before advancing
  const stepFields: (keyof RegisterForm)[][] = [
    ["email", "password", "confirmPassword", "role"],
    isStudent
      ? ["first_name", "last_name", "student_id", "course", "year_level", "sport_or_art"]
      : ["first_name", "last_name", "sport_or_art"],
    ["emergency_contact_name", "emergency_contact_number", "biometric_consent"],
    [], // Step 3 — face capture, no form fields
    [], // Step 4 — profile picture, optional
  ];

  const advance = async () => {
    setApiError(null);
    const valid = await trigger(stepFields[step] as (keyof RegisterForm)[]);
    if (valid) setStep((s) => s + 1);
  };

  // Submit face enrollment: create user + enroll face, only advance if enrollment succeeds
  const submitFaceEnrollment = async () => {
    if (faceImages.length < 5) {
      setApiError("Please capture 5 face images before submitting.");
      return;
    }
    setApiError(null);
    setFaceEnrollLoading(true);

    // Validate all form fields up to this point
    const valid = await trigger();
    if (!valid) {
      setFaceEnrollLoading(false);
      return;
    }

    const data = watch();

    try {
      const createPayload: Record<string, unknown> = {
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        middle_name: data.middle_name || undefined,
        role: data.role === "student_athlete" || data.role === "student_artist" ? "student" : data.role,
        sport_or_art: data.sport_or_art,
        medical_info: data.medical_info || undefined,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_number: data.emergency_contact_number,
        biometric_consent: true,
        contact_number: data.contact_number || undefined,
        face_images_base64: faceImages,
      };

      if (data.role === "student_athlete" || data.role === "student_artist") {
        createPayload.student_id = data.student_id;
        createPayload.course = data.course;
        createPayload.year_level = data.year_level;
      }

      if (data.role === "coach" || data.role === "pe_instructor") {
        createPayload.assigned_sport = data.assigned_sport || data.sport_or_art;
      }

      const response = await usersApi.create(createPayload) as { data?: { id?: string; is_face_enrolled?: boolean } };
      const userId = response?.data?.id;
      const enrolled = response?.data?.is_face_enrolled;

      if (!userId) {
        setApiError("Registration failed. Please try again.");
        setFaceEnrollLoading(false);
        return;
      }

      setCreatedUserId(userId);

      if (enrolled) {
        setFaceEnrolled(true);
        stopCamera();
        setStep(4);
      } else {
        setApiError(
          "Facial recognition enrollment failed. Your account has been created, but you will need to complete face enrollment after logging in. Please contact the OSCA administrator for assistance."
        );
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Registration failed. Please try again.";
      setApiError(msg);
    } finally {
      setFaceEnrollLoading(false);
    }
  };

  // Submit: upload profile picture if provided, then redirect
  const onSubmit = async (data: RegisterForm) => {
    setApiError(null);

    if (!createdUserId) {
      setStep(3);
      return;
    }

    // Upload profile picture if provided
    if (profilePicFile) {
      try {
        await usersApi.uploadProfilePicture(createdUserId, profilePicFile);
      } catch {
        // Profile picture upload failure is non-fatal
      }
    }

    router.push("/register/success");
  };

  // Camera cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Attach stream to video element once it mounts
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);



  // ── Camera helpers ─────────────────────────────────────────────────────────

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setApiError(null);
    } catch {
      setApiError("Camera access denied. Please allow camera permissions and try again.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Reject if camera feed is not ready
    if (!video.videoWidth || !video.videoHeight) {
      setApiError("Camera is not ready. Please wait a moment and try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ── Face detection: sample center region (where face should be) ───────
    const sampleW = Math.min(canvas.width, 320);
    const sampleH = Math.min(canvas.height, 240);
    const sx = Math.floor((canvas.width - sampleW) / 2);
    const sy = Math.floor((canvas.height - sampleH) / 2);
    const imageData = ctx.getImageData(sx, sy, sampleW, sampleH);
    const px = imageData.data;

    let totalBrightness = 0;
    let minB = 255;
    let maxB = 0;
    let skinPixels = 0;
    let sampledPixels = 0;
    const pxStep = Math.max(4, Math.floor(px.length / 4 / 2000)) * 4;

    for (let i = 0; i < px.length; i += pxStep) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      if (brightness < minB) minB = brightness;
      if (brightness > maxB) maxB = brightness;
      sampledPixels++;

      // Skin-tone heuristic (works across light-to-medium skin tones)
      // Conditions: R > 95, G > 40, B > 20, R-G > 15, R-B > 15, max(R,G,B) - min(R,G,B) > 15
      if (
        r > 95 && g > 40 && b > 20 &&
        r - g > 15 && r - b > 15 &&
        (Math.max(r, g, b) - Math.min(r, g, b)) > 15
      ) {
        skinPixels++;
      }
    }

    const avgBrightness = totalBrightness / sampledPixels;
    const contrastRange = maxB - minB;
    const skinRatio = skinPixels / sampledPixels;

    // Reject if too dark, too flat, or no skin-tone pixels detected
    if (avgBrightness < 30) {
      setApiError("The image is too dark. Please ensure good lighting and try again.");
      return;
    }
    if (contrastRange < 20) {
      setApiError("No face detected. Please face the camera directly and try again.");
      return;
    }
    if (skinRatio < 0.08) {
      setApiError(
        "No face detected. Please position your face in the center of the frame with good lighting."
      );
      return;
    }

    setApiError(null);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1];
    setFaceImages((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, base64];
    });
  }, []);

  const removeFaceImage = (index: number) => {
    setFaceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCapture = useCallback(() => {
    // 3-second countdown then capture
    setCaptureCountdown(3);
    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(timer);
        setCaptureCountdown(null);
        captureImage();
      } else {
        setCaptureCountdown(count);
      }
    }, 800);
  }, [captureImage]);

  // ── Success screen ───────────────────────────────────────────────────────────

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
                <div className="relative">
                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    className={inputCls + " pr-11"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm Password" error={errors.confirmPassword?.message} required>
                <div className="relative">
                  <input
                    {...register("confirmPassword")}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    className={inputCls + " pr-11"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
            </>
          )}

          {/* ── STEP 1: Profile ────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <p className="text-sm font-semibold text-white">
                {isStudent ? "Student Profile" : "User Profile"}
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
              {isStudent && (
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
                      <CourseCombobox control={control} name="course" />
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
                <SportCombobox
                  control={control}
                  name="sport_or_art"
                  filterGroup={selectedRole === "student_athlete" ? "Sports" : selectedRole === "student_artist" ? "Cultural Affairs" : undefined}
                />
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

          {/* ── STEP 3: Face Capture (Modal Style) ──────────────────────── */}
          {step === 3 && (
            <>
              <div className="flex flex-col items-center gap-4">
                {/* ── Modal card ───────────────────────────────────────── */}
                <div className="w-full bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div>
                      <h3 className="text-base font-bold text-white">Face Capture</h3>
                      <p className="text-xs text-white/40 mt-0.5">
                        {watch("first_name")} {watch("last_name")}
                        {faceEnrolled && <span className="text-green-400 ml-2">✓ Enrolled</span>}
                      </p>
                    </div>
                    {faceImages.length > 0 && !faceEnrolled && !createdUserId && (
                      <button
                        type="button"
                        onClick={() => { stopCamera(); setFaceImages([]); setStep(2); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition"
                        title="Back"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4 space-y-4">
                    {/* Instructions */}
                    <div className="flex items-start gap-2.5 bg-[#fdf6e8] border border-[#e9d9a8] rounded-xl px-4 py-3">
                      <Camera size={15} className="text-[#1d4ed8] mt-0.5 shrink-0" />
                      <p className="text-xs text-[#6b5424] leading-relaxed">
                        Capture <span className="font-semibold">5 face images</span> at different angles
                        (front, left, right, slightly up, slightly down). Ensure good lighting.
                      </p>
                    </div>

                    {/* Camera preview with face guide overlay */}
                    <div className="relative w-full max-w-xs mx-auto aspect-[3/4] rounded-2xl overflow-hidden bg-black border border-white/10">
                      {cameraActive ? (
                        <>
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                          {/* Oval face guide overlay */}
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div
                              className="w-[55%] h-[65%] rounded-[50%] border-2 border-white/50"
                              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
                            />
                          </div>
                          {/* Capture counter badge */}
                          <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
                            {faceImages.length}/5
                          </div>
                          {/* Countdown overlay */}
                          {captureCountdown !== null && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <span className="text-6xl font-bold text-white animate-pulse drop-shadow-lg">
                                {captureCountdown}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                          <div className="w-16 h-16 rounded-full bg-white/[0.06] flex items-center justify-center">
                            <Camera size={24} className="text-white/30" />
                          </div>
                          <p className="text-xs text-white/30 text-center px-6">
                            {faceImages.length >= 5
                              ? "All 5 images captured"
                              : "Click Start Camera below to begin"}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Hidden canvas */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Progress dots */}
                    <div className="flex items-center justify-center gap-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                            i < faceImages.length
                              ? "bg-[#C9A84C] scale-110"
                              : "bg-white/15"
                          }`}
                        />
                      ))}
                    </div>

                    {/* Capture button */}
                    {!cameraActive ? (
                      faceImages.length >= 5 ? null : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
                        >
                          <Camera size={16} /> Start Camera
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={handleCapture}
                        disabled={faceImages.length >= 5 || captureCountdown !== null}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-[#1d4ed8]/25 disabled:opacity-50"
                      >
                        <CircleDot size={16} /> Capture ({faceImages.length}/5)
                      </button>
                    )}

                    {/* Submit Face Enrollment button — shown after 5 captures, only if user not yet created */}
                    {faceImages.length >= 5 && !faceEnrolled && !createdUserId && (
                      <button
                        type="button"
                        onClick={submitFaceEnrollment}
                        disabled={faceEnrollLoading}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-green-600/25 disabled:opacity-50"
                      >
                        {faceEnrollLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enrolling Face…
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} /> Submit Face Enrollment
                          </>
                        )}
                      </button>
                    )}

                    {/* Captured thumbnails strip */}
                    {faceImages.length > 0 && (
                      <div className="flex items-center justify-center gap-2">
                        {faceImages.map((img, i) => (
                          <div key={i} className="relative group shrink-0">
                            <img
                              src={`data:image/jpeg;base64,${img}`}
                              alt={`Face ${i + 1}`}
                              className="w-12 h-12 object-cover rounded-lg border border-white/15"
                            />
                            <button
                              type="button"
                              onClick={() => removeFaceImage(i)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[8px] leading-none"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Success message */}
                    {faceImages.length >= 5 && !faceEnrolled && !faceEnrollLoading && (
                      <div className="flex items-center justify-center gap-2 text-[#C9A84C] text-xs font-medium">
                        <CheckCircle2 size={14} /> 5 face images captured — click Submit Face Enrollment below
                      </div>
                    )}
                    {faceEnrolled && (
                      <div className="flex items-center justify-center gap-2 text-green-400 text-xs font-medium">
                        <CheckCircle2 size={14} /> Face enrollment successful — click Continue below
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── STEP 4: Profile Picture (Optional) ──────────────────────── */}
          {step === 4 && (
            <>
              <p className="text-sm font-semibold text-white">Profile Picture <span className="text-white/40 font-normal">(Optional)</span></p>
              <div className="flex items-start gap-2 bg-[#fdf6e8] border border-[#e9d9a8] rounded-xl p-3">
                <ImagePlus size={16} className="text-[#1d4ed8] mt-0.5 shrink-0" />
                <p className="text-xs text-[#6b5424] leading-relaxed">
                  Upload a clear photo of yourself. You can crop it to fit. This will be used as
                  your profile picture across the system. You can skip this step and add one later.
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
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setCropSrc(ev.target?.result as string);
                        setCrop({ x: 0, y: 0 });
                        setZoom(1);
                      };
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

          {/* Show API errors for all steps */}
          {apiError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl">
              {apiError}
            </div>
          )}

          {/* Show form validation errors when on last step */}
          {step === STEPS.length - 1 && Object.keys(errors).length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl">
              <p className="font-semibold mb-1">Please fix the following:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {Object.entries(errors).map(([field, err]) => (
                  <li key={field}>{(err as { message?: string })?.message ?? `${field} is invalid`}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Navigation buttons ──────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            {step > 0 && step !== 3 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 border border-white/10 text-white/70 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-white/5 transition"
              >
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {step < 4 ? (
              step === 3 ? (
                faceEnrolled ? (
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
                  >
                    Continue <ChevronRight size={16} />
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  onClick={advance}
                  className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
                >
                  Continue <ChevronRight size={16} />
                </button>
              )
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25 disabled:opacity-50"
              >
                {isSubmitting ? "Submitting…" : "Submit Registration"}
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

        {/* ── Crop Modal ─────────────────────────────────────────────── */}
        {cropSrc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Crop size={16} className="text-[#C9A84C]" />
                  <p className="text-sm font-semibold text-white">Crop your photo</p>
                </div>
                <p className="text-xs text-white/40">Drag to reposition, scroll to zoom</p>
              </div>
              <div className="relative w-full h-72 bg-black">
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_cropped, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                />
              </div>
              <div className="px-5 py-3">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[#C9A84C]"
                />
              </div>
              <div className="flex gap-3 px-5 pb-5">
                <button
                  type="button"
                  onClick={() => {
                    setCropSrc(null);
                    if (profilePicInputRef.current) profilePicInputRef.current.value = "";
                  }}
                  className="flex-1 border border-white/10 text-white/70 text-sm font-medium py-2.5 rounded-xl hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!cropSrc || !croppedAreaPixels) return;
                    const croppedFile = await getCroppedImg(cropSrc, croppedAreaPixels);
                    setProfilePicFile(croppedFile);
                    setProfilePicPreview(URL.createObjectURL(croppedFile));
                    setCropSrc(null);
                  }}
                  className="flex-1 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#C9A84C] hover:to-[#132a4d] text-white text-sm font-semibold py-2.5 rounded-xl transition shadow-lg shadow-[#1d4ed8]/25"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
