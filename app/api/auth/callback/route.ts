import { NextRequest, NextResponse } from "next/server";
import { getSession, LOGIN_PAGE_INTERNAL_COOKIE_NAME } from "@/lib/session";
import {
  decodeJwtNonce,
  decodeJwtSub,
  exchangeCodeForTokens,
  formatAccessToken,
  discoverAuthEndpoints,
  getRedirectUri,
  getRequestOriginFromHeaders,
} from "@/lib/shopify-auth";

function redirectToLoginWithError(request: NextRequest, errorMessage: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const loginUrl = new URL("/login", base);
  loginUrl.searchParams.set("error", errorMessage);
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

function sanitizeReturnTo(input: unknown): string {
  const value = typeof input === "string" ? input : "";
  if (!value) return "/profile";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/profile";
}

function redirectToReturnTo(request: NextRequest, returnTo: string) {
  const value = returnTo || "/profile";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return NextResponse.redirect(value);
  }
  // Use forwarded origin so ngrok host doesn't get replaced by internal localhost.
  const origin = getRequestOriginFromHeaders(request.headers);
  return NextResponse.redirect(new URL(value, origin));
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const stateParam = url.searchParams.get("state") ?? "";

  if (!code) {
    return redirectToLoginWithError(request, "Missing code");
  }

  if (!stateParam) {
    return redirectToLoginWithError(request, "Missing state");
  }
  if (!session.state) {
    return redirectToLoginWithError(request, "Missing session.state");
  }
  if (stateParam !== session.state) {
    return redirectToLoginWithError(request, "State mismatch");
  }

  try {
    const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
    const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
    if (!storeDomain) throw new Error("Missing SHOPIFY_STORE_DOMAIN");

    const endpoints = await discoverAuthEndpoints(storeDomain);

    if (!session.codeVerifier) {
      return redirectToLoginWithError(request, "Missing PKCE verifier");
    }

    const redirectUri = getRedirectUri();
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: session.codeVerifier,
      tokenEndpoint: endpoints.token_endpoint,
      redirectUri,
    });

    const accessToken = formatAccessToken(tokens.access_token);

    const idTokenNonce = decodeJwtNonce(tokens.id_token);
    if (session.nonce && idTokenNonce && idTokenNonce !== session.nonce) {
      return redirectToLoginWithError(request, "Invalid nonce");
    }

    const customerId = decodeJwtSub(tokens.id_token);

    session.accessToken = accessToken;
    session.refreshToken = tokens.refresh_token;
    session.idToken = tokens.id_token;
    session.customerId = customerId;
    session.isLoggedIn = true;

    // Clear one-time fields
    session.codeVerifier = "";
    session.state = "";
    session.nonce = "";

    await session.save();

    const returnTo = sanitizeReturnTo(session.returnTo);
    return redirectToReturnTo(request, returnTo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Callback failed.";
    // Keep user on login with error message.
    return redirectToLoginWithError(request, message);
  }
}

