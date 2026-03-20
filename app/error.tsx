"use client";

import { useMemo } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = useMemo(() => {
    return error?.message ? String(error.message) : "Something went wrong.";
  }, [error?.message]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[#0a0e17] text-slate-200">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl shadow-black/30">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">{message}</p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2.5 transition"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}

