import { Suspense } from "react";
import LoginClient from "./LoginClient";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, LOGIN_PAGE_INTERNAL_COOKIE_NAME } from "@/lib/session";

function LoginSkeleton() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e17]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 animate-pulse" />
    </main>
  );
}

export default async function LoginPage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect("/profile");
  }

  const cookieStore = cookies();
  const internalCookie = cookieStore.get(LOGIN_PAGE_INTERNAL_COOKIE_NAME)?.value === "1";

  const referer = headers().get("referer") ?? "";
  const refererOrigin = (() => {
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  })();

  const shopifyStoreDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
  const shopifyStoreDomain = shopifyStoreDomainRaw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  const shopifyOrigins = shopifyStoreDomain ? [`https://${shopifyStoreDomain}`] : [];

  // Allow if:
  // - user was redirected from Shopify/iDP (referer matches shopify store origin), OR
  // - our own server-side redirects set a short-lived internal cookie.
  const isAllowed = internalCookie || (refererOrigin && shopifyOrigins.includes(refererOrigin));

  if (!isAllowed) {
    // Keep it simple: show a minimal access denied page (no redirect loop).
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#0a0e17] text-slate-200">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl shadow-black/30">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Access denied</h1>
          <p className="mt-2 text-sm text-slate-400">
            Login page can only be accessed when redirected from the identity provider.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            If you are trying to test locally, visit the app routes that initiate the login flow.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginClient />
    </Suspense>
  );
}

