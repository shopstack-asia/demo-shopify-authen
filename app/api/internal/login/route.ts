import { NextRequest, NextResponse } from "next/server";
import { LOGIN_PAGE_INTERNAL_COOKIE_NAME } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const params = request.nextUrl.searchParams;
  const query = params.toString();
  if (query) loginUrl.search = query;

  const res = NextResponse.redirect(loginUrl.toString(), 302);
  res.cookies.set(LOGIN_PAGE_INTERNAL_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 5, // 5 minutes
    path: "/",
  });
  return res;
}

