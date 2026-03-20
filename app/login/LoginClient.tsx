"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCountryCallingCode, getCountries } from "libphonenumber-js";
import PhoneInput from "./PhoneInput";

function getAccentClasses() {
  return {
    button: "bg-amber-500 hover:bg-amber-400 text-slate-900",
    ring: "focus:ring-amber-400/40",
  };
}

type OTPStep = "method" | "otp";
type LoginMode = "email" | "phone";

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const first = local.slice(0, 1);
  return `${first}***@${domain}`;
}

function maskPhone(e164: string): string {
  const normalized = normalizePhone(e164);
  const withPlus = normalized.startsWith("+");
  const digits = withPlus ? normalized.slice(1) : normalized;
  if (!digits) return e164.trim();
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const middle = digits.length > 4 ? "****" : "";
  const maskedDigits = `${head}${middle}${tail}`;
  return withPlus ? `+${maskedDigits}` : maskedDigits;
}

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

function iso2ToFlagEmoji(iso2: string): string {
  // Convert ISO-3166 alpha-2 -> regional indicator symbols.
  const upper = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A_CODE = "A".charCodeAt(0);
  const first = upper.charCodeAt(0) - A_CODE + 0x1f1e6;
  const second = upper.charCodeAt(1) - A_CODE + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

type CountryCallingInfo = { iso2: string; dialCode: string; dialDigits: string };

const DEFAULT_DIAL_CODE = "+66";

const ALL_COUNTRY_CALLING_CODES: CountryCallingInfo[] = (() => {
  const iso2s = getCountries();
  const list: CountryCallingInfo[] = [];
  for (const iso2 of iso2s) {
    try {
      const dialCodeNumber = getCountryCallingCode(iso2);
      if (!dialCodeNumber) continue;
      const dialDigits = String(dialCodeNumber);
      list.push({ iso2, dialCode: `+${dialDigits}`, dialDigits });
    } catch {
      // ignore invalid iso2
    }
  }
  return list;
})();

const DIAL_CODE_CANDIDATES_DESC = [...ALL_COUNTRY_CALLING_CODES].sort((a, b) => b.dialDigits.length - a.dialDigits.length);

const ISO2_BY_DIAL_CODE = new Map<string, string>();
for (const c of ALL_COUNTRY_CALLING_CODES) {
  if (!ISO2_BY_DIAL_CODE.has(c.dialCode)) {
    ISO2_BY_DIAL_CODE.set(c.dialCode, c.iso2);
  }
}

function parsePhoneHint(hintRaw: string): { dialCode: string; localNumber: string } {
  const hint = hintRaw.trim();
  if (!hint) return { dialCode: DEFAULT_DIAL_CODE, localNumber: "" };

  const normalized = normalizePhone(hint);
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;

  if (!digits) return { dialCode: DEFAULT_DIAL_CODE, localNumber: "" };

  for (const c of DIAL_CODE_CANDIDATES_DESC) {
    if (!c.dialDigits) continue;
    if (digits.startsWith(c.dialDigits)) {
      const localNumber = digits.slice(c.dialDigits.length);
      return { dialCode: c.dialCode, localNumber };
    }
  }

  // Fallback: keep default country code and treat the rest as local number.
  return { dialCode: DEFAULT_DIAL_CODE, localNumber: digits };
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return s.toString().padStart(2, "0");
}

function getLoginHintIdentifier(returnTo: string, searchParams: URLSearchParams): string {
  const direct = searchParams.get("login_hint");
  if (direct && direct.trim()) return decodeURIComponent(direct.trim());
  try {
    const url = new URL(returnTo, typeof window !== "undefined" ? window.location.origin : "https://localhost");
    const hint = url.searchParams.get("login_hint");
    return hint ? decodeURIComponent(hint.trim()) : "";
  } catch {
    return "";
  }
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/profile";
  const error = searchParams.get("error");

  const loginHintIdentifier = useMemo(
    () => getLoginHintIdentifier(returnTo, searchParams),
    [returnTo, searchParams]
  );
  const [otpStep, setOtpStep] = useState<OTPStep>("method");
  const [loginMode, setLoginMode] = useState<LoginMode>("email");
  const [email, setEmail] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>("+66");
  const [phoneCountryIso2, setPhoneCountryIso2] = useState<string>(ISO2_BY_DIAL_CODE.get("+66") ?? "TH");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [otp, setOtp] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const appliedLoginHint = useRef(false);

  const accent = useMemo(() => getAccentClasses(), []);
  const canResend = secondsLeft <= 0;

  const emailTrimmed = email.trim();
  const emailFormatError =
    emailTrimmed.length > 0 && !isValidEmail(emailTrimmed) ? "Invalid email format" : null;

  const phoneLocalDigits = phoneNumber.replace(/\D/g, "");
  const phoneCountryCodeTrimmed = phoneCountryCode.trim();
  const fullPhoneForValidation = phoneLocalDigits ? `${phoneCountryCodeTrimmed}${phoneLocalDigits}` : "";
  const phoneFormatError =
    phoneLocalDigits.length > 0 && !isValidPhone(fullPhoneForValidation)
      ? "Invalid phone format"
      : null;

  const countryDropdownRef = useRef<HTMLDivElement | null>(null);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  const regionNames = useMemo(() => {
    try {
      if (typeof Intl === "undefined" || !(Intl as any).DisplayNames) return null;
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  }, []);

  const phoneCountryOptions = useMemo(() => {
    return ALL_COUNTRY_CALLING_CODES.map((c) => ({
      iso2: c.iso2,
      dialDigits: c.dialDigits,
      dialCode: c.dialCode,
      name: regionNames?.of(c.iso2) ?? c.iso2,
      flag: iso2ToFlagEmoji(c.iso2),
    }));
  }, [regionNames]);

  const selectedCountryOption = useMemo(() => {
    return phoneCountryOptions.find((o) => o.iso2 === phoneCountryIso2) ?? phoneCountryOptions.find((o) => o.dialCode === phoneCountryCode) ?? phoneCountryOptions[0];
  }, [phoneCountryIso2, phoneCountryCode, phoneCountryOptions]);

  const filteredCountryOptions = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return phoneCountryOptions;
    return phoneCountryOptions.filter((o) => {
      const dial = o.dialCode.replace(/\D/g, "");
      return o.name.toLowerCase().includes(q) || dial.includes(q) || o.iso2.toLowerCase().includes(q) || o.dialCode.includes(q);
    });
  }, [countrySearch, phoneCountryOptions]);

  useEffect(() => {
    setCountryDropdownOpen(false);
    setCountrySearch("");
  }, [loginMode]);

  useEffect(() => {
    if (!countryDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = countryDropdownRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setCountryDropdownOpen(false);
        setCountrySearch("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [countryDropdownOpen]);

  useEffect(() => {
    if (!loginHintIdentifier || appliedLoginHint.current) return;
    const hint = loginHintIdentifier.trim();
    if (isValidEmail(hint)) {
      setLoginMode("email");
      setEmail(hint);
    } else if (isValidPhone(hint)) {
      setLoginMode("phone");
      const parsed = parsePhoneHint(hint);
      setPhoneCountryCode(parsed.dialCode);
      setPhoneCountryIso2(ISO2_BY_DIAL_CODE.get(parsed.dialCode) ?? (ISO2_BY_DIAL_CODE.get("+66") ?? "TH"));
      setPhoneNumber(parsed.localNumber);
    }
    appliedLoginHint.current = true;
  }, [loginHintIdentifier]);

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
    const phoneLocalDigits = phoneNumber.replace(/\D/g, "");
    const fullPhone = phoneLocalDigits ? `${phoneCountryCode}${phoneLocalDigits}` : "";

    const identifier =
      loginMode === "email"
        ? normalizedEmail
        : fullPhone;

    if (loginMode === "email") {
      if (!identifier || !isValidEmail(identifier)) {
        setFormError(emailFormatError ?? "Please enter a valid email");
        return;
      }
    } else {
      if (!identifier || !isValidPhone(identifier)) {
        setFormError(phoneFormatError ?? "Please enter a valid phone number");
        return;
      }
    }

    setSendLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      const rawText = await res.text().catch(() => "");
      let data: { success?: boolean; error?: string; debugOtp?: string; destinationEmail?: string } = {};
      try {
        data = JSON.parse(rawText) as {
          success?: boolean;
          error?: string;
          debugOtp?: string;
          destinationEmail?: string;
        };
      } catch {
        // ignore - rawText might be an HTML error page
      }

      if (!res.ok || !data.success) {
        const fallback = rawText
          ? rawText.replace(/\s+/g, " ").slice(0, 220)
          : `HTTP ${res.status} ${res.statusText}`;
        throw new Error(data.error ?? fallback ?? "Failed to send OTP");
      }

      setOtpStep("otp");
      setOtp("");
      const destinationEmail =
        typeof data.destinationEmail === "string"
          ? data.destinationEmail
          : loginMode === "email"
            ? identifier
            : "";
      if (loginMode === "phone") {
        const maskedPhone = maskPhone(fullPhone || identifier);
        setMaskedEmail(maskedPhone);
      } else {
        setMaskedEmail(destinationEmail ? maskEmail(destinationEmail) : null);
      }
      setSecondsLeft(60);
      setDebugOtp(typeof data.debugOtp === "string" ? data.debugOtp : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send OTP";
      setFormError(message);
    } finally {
      setSendLoading(false);
    }
  }

  async function verifyOtp() {
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
        body: JSON.stringify({ otp: otp.trim(), returnTo }),
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
        throw new Error(data.error ?? fallback ?? "Invalid OTP");
      }

      const redirectUrl = data.redirectUrl ?? "/profile";
      // Full page navigation so server 302 (e.g. OIDC → Shopify callback) is followed
      if (redirectUrl.startsWith("/api/") || redirectUrl.startsWith("http")) {
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
              We'll send a one-time code to your account to securely access your profile.
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

          <div className="mt-4">
            {/* OTP step: method */}
            <div
              className={`transition-all duration-300 ${
                otpStep === "method" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none h-0 overflow-hidden"
              }`}
            >
              {loginMode === "email" ? (
                <div>
                  <label className="block text-sm text-slate-200 mb-2 font-medium" htmlFor="otp-email">
                    Email
                  </label>
                  <input
                    id="otp-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
                  />
                  {emailFormatError ? <div className="mt-2 text-xs text-red-300">{emailFormatError}</div> : null}

                  <div className="mt-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode("phone");
                        setOtpStep("method");
                        setOtp("");
                        setMaskedEmail(null);
                        setDebugOtp(null);
                        setFormError(null);
                        setSecondsLeft(0);
                      }}
                      className="text-sm font-medium underline text-amber-300 hover:text-amber-200 transition"
                    >
                      Login by phone
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-slate-200 mb-2 font-medium" htmlFor="otp-phone-local">
                    Phone
                  </label>
                  <PhoneInput
                    phoneCountryCode={phoneCountryCode}
                    phoneCountryIso2={phoneCountryIso2}
                    phoneLocalNumber={phoneNumber}
                    onChange={(next) => {
                      setPhoneCountryIso2(next.phoneCountryIso2);
                      setPhoneCountryCode(next.phoneCountryCode);
                      setPhoneNumber(next.phoneLocalNumber);
                      setFormError(null);
                    }}
                  />
                  {phoneFormatError ? <div className="mt-2 text-xs text-red-300">{phoneFormatError}</div> : null}

                  <div className="mt-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMode("email");
                        setOtpStep("method");
                        setOtp("");
                        setMaskedEmail(null);
                        setDebugOtp(null);
                        setFormError(null);
                        setSecondsLeft(0);
                      }}
                      className="text-sm font-medium underline text-amber-300 hover:text-amber-200 transition"
                    >
                      Login by email
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={sendOtp}
                disabled={sendLoading}
                className={`mt-3 w-full rounded-xl ${accent.button} font-semibold py-3 px-4 flex items-center justify-center transition disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {sendLoading ? "Sending OTP..." : "Get OTP"}
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
                Sent code to{" "}
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
                {verifyLoading ? "Verifying..." : "Sign in"}
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
                  {canResend ? "Resend code" : `Resend in ${formatSeconds(secondsLeft)} sec`}
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
        </div>
      </div>
    </main>
  );
}

