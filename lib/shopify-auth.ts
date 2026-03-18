/**
 * Shopify Customer Account OAuth + PKCE helpers.
 *
 * Uses Node.js built-in `crypto` only (no external crypto libraries).
 */

import * as crypto from "crypto";

type AuthEndpoints = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint: string;
  jwks_uri: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function normalizeStoreDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToString(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

async function sha256Base64Url(input: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(input).digest();
  return base64UrlEncode(hash);
}

/**
 * Generate a URL-safe PKCE code_verifier (43-128 chars).
 */
export async function generateCodeVerifier(): Promise<string> {
  // RFC 7636 suggests 43-128 chars. We'll generate 64 bytes => 86-128 base64url chars.
  const bytes = crypto.randomBytes(64);
  return base64UrlEncode(bytes);
}

/**
 * Generate PKCE code_challenge from verifier using SHA256 + base64url.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

/**
 * Generate random state string for CSRF prevention.
 */
export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Generate random nonce string.
 */
export function generateNonce(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Discover Shopify OAuth endpoints from the OpenID configuration document.
 */
export async function discoverAuthEndpoints(shopDomain: string): Promise<AuthEndpoints> {
  const storeDomain = normalizeStoreDomain(shopDomain);
  const wellKnownUrl = `https://${storeDomain}/.well-known/openid-configuration`;

  const res = await fetch(wellKnownUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Failed to load OpenID configuration: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as Partial<AuthEndpoints>;

  const endpoints: AuthEndpoints = {
    authorization_endpoint: String(json.authorization_endpoint ?? ""),
    token_endpoint: String(json.token_endpoint ?? ""),
    end_session_endpoint: String(json.end_session_endpoint ?? ""),
    jwks_uri: String(json.jwks_uri ?? ""),
  };

  if (
    !endpoints.authorization_endpoint ||
    !endpoints.token_endpoint ||
    !endpoints.end_session_endpoint
  ) {
    throw new Error("OpenID configuration missing required endpoints.");
  }

  return endpoints;
}

export function getRedirectUri(origin?: string): string {
  const base = (origin ?? requireEnv("NEXT_PUBLIC_APP_URL")).replace(/\/+$/g, "");
  return `${base}/api/auth/callback`;
}

/**
 * Build an origin from incoming request headers (works behind proxies like ngrok).
 * Prefer `x-forwarded-proto` and `x-forwarded-host` when available.
 */
export function getRequestOriginFromHeaders(headers: Headers): string {
  const protoHeader = headers.get("x-forwarded-proto");
  const hostHeader = headers.get("x-forwarded-host");
  const proto = (protoHeader && protoHeader.trim()) || "http";
  const hostFallback = headers.get("host");
  const host = (hostHeader && hostHeader.trim()) || (hostFallback && hostFallback.trim()) || "";
  if (!host) return `${proto}://localhost`;
  return `${proto}://${host}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  tokenEndpoint: string;
  redirectUri?: string;
}): Promise<{
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}> {
  const clientId = requireEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = requireEnv("SHOPIFY_CLIENT_SECRET");
  const redirectUri = params.redirectUri ?? getRedirectUri();

  // Shopify advertises `client_secret_basic` as the supported token auth method.
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: redirectUri,
    code_verifier: params.codeVerifier,
    client_id: clientId,
  });

  const res = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed: ${res.status} ${res.statusText} ${text}`);
  }

  const json = (await res.json()) as Partial<{
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: number;
  }>;

  if (!json.access_token || !json.refresh_token || !json.id_token || !json.expires_in) {
    throw new Error("Token exchange returned incomplete token payload.");
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    id_token: json.id_token,
    expires_in: json.expires_in,
  };
}

/**
 * Ensure Shopify Customer Account API access tokens are prefixed with `shcat_`.
 */
export function formatAccessToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.startsWith("shcat_")) return trimmed;
  return `shcat_${trimmed}`;
}

/**
 * Decode a JWT payload (no signature verification) and return the `sub` claim.
 */
export function decodeJwtSub(idToken: string): string {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new Error("Invalid id_token.");

  const payloadB64 = parts[1];
  const payloadJson = base64UrlDecodeToString(payloadB64);
  const payload = JSON.parse(payloadJson) as { sub?: string };
  if (!payload.sub) throw new Error("id_token missing sub claim.");
  return payload.sub;
}

export function decodeJwtNonce(idToken: string): string | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = base64UrlDecodeToString(parts[1]);
    const payload = JSON.parse(payloadJson) as { nonce?: string };
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

