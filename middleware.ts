import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOGIN_PAGE_INTERNAL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Avoid decrypting cookies in middleware (Edge can differ from Node).
  // If the cookie is missing, block; if the cookie exists, let the server component
  // validate the session (it decrypts in Node).
  if (!cookieValue) {
    const returnTo = request.nextUrl.pathname;
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", returnTo);
    loginUrl.searchParams.set("error", "missing_session_cookie");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set(LOGIN_PAGE_INTERNAL_COOKIE_NAME, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5, // 5 minutes
      path: "/",
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile", "/profile/:path*"],
};
