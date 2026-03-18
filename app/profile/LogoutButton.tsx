"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const json = await res.json();
      const redirectUrl = json.data?.redirectUrl ?? "/login";
      router.push(redirectUrl);
    } catch {
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition disabled:opacity-60"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
