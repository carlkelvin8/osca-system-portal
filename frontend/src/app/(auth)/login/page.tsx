"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { Eye, EyeOff, ChevronRight, Loader2, ArrowLeft } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setApiError(null);
    try {
      await login(data.email, data.password);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Login failed. Check your credentials.";
      setApiError(msg);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#081428] relative overflow-hidden">
      <div className="flex w-full md:w-[42%] shrink-0 relative items-center justify-center py-12 md:py-0 bg-[#0d1f3c] border-b-4 md:border-b-0 md:border-r-4 border-[#C9A84C] overflow-hidden">
        <div className="absolute -top-[15%] -left-[15%] w-[60%] h-[60%] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(90px)" }} />
        <div className="absolute -bottom-[15%] -right-[10%] w-[55%] h-[55%] rounded-full opacity-15 animate-pulse" style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(90px)" }} />

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
            src="/logo/osca-logo.png"
            alt="OSCA Crest"
            className="w-56 h-56 object-contain mb-8"
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
            Empowering student athletes and artists through excellence,
            discipline, and creativity.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative overflow-hidden py-10 px-6">
        <div className="absolute inset-0">
          <div className="absolute -top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(80px)" }} />
          <div className="absolute top-[30%] -right-[15%] w-[50vw] h-[50vw] rounded-full opacity-15 animate-pulse" style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(80px)" }} />
          <div className="absolute -bottom-[20%] left-[30%] w-[45vw] h-[45vw] rounded-full opacity-20 animate-pulse" style={{ background: "radial-gradient(circle, #f5d778, transparent 70%)", filter: "blur(80px)" }} />
        </div>

        <div className="relative z-10 w-full max-w-[460px]">
          <div className="bg-[#0f1d3a]/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3 px-8 pt-7 pb-6 border-b border-white/[0.06]">
              <div className="w-10 h-10 rounded-full bg-[#132a4d] border-2 border-[#C9A84C] overflow-hidden flex items-center justify-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/osca-logo.png" alt="OSCA Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">
                  OSCA Management System
                </h1>
                <p className="text-xs text-[#C9A84C] font-medium mt-0.5">
                  NAAP-Villamor · Sign In
                </p>
              </div>
            </div>

            <div className="px-8 pt-6 pb-8">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest mb-5">
                Account Credentials
              </h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-white/50 mb-2 uppercase tracking-widest">
                    Email Address
                  </label>
                  <input
                    {...register("email")}
                    type="email"
                    autoComplete="email"
                    placeholder="your.email@naap.edu.ph"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/50 focus:border-[#1d4ed8]/50 transition-all"
                  />
                  {errors.email && (
                    <p className="text-red-400 text-xs mt-1.5 pl-1">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/50 mb-2 uppercase tracking-widest">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      {...register("password")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#1d4ed8]/50 focus:border-[#1d4ed8]/50 transition-all pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-red-400 text-xs mt-1.5 pl-1">{errors.password.message}</p>
                  )}
                </div>

                {apiError && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {apiError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1d4ed8] to-[#0d1f3c] hover:from-[#2f5ce8] hover:to-[#132a4d] text-white font-semibold py-3.5 rounded-lg transition-all duration-300 disabled:opacity-40 active:scale-[0.98] text-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Signing in…
                    </>
                  ) : (
                    <>
                      Continue <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-white/40 mt-6">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-[#C9A84C] font-medium hover:text-[#e6cf8c] transition">
                  Create one
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[10px] text-white/15 mt-6">
            © 2026 OSCA — NAAP Campus
          </p>
        </div>
      </div>
    </div>
  );
}
