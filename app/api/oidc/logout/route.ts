import { NextRequest, NextResponse } from "next/server";
import { getOidcIssuer, validateRedirectUriOrThrow } from "@/lib/oidc/client";
import { getSession } from "@/lib/session";
import { discoverAuthEndpoints } from "@/lib/shopify-auth";

export const runtime = "nodejs";

function redirectToLogin() {
  const issuer = getOidcIssuer();
  const loginUrl = new URL("/login", issuer);
  return NextResponse.redirect(loginUrl.toString(), 302);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const postLogoutRedirectUriRaw = formData.get("post_logout_redirect_uri");
  const postLogoutRedirectUri =
    typeof postLogoutRedirectUriRaw === "string" ? postLogoutRedirectUriRaw.trim() : "";

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
  await session.destroy();

  if (!postLogoutRedirectUri) {
    return redirectToLogin();
  }

  try {
    const redirectUri = validateRedirectUriOrThrow({
      redirectUri: postLogoutRedirectUri,
      allowListEnv: "OIDC_POST_LOGOUT_REDIRECT_URIS",
    });

    // If we still have a Shopify OIDC id_token, try to terminate the upstream session too.
    if (idToken) {
      const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
      const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
      if (storeDomain) {
        const endpoints = await discoverAuthEndpoints(storeDomain);
        const endUrl = new URL(endpoints.end_session_endpoint);
        endUrl.searchParams.set("id_token_hint", idToken);
        endUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
        return NextResponse.redirect(endUrl, 302);
      }
    }

    return NextResponse.redirect(new URL(redirectUri).toString(), 302);
  } catch {
    try {
      const redirectUri = validateRedirectUriOrThrow({
        redirectUri: postLogoutRedirectUri,
        allowListEnv: "OIDC_REDIRECT_URIS",
      });

      if (idToken) {
        const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
        const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
        if (storeDomain) {
          const endpoints = await discoverAuthEndpoints(storeDomain);
          const endUrl = new URL(endpoints.end_session_endpoint);
          endUrl.searchParams.set("id_token_hint", idToken);
          endUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
          return NextResponse.redirect(endUrl, 302);
        }
      }

      return NextResponse.redirect(new URL(redirectUri).toString(), 302);
    } catch {
      return redirectToLogin();
    }
  }
}

