"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function getAccentClasses() {
  return {
    button: "bg-amber-500 hover:bg-amber-400 text-slate-900",
    ring: "focus:ring-amber-400/40",
  };
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/profile";
  const error = searchParams.get("error");

  const [redirecting, setRedirecting] = useState(false);

  const accent = useMemo(() => getAccentClasses(), []);

  function onLogin() {
    setRedirecting(true);
    const url = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
    window.location.href = url;
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

