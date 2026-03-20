import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  accessToken: string; // shcat_
  refreshToken: string;
  idToken: string;
  customerId: string; // from id_token sub
  nonce: string;
  state: string;
  codeVerifier: string; // cleared after exchange
  returnTo: string;
  isLoggedIn: boolean;

  // Custom email OTP login (Admin API + Resend)
  email?: string; // customer email after successful OTP verify
  otpEmail?: string; // email used to request OTP
  otpCode?: string; // SHA256 hash (hex) of OTP code
  otpExpiry?: number; // unix ms timestamp
}

const defaultSession: SessionData = {
  accessToken: "",
  refreshToken: "",
  idToken: "",
  customerId: "",
  nonce: "",
  state: "",
  codeVerifier: "",
  returnTo: "",
  isLoggedIn: false,
};

const DEV_FALLBACK_PASSWORD = "fallback-min-32-chars-for-dev-only";
const sessionOptions: SessionOptions = {
  password:
    typeof process.env.SESSION_SECRET === "string" &&
    process.env.SESSION_SECRET.trim().length >= 32
      ? process.env.SESSION_SECRET.trim()
      : DEV_FALLBACK_PASSWORD,
  cookieName: "shopify_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
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

// Used to allow internal redirects to `/login` without relying on referer headers.
// When users try to open `/login` directly, this cookie won't be present and the page will be blocked.
export const LOGIN_PAGE_INTERNAL_COOKIE_NAME = "login_page_internal";
