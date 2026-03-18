import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const storeUrl = process.env.SHOPIFY_STORE_DOMAIN
    ? `https://${process.env.SHOPIFY_STORE_DOMAIN}`.replace(/\/$/, "")
    : "";
  const recoverPasswordUrl = storeUrl
    ? `${storeUrl.replace(/\/$/, "")}/account/recover`
    : undefined;
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm recoverPasswordUrl={recoverPasswordUrl} />
    </Suspense>
  );
}

function LoginFormSkeleton() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e17]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 animate-pulse">
        <div className="h-8 bg-white/10 rounded w-1/2 mx-auto mb-6" />
        <div className="h-4 bg-white/10 rounded w-2/3 mx-auto mb-8" />
        <div className="space-y-5">
          <div className="h-12 bg-white/10 rounded-xl" />
          <div className="h-12 bg-white/10 rounded-xl" />
          <div className="h-12 bg-amber-500/30 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
