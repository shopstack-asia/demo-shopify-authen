import { NextRequest, NextResponse } from "next/server";
import { getOidcIssuer, validateRedirectUriOrThrow } from "@/lib/oidc/client";
import { cookies } from "next/headers";
import { getSession, LOGIN_PAGE_INTERNAL_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session";
import { discoverAuthEndpoints } from "@/lib/shopify-auth";

export const runtime = "nodejs";

function extractPostLogoutRedirectUriFromQuery(request: NextRequest): string {
  const raw = request.nextUrl.searchParams.get("post_logout_redirect_uri");
  return typeof raw === "string" ? raw.trim() : "";
}

function redirectToLogin() {
  const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
  const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
  if (storeDomain) {
    const res = NextResponse.redirect(`https://${storeDomain}/`, 302);
    res.cookies.set(LOGIN_PAGE_INTERNAL_COOKIE_NAME, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5, // 5 minutes
      path: "/",
    });
    return res;
  }

  const issuer = getOidcIssuer();
  const loginUrl = new URL("/login", issuer);
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

async function logoutCore(request: NextRequest, postLogoutRedirectUriFromQuery: string) {
  const session = await getSession();
  const idToken = session.idToken;

  session.isLoggedIn = false;
  session.accessToken = "";
  session.refreshToken = "";
  session.idToken = "";
  session.customerId = "";
  session.codeVerifier = "";
  session.nonce = "";
  session.state = "";
  session.returnTo = "";
  session.otpEmail = undefined;
  session.otpCode = undefined;
  session.otpExpiry = undefined;
  try {
    await session.destroy();
  } finally {
    // Extra safety: ensure the cookie is deleted even if destroy() can't write Set-Cookie.
    const cookieStore = cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    // No need to call cookieStore.delete() separately; maxAge=0 above clears it.
  }

  // Only after session is cleared, parse optional post_logout_redirect_uri.
  // Some upstream implementations might not send form-encoded data.
  let postLogoutRedirectUri = postLogoutRedirectUriFromQuery || "";
  try {
    const formData = await request.formData();
    const postLogoutRedirectUriRaw = formData.get("post_logout_redirect_uri");
    const fromForm = typeof postLogoutRedirectUriRaw === "string" ? postLogoutRedirectUriRaw.trim() : "";
    if (fromForm) postLogoutRedirectUri = fromForm;
  } catch {
    // ignore (GET requests might not have form body)
  }

  if (!postLogoutRedirectUri) {
    return redirectToLogin();
  }

  try {
    const redirectUri = validateRedirectUriOrThrow({
      redirectUri: postLogoutRedirectUri,
      allowListEnv: "OIDC_POST_LOGOUT_REDIRECT_URIS",
    });

    const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
    const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
    if (storeDomain) {
      const endpoints = await discoverAuthEndpoints(storeDomain);
      const endUrl = new URL(endpoints.end_session_endpoint);
      if (idToken) endUrl.searchParams.set("id_token_hint", idToken);
      endUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
      return NextResponse.redirect(endUrl.toString(), 302);
    }

    return NextResponse.redirect(new URL(redirectUri).toString(), 302);
  } catch {
    try {
      const redirectUri = validateRedirectUriOrThrow({
        redirectUri: postLogoutRedirectUri,
        allowListEnv: "OIDC_REDIRECT_URIS",
      });

      const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
      const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
      if (storeDomain) {
        const endpoints = await discoverAuthEndpoints(storeDomain);
        const endUrl = new URL(endpoints.end_session_endpoint);
        if (idToken) endUrl.searchParams.set("id_token_hint", idToken);
        endUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
        return NextResponse.redirect(endUrl.toString(), 302);
      }

      return NextResponse.redirect(new URL(redirectUri).toString(), 302);
    } catch {
      return redirectToLogin();
    }
  }
}

export async function POST(request: NextRequest) {
  return logoutCore(request, extractPostLogoutRedirectUriFromQuery(request));
}

// Some upstream logout implementations call the endpoint as a redirect (GET),
// so we support GET as well to guarantee session cleanup.
export async function GET(request: NextRequest) {
  return logoutCore(request, extractPostLogoutRedirectUriFromQuery(request));
}

