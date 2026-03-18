import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  customerId: string;
  customerAccessToken: string;
  email: string;
  isLoggedIn: boolean;
}

const defaultSession: SessionData = {
  customerId: "",
  customerAccessToken: "",
  email: "",
  isLoggedIn: false,
};

const DEV_FALLBACK_PASSWORD = "fallback-min-32-chars-for-dev-only";
const sessionOptions: SessionOptions = {
  password:
    typeof process.env.SESSION_SECRET === "string" &&
    process.env.SESSION_SECRET.trim().length >= 32
      ? process.env.SESSION_SECRET.trim()
      : DEV_FALLBACK_PASSWORD,
  cookieName: "shopify_custom_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Get iron-session for the current request. Use in Route Handlers or Server Components.
 * When you call session.save(), the cookie is written via next/headers cookies().
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Unseal session from cookie string (e.g. in middleware where we only have cookie value).
 */
export async function unsealSession(cookieValue: string | undefined): Promise<SessionData | null> {
  if (!cookieValue) return null;
  const { unsealData } = await import("iron-session");
  try {
    const data = await unsealData<SessionData>(cookieValue, {
      password: sessionOptions.password,
    });
    return data && data.isLoggedIn ? data : null;
  } catch {
    return null;
  }
}

export { defaultSession, sessionOptions };
export const SESSION_COOKIE_NAME = sessionOptions.cookieName;
