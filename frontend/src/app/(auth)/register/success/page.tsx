"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function RegistrationSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#081428]">
      <div className="absolute inset-0">
        <div
          className="absolute -top-[40%] -left-[20%] w-[70vw] h-[70vw] rounded-full opacity-20 animate-pulse"
          style={{ background: "radial-gradient(circle, #1d4ed8, transparent 70%)", filter: "blur(80px)" }}
        />
        <div
          className="absolute top-[30%] -right-[15%] w-[50vw] h-[50vw] rounded-full opacity-15 animate-pulse"
          style={{ background: "radial-gradient(circle, #C9A84C, transparent 70%)", filter: "blur(80px)" }}
        />
      </div>

      <div className="relative z-10 bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl p-10 w-full max-w-md text-center shadow-[0_8px_60px_rgba(0,0,0,0.4)]">
        <CheckCircle2 size={52} className="text-amber-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Registration Complete</h2>
        <p className="text-sm text-white/70 mb-2">
          Your account has been created and is now{" "}
          <span className="text-amber-400 font-semibold">pending approval</span>.
        </p>
        <p className="text-xs text-white/40 mb-6">
          You will be able to sign in once an administrator activates your account.
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
