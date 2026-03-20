"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PhoneInput, { isValidPhoneE164, parsePhoneE164ToParts } from "../login/PhoneInput";

type VerifiedType = "email" | "phone";

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  return trimmed.replace(/\D/g, "");
}

function isValidPhone(rawPhone: string): boolean {
  const normalized = normalizePhone(rawPhone);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  return /^\d{8,15}$/.test(digits);
}

function maskPhone(e164Like: string): string {
  const normalized = normalizePhone(e164Like);
  const withPlus = normalized.startsWith("+");
  const digits = withPlus ? normalized.slice(1) : normalized;
  if (!digits) return e164Like.trim();
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const middle = digits.length > 4 ? "****" : "";
  const maskedDigits = `${head}${middle}${tail}`;
  return withPlus ? `+${maskedDigits}` : maskedDigits;
}

export default function RegistrationClient(props: {
  verifiedType: VerifiedType;
  lockedEmail: string;
  lockedPhone: string;
  returnTo: string;
}) {
  const router = useRouter();

  const nextType = props.verifiedType === "email" ? "phone" : "email";
  const [step, setStep] = useState<"info" | "otp">("info");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(props.verifiedType === "phone" ? "" : props.lockedEmail);
  const initialPhoneParts = useMemo(() => {
    return props.verifiedType === "phone" ? parsePhoneE164ToParts(props.lockedPhone) : parsePhoneE164ToParts("");
  }, [props.lockedPhone, props.verifiedType]);

  const [phoneCountryCode, setPhoneCountryCode] = useState<string>(initialPhoneParts.phoneCountryCode);
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<string>(initialPhoneParts.phoneCountryIso2);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState<string>(initialPhoneParts.phoneLocalNumber);

  const [otp, setOtp] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const canResend = secondsLeft <= 0;

  const [formError, setFormError] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const lockedEmail = useMemo(() => props.lockedEmail, [props.lockedEmail]);
  const lockedPhone = useMemo(() => props.lockedPhone, [props.lockedPhone]);

  async function sendAdditionalOtp() {
    setFormError(null);
    setDebugOtp(null);
    setSendLoading(true);

    try {
      // Validate names
      if (!firstName.trim() || !lastName.trim()) {
        setFormError("Please enter your first name and last name.");
        return;
      }

      if (nextType === "email") {
        const normalized = email.trim();
        if (!isValidEmail(normalized)) {
          setFormError("Please enter a valid email.");
          return;
        }

        const res = await fetch("/api/auth/registration/otp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, email: normalized }),
        });

        const rawText = await res.text().catch(() => "");
        let data: { success?: boolean; debugOtp?: string; error?: string } = {};
        try {
          data = JSON.parse(rawText) as typeof data;
        } catch {
          // ignore
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `Failed to send OTP (HTTP ${res.status})`);
        }

        setDebugOtp(typeof data.debugOtp === "string" ? data.debugOtp : null);
        setStep("otp");
        setOtp("");
        setSecondsLeft(60);
        return;
      }

      // nextType === "phone"
      const fullPhoneE164 = phoneLocalNumber ? `${phoneCountryCode}${phoneLocalNumber}` : "";
      if (!fullPhoneE164 || !isValidPhoneE164(fullPhoneE164)) {
        setFormError("Please enter a valid phone number.");
        return;
      }

      const res = await fetch("/api/auth/registration/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone: fullPhoneE164 }),
      });

      const rawText = await res.text().catch(() => "");
      let data: { success?: boolean; debugOtp?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText) as typeof data;
      } catch {
        // ignore
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `Failed to send OTP (HTTP ${res.status})`);
      }

      setDebugOtp(typeof data.debugOtp === "string" ? data.debugOtp : null);
      setStep("otp");
      setOtp("");
      setSecondsLeft(60);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send OTP.";
      setFormError(message);
    } finally {
      setSendLoading(false);
    }
  }

  async function verifyAdditionalOtp() {
    setFormError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setFormError("OTP must be a 6-digit number");
      return;
    }

    setVerifyLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim(), returnTo: props.returnTo }),
      });

      const rawText = await res.text().catch(() => "");
      let data: { success?: boolean; redirectUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText) as typeof data;
      } catch {
        // ignore
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? `Invalid OTP (HTTP ${res.status})`);
      }

      const redirectUrlRaw = typeof data.redirectUrl === "string" ? data.redirectUrl : "/profile";
      const redirectUrl = redirectUrlRaw.trim();
      // Always use full navigation for API routes to avoid Next trying to render them as pages.
      if (redirectUrl.startsWith("/api/") || redirectUrl.startsWith("http://") || redirectUrl.startsWith("https://")) {
        window.location.href = redirectUrl;
      } else {
        router.push(redirectUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid OTP";
      setFormError(message);
    } finally {
      setVerifyLoading(false);
    }
  }

  useEffect(() => {
    if (step !== "otp") return;
    if (secondsLeft <= 0) return;
    const t = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [secondsLeft, step]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0e17]" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-[#0a0e17] to-amber-950/20" />
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(ellipse_at_50%_50%,_var(--tw-gradient-stops))] from-amber-400 via-transparent to-transparent" />

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl shadow-black/30 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_22px_rgba(245,158,11,0.55)]" />
              <span className="font-semibold text-white tracking-tight">Shopify OTP Registration</span>
            </div>
            <h1 className="mt-4 font-semibold text-white text-2xl">Finish sign up</h1>
            <p className="mt-2 text-slate-400 text-sm">
              {props.verifiedType === "email"
                ? "We verified your email. Add your phone to continue."
                : "We verified your phone. Add your email to continue."}
            </p>
          </div>

          {formError ? (
            <div
              role="alert"
              className="rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 mb-5"
            >
              {formError}
            </div>
          ) : null}

          {step === "info" ? (
            <div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-200 mb-2 font-medium">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
                    placeholder="Jane"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-200 mb-2 font-medium">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
                    placeholder="Doe"
                  />
                </div>

                {props.verifiedType === "email" ? (
                  <>
                    <div>
                      <label className="block text-sm text-slate-200 mb-2 font-medium">Email (verified)</label>
                      <input
                        value={lockedEmail}
                        readOnly
                        className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-300 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-200 mb-2 font-medium">Phone</label>
                      <PhoneInput
                        phoneCountryCode={phoneCountryCode}
                        phoneCountryIso2={phoneCountryIso2}
                        phoneLocalNumber={phoneLocalNumber}
                        onChange={(next) => {
                          setPhoneCountryCode(next.phoneCountryCode);
                          setPhoneCountryIso2(next.phoneCountryIso2);
                          setPhoneLocalNumber(next.phoneLocalNumber);
                          setFormError(null);
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm text-slate-200 mb-2 font-medium">Phone (verified)</label>
                      <PhoneInput
                        phoneCountryCode={phoneCountryCode}
                        phoneCountryIso2={phoneCountryIso2}
                        phoneLocalNumber={phoneLocalNumber}
                        onChange={() => {
                          // no-op when disabled
                        }}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-200 mb-2 font-medium">Email</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="name@example.com"
                        inputMode="email"
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={sendAdditionalOtp}
                disabled={sendLoading}
                className="mt-5 w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-3 px-4 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendLoading ? "Sending OTP..." : "Send OTP"}
              </button>
            </div>
          ) : (
            <div>
              <div className="text-sm text-slate-400 mb-2">
                Enter the 6-digit code sent to{" "}
                <span className="text-slate-200 font-medium">
                  {nextType === "email" ? email.trim() : phoneLocalNumber ? `${phoneCountryCode}${phoneLocalNumber}` : "your phone"}
                </span>
              </div>

              {debugOtp ? (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="text-xs text-amber-200 mb-1">Debug OTP</div>
                  <div className="font-mono tracking-[0.35em] text-2xl text-amber-300">{debugOtp}</div>
                </div>
              ) : null}

              <label className="block text-sm text-slate-200 mb-2 font-medium">OTP</label>
              <input
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
                onClick={verifyAdditionalOtp}
                disabled={verifyLoading}
                className="mt-3 w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-3 px-4 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {verifyLoading ? "Verifying..." : "Create & Sign in"}
              </button>

              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={!canResend || sendLoading}
                  onClick={sendAdditionalOtp}
                  className={`text-sm font-medium underline transition ${
                    canResend ? "text-amber-300 hover:text-amber-200" : "text-slate-500 cursor-not-allowed decoration-slate-600"
                  }`}
                >
                  {canResend ? "Resend code" : `Resend in ${secondsLeft} sec`}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-xs text-slate-400">
            By continuing, you agree to Shopify authentication flow.
          </div>
        </div>
      </div>
    </main>
  );
}

