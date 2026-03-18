import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await unsealSession(cookieValue);

  if (!session?.isLoggedIn) {
    const returnTo = request.nextUrl.pathname;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile", "/profile/:path*"],
};
