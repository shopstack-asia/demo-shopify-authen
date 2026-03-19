import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getOidcClientId, validateRedirectUriOrThrow } from "@/lib/oidc/client";
import { createAuthorizationCode } from "@/lib/oidc/store";
import { getRequestOriginFromHeaders } from "@/lib/shopify-auth";

export const runtime = "nodejs";

function redirectToLogin(request: NextRequest, returnTo: string) {
  const origin = getRequestOriginFromHeaders(request.headers);
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl.toString());
}

function errorJson(error: string, errorDescription: string, status = 400) {
  return NextResponse.json(
    {
      error,
      error_description: errorDescription,
    },
    { status }
  );
}

function scopeIncludesOpenid(scope: string | null): boolean {
  if (!scope) return false;
  const parts = scope.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.includes("openid");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUriRaw = url.searchParams.get("redirect_uri") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "";
  const scope = url.searchParams.get("scope");
  const state = url.searchParams.get("state") ?? "";
  const nonce = url.searchParams.get("nonce") ?? undefined;

  if (!clientId) return errorJson("invalid_request", "Missing client_id");
  if (!redirectUriRaw) return errorJson("invalid_request", "Missing redirect_uri");
  if (!responseType) return errorJson("invalid_request", "Missing response_type");

  if (clientId !== getOidcClientId()) return errorJson("invalid_client", "Unknown client_id", 401);
  if (responseType !== "code") return errorJson("unsupported_response_type", "Only response_type=code is supported");
  if (!scopeIncludesOpenid(scope)) return errorJson("invalid_scope", "scope must include openid");

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

  const user = await getCurrentUser(request);
  if (!user) {
    const returnTo = `/api/oidc/authorize?${url.searchParams.toString()}`;
    return redirectToLogin(request, returnTo);
  }

  // Use email as sub — Shopify rejects its own GID format (gid://shopify/Customer/...) as external IDP subject
  const code = createAuthorizationCode({
    sub: user.email,
    email: user.email,
    clientId,
    redirectUri,
    nonce,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), 302);
}

