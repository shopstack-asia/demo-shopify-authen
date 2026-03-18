import { Suspense } from "react";
import LoginClient from "./LoginClient";

function LoginSkeleton() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e17]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 animate-pulse" />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginClient />
    </Suspense>
  );
}

