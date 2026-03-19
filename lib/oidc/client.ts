import { getSession } from "@/lib/session";
import { getCustomerProfileFromAdmin } from "@/lib/shopify-admin";
import type { NextRequest } from "next/server";

export type OidcCurrentUser = {
  sub: string; // user_id
  email: string; // user@email.com
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export function getOidcIssuer(): string {
  // Prefer OIDC_ISSUER, but fall back to NEXT_PUBLIC_APP_URL for local/dev.
  const issuer = process.env.OIDC_ISSUER?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!issuer) {
    throw new Error("Missing OIDC_ISSUER (or NEXT_PUBLIC_APP_URL fallback).");
  }
  return issuer.replace(/\/+$/g, "");
}

export function getOidcClientId(): string {
  return requireEnv("OIDC_CLIENT_ID");
}

export function getOidcClientSecret(): string {
  return requireEnv("OIDC_CLIENT_SECRET");
}

function parseBase64UrlToString(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function tryExtractEmailFromJwtPayload(idToken: string): string | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payloadJson = parseBase64UrlToString(parts[1]);
    if (!payloadJson) return null;
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;

    const candidates = [
      payload.email,
      payload.email_address,
      payload.emailAddress,
      payload.preferred_username,
      payload.upn,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) return c.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect current user from the existing `iron-session` cookie.
 * This is the only place we touch the existing auth state.
 */
export async function getCurrentUser(_request: Request | NextRequest): Promise<OidcCurrentUser | null> {
  // Note: we ignore the request, but keep the signature so callsites look like getCurrentUser(request).
  // Session is derived from the cookie that Next provides on the server.
  const session = await getSession();
  if (!session.isLoggedIn) return null;
  if (!session.customerId) return null;

  const sub = session.customerId;

  const fromSession = typeof session.email === "string" ? session.email.trim() : "";
  if (fromSession) {
    return { sub, email: fromSession };
  }

  if (session.idToken) {
    const fromIdToken = tryExtractEmailFromJwtPayload(session.idToken);
    if (fromIdToken) return { sub, email: fromIdToken };
  }

  // Fallback: fetch email from Shopify Admin by customer id.
  // This keeps the OIDC layer independent from the Shopify ID token claim shape.
  const profile = await getCustomerProfileFromAdmin(sub);
  const email = profile.customer?.emailAddress?.emailAddress ?? "";
  if (!email) return null;
  return { sub, email };
}

function isDefaultPort(url: URL): boolean {
  return (url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80") || url.port === "";
}

function normalizeForMatch(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (url.hash) return null; // forbid fragments for strictness
    const pathname = url.pathname !== "/" ? url.pathname.replace(/\/+$/g, "") : url.pathname;
    const portPart = url.port && !isDefaultPort(url) ? `:${url.port}` : "";
    const origin = `${url.protocol}//${url.hostname}${portPart}`;
    const search = url.searchParams.toString();
    return search ? `${origin}${pathname}?${search}` : `${origin}${pathname}`;
  } catch {
    return null;
  }
}

function getAllowedRedirectUrisEnv(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw || typeof raw !== "string") return null;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

/**
 * Strictly validate redirect_uri against either:
 * - explicit allow-list from env (REQUIRED for strictness).
 */
export function validateRedirectUriOrThrow(params: {
  redirectUri: string;
  allowListEnv: "OIDC_REDIRECT_URIS" | "OIDC_POST_LOGOUT_REDIRECT_URIS";
}): string {
  const { redirectUri, allowListEnv } = params;
  const normalized = normalizeForMatch(redirectUri);
  if (!normalized) throw new Error("Invalid redirect_uri");

  const allowList = getAllowedRedirectUrisEnv(allowListEnv);
  if (!allowList) {
    throw new Error(`${allowListEnv} is not configured; required for strict redirect_uri validation`);
  }

  const normalizedAllowList = allowList
    .map((s) => normalizeForMatch(s))
    .filter((s): s is string => typeof s === "string");

  if (!normalizedAllowList.includes(normalized)) {
    throw new Error("redirect_uri not allowed");
  }

  return normalized;
}

export function validateClientOrThrow(params: { clientId: string; clientSecret: string }): void {
  const expectedId = getOidcClientId();
  if (params.clientId !== expectedId) {
    throw new Error("Invalid client_id");
  }
  const expectedSecret = getOidcClientSecret();
  if (params.clientSecret !== expectedSecret) {
    throw new Error("Invalid client_secret");
  }
}

export function getExpectedClientCredentials(): { clientId: string; clientSecret: string } {
  return { clientId: getOidcClientId(), clientSecret: getOidcClientSecret() };
}

