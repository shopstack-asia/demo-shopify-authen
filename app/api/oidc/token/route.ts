import { NextRequest, NextResponse } from "next/server";
import { consumeAuthorizationCode, createRefreshToken, consumeRefreshToken } from "@/lib/oidc/store";
import { createAccessToken, createIdToken, verifyIdToken } from "@/lib/oidc/jwt";
import { validateClientOrThrow, validateRedirectUriOrThrow, getOidcClientId } from "@/lib/oidc/client";

export const runtime = "nodejs";

function errorJson(error: string, errorDescription: string, status = 400) {
  return NextResponse.json(
    {
      error,
      error_description: errorDescription,
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

const stringFromUnknown = (v: unknown): string => (typeof v === "string" ? v : "");

function getStringParam(obj: Record<string, unknown>, name: string): string {
  const v = obj[name] ?? obj[name.replace(/_/g, "")]; // client_id or clientid
  return stringFromUnknown(v);
}

/** Parse POST body: form-urlencoded (OAuth standard) or JSON. */
async function parseTokenBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  if (!raw.trim()) return {};

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  // application/x-www-form-urlencoded (and fallback when Content-Type is missing/wrong)
  const params: Record<string, unknown> = {};
  const search = new URLSearchParams(raw);
  search.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/** Extract client_id and client_secret from Authorization: Basic base64(client_id:client_secret). */
function parseBasicAuth(request: NextRequest): { clientId: string; clientSecret: string } {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return { clientId: "", clientSecret: "" };
  try {
    const b64 = auth.slice(6).trim();
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon <= 0) return { clientId: "", clientSecret: "" };
    return {
      clientId: decoded.slice(0, colon),
      clientSecret: decoded.slice(colon + 1),
    };
  } catch {
    return { clientId: "", clientSecret: "" };
  }
}

export async function POST(request: NextRequest) {
  const params = await parseTokenBody(request);
  const basic = parseBasicAuth(request);

  const grantType = getStringParam(params, "grant_type");
  const code = getStringParam(params, "code");
  const redirectUriRaw = getStringParam(params, "redirect_uri");
  // Shopify sends client credentials via HTTP Basic Auth, not in body — support both
  const clientId = getStringParam(params, "client_id") || basic.clientId;
  const clientSecret = getStringParam(params, "client_secret") || basic.clientSecret;

  if (!grantType) return errorJson("invalid_request", "Missing grant_type");
  if (!clientId) return errorJson("invalid_request", "Missing client_id");
  if (!clientSecret) return errorJson("invalid_request", "Missing client_secret");

  if (clientId !== getOidcClientId()) {
    return errorJson("invalid_client", "Unknown client_id", 401);
  }

  try {
    validateClientOrThrow({ clientId, clientSecret });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid client credentials";
    return errorJson("invalid_client", message, 401);
  }

  // --- authorization_code (Shopify pattern: access_token, refresh_token, id_token, expires_in) ---
  if (grantType === "authorization_code") {
    if (!code) return errorJson("invalid_request", "Missing code");
    if (!redirectUriRaw) return errorJson("invalid_request", "Missing redirect_uri");

    let redirectUri: string;
    try {
      redirectUri = validateRedirectUriOrThrow({
        redirectUri: redirectUriRaw,
        allowListEnv: "OIDC_REDIRECT_URIS",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid redirect_uri";
      return errorJson("invalid_request", message);
    }

    const rec = consumeAuthorizationCode({ code, clientId, redirectUri });
    if (!rec) {
      return errorJson("invalid_grant", "Authorization code not found, expired, or already used", 400);
    }

    const refreshToken = createRefreshToken({ sub: rec.sub, email: rec.email, clientId });
    const accessToken = await createAccessToken({ sub: rec.sub, email: rec.email, aud: clientId });
    const idToken = await createIdToken({
      sub: rec.sub,
      email: rec.email,
      aud: clientId,
      nonce: rec.nonce,
      accessToken,
    });

    try {
      await verifyIdToken(idToken, clientId);
    } catch {
      return errorJson("server_error", "Id token verification failed", 500);
    }

    const responseBody = {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email",
    };
    return NextResponse.json(responseBody, {
      headers: {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
  }

  // --- refresh_token (Shopify pattern) ---
  if (grantType === "refresh_token") {
    const refreshTokenRaw = getStringParam(params, "refresh_token");
    if (!refreshTokenRaw) return errorJson("invalid_request", "Missing refresh_token");

    const rec = consumeRefreshToken({ refreshToken: refreshTokenRaw, clientId });
    if (!rec) {
      return errorJson("invalid_grant", "Refresh token not found, expired, or already used", 400);
    }

    const newRefreshToken = createRefreshToken({ sub: rec.sub, email: rec.email, clientId });
    const accessToken = await createAccessToken({ sub: rec.sub, email: rec.email, aud: clientId });
    const idToken = await createIdToken({
      sub: rec.sub,
      email: rec.email,
      aud: clientId,
      accessToken,
    });

    const responseBody = {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email",
    };
    return NextResponse.json(responseBody, {
      headers: {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
  }

  return errorJson("unsupported_grant_type", "Only grant_type=authorization_code and refresh_token are supported");
}

