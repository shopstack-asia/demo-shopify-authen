import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  discoverAuthEndpoints,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
  getRedirectUri,
} from "@/lib/shopify-auth";

function redirectToLoginWithError(request: NextRequest, errorMessage: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl;
  const loginUrl = new URL("/login", base);
  loginUrl.searchParams.set("error", errorMessage);
  return NextResponse.redirect(loginUrl);
}

function sanitizeReturnTo(input: unknown): string {
  const value = typeof input === "string" ? input : "";
  if (!value) return "/profile";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/profile";
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  // Always treat this as the start of an OAuth flow (not yet logged in).
  session.isLoggedIn = false;
  session.accessToken = "";
  session.refreshToken = "";
  session.idToken = "";
  session.customerId = "";
  session.codeVerifier = "";
  session.nonce = "";
  session.state = "";

  try {
    const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("returnTo"));

    const originHeader = request.headers.get("origin");
    const refererHeader = request.headers.get("referer");
    let origin = "";
    if (originHeader && typeof originHeader === "string" && originHeader.trim()) {
      origin = originHeader.trim();
    } else if (refererHeader) {
      try {
        origin = new URL(refererHeader).origin;
      } catch {
        // ignore
      }
    }
    if (!origin) {
      origin = process.env.NEXT_PUBLIC_APP_URL ?? request.url;
    }

    // Store absolute return URL so we never redirect across hosts.
    const absoluteReturnTo = `${origin}${returnTo}`;
    const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
    const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");

    if (!storeDomain) {
      return redirectToLoginWithError(request, "Missing SHOPIFY_STORE_DOMAIN");
    }

    const endpoints = await discoverAuthEndpoints(storeDomain);

    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const nonce = generateNonce();

    session.codeVerifier = codeVerifier;
    session.state = state;
    session.nonce = nonce;
    session.returnTo = absoluteReturnTo;
    await session.save();

    // Use NEXT_PUBLIC_APP_URL as the source of truth for redirect_uri.
    // This must exactly match what you configured in Shopify.
    const redirectUri = getRedirectUri();
    const authorizationUrl = new URL(endpoints.authorization_endpoint);

    const clientId = (process.env.SHOPIFY_CLIENT_ID ?? "").trim();
    if (!clientId) {
      return redirectToLoginWithError(request, "Missing SHOPIFY_CLIENT_ID");
    }

    authorizationUrl.searchParams.set("scope", "openid email customer-account-api:full");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    return NextResponse.redirect(authorizationUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed.";
    return redirectToLoginWithError(request, message);
  }
}
