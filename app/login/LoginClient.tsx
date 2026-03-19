"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function getAccentClasses() {
  return {
    button: "bg-amber-500 hover:bg-amber-400 text-slate-900",
    ring: "focus:ring-amber-400/40",
  };
}

type OTPStep = "email" | "otp";

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const first = local.slice(0, 1);
  return `${first}***@${domain}`;
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s.toString().padStart(2, "0");
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/profile";
  const error = searchParams.get("error");

  const [redirecting, setRedirecting] = useState(false);
  const [otpStep, setOtpStep] = useState<OTPStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(0);

  const accent = useMemo(() => getAccentClasses(), []);

  function onLogin() {
    setRedirecting(true);
    const url = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
  }

  const canResend = secondsLeft <= 0;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft]);

  async function sendOtp() {
    setFormError(null);
    setDebugOtp(null);

    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFormError("กรุณากรอกอีเมลให้ถูกต้อง");
      return;
    }

    setSendLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const rawText = await res.text().catch(() => "");
      let data: { success?: boolean; error?: string; debugOtp?: string } = {};
      try {
        data = JSON.parse(rawText) as { success?: boolean; error?: string; debugOtp?: string };
      } catch {
        // ignore - rawText might be an HTML error page
      }

      if (!res.ok || !data.success) {
        const fallback = rawText
          ? rawText.replace(/\s+/g, " ").slice(0, 220)
          : `HTTP ${res.status} ${res.statusText}`;
        throw new Error(data.error ?? fallback ?? "ส่ง OTP ไม่สำเร็จ");
      }

      setOtpStep("otp");
      setOtp("");
      setMaskedEmail(maskEmail(normalizedEmail));
      setSecondsLeft(60);
      setDebugOtp(typeof data.debugOtp === "string" ? data.debugOtp : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "ส่ง OTP ไม่สำเร็จ";
      setFormError(message);
    } finally {
      setSendLoading(false);
    }
  }

  async function verifyOtp() {
    setFormError(null);
    const normalizedEmail = email.trim();

    if (!/^\d{6}$/.test(otp.trim())) {
      setFormError("OTP ต้องเป็นตัวเลข 6 หลัก");
      return;
    }

    setVerifyLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, otp: otp.trim() }),
      });

      const rawText = await res.text().catch(() => "");
      let data: { success?: boolean; redirectUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText) as { success?: boolean; redirectUrl?: string; error?: string };
      } catch {
        // ignore - rawText might be an HTML error page
      }

      if (!res.ok || !data.success) {
        const fallback = rawText
          ? rawText.replace(/\s+/g, " ").slice(0, 220)
          : `HTTP ${res.status} ${res.statusText}`;
        throw new Error(data.error ?? fallback ?? "รหัส OTP ไม่ถูกต้อง");
      }

      const redirectUrl = data.redirectUrl ?? "/profile";
      if (redirectUrl.startsWith("/api/auth/login")) {
        window.location.href = redirectUrl;
      } else {
        router.push(redirectUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "รหัส OTP ไม่ถูกต้อง";
      setFormError(message);
    } finally {
      setVerifyLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0e17]" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-[#0a0e17] to-amber-950/20" />
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(ellipse_at_50%_50%,_var(--tw-gradient-stops))] from-amber-400 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')] opacity-40" />

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/30 p-8">
            <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_22px_rgba(245,158,11,0.55)]" />
              <span className="font-display font-semibold text-white tracking-tight">
                  Shopify OTP Login
              </span>
            </div>
            <h1 className="font-display text-3xl font-semibold text-white tracking-tight mt-4">
              Sign in
            </h1>
            <p className="mt-2 text-slate-400 font-sans text-sm">
              We’ll send a one-time code to your email to securely access your profile.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 mb-5"
            >
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onLogin}
            disabled={redirecting}
            className={`w-full rounded-xl ${accent.button} font-semibold py-3 px-4 flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed ${accent.ring} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0e17]`}
          >
            {redirecting ? (
              <>
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Redirecting…
              </>
            ) : (
              "Login with Shopify"
            )}
          </button>

          <div className="mt-6 flex items-center gap-3 text-center text-xs text-slate-400">
            <div className="flex-1 h-px bg-white/10" />
            <span>หรือ</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="mt-4">
            {/* OTP step: email */}
            <div
              className={`transition-all duration-300 ${
                otpStep === "email" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden"
              }`}
            >
              <label className="block text-sm text-slate-200 mb-2 font-medium" htmlFor="otp-email">
                Email
              </label>
              <input
                id="otp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
              />

              <button
                type="button"
                onClick={sendOtp}
                disabled={sendLoading}
                className={`mt-3 w-full rounded-xl ${accent.button} font-semibold py-3 px-4 flex items-center justify-center transition disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {sendLoading ? "กำลังส่งรหัส..." : "รับรหัส OTP"}
              </button>

              {formError ? (
                <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3">
                  {formError}
                </div>
              ) : null}
            </div>

            {/* OTP step: otp */}
            <div
              className={`transition-all duration-300 ${
                otpStep === "otp" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden"
              }`}
            >
              <div className="text-sm text-slate-400 mb-2">
                ส่งรหัสไปที่{" "}
                <span className="text-slate-200 font-medium">{maskedEmail ?? "your email"}</span>
              </div>

              {debugOtp ? (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="text-xs text-amber-200 mb-1">Debug OTP</div>
                  <div className="font-mono tracking-[0.35em] text-2xl text-amber-300">
                    {debugOtp}
                  </div>
                </div>
              ) : null}

              <label className="block text-sm text-slate-200 mb-2 font-medium" htmlFor="otp-code">
                OTP
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30 tracking-[0.3em] text-center"
              />

              <button
                type="button"
                onClick={verifyOtp}
                disabled={verifyLoading}
                className={`mt-3 w-full rounded-xl ${accent.button} font-semibold py-3 px-4 flex items-center justify-center transition disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {verifyLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
              </button>

              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={!canResend}
                  onClick={sendOtp}
                  className={`text-sm font-medium underline transition ${
                    canResend ? "text-amber-300 hover:text-amber-200" : "text-slate-500 cursor-not-allowed decoration-slate-600"
                  }`}
                >
                  {canResend ? "ส่งรหัสใหม่" : `ส่งรหัสใหม่ใน ${formatSeconds(secondsLeft)} วิ`}
                </button>
              </div>

              {formError ? (
                <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3">
                  {formError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            By continuing, you agree to Shopify’s authentication flow.
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push("/profile")}
              className="text-sm text-slate-400 hover:text-slate-200 transition"
            >
              Go to profile
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

