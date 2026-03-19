import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { discoverAuthEndpoints } from "@/lib/shopify-auth";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const idToken = session.idToken;

  session.isLoggedIn = false;
  session.accessToken = "";
  session.refreshToken = "";
  session.idToken = "";
  session.email = undefined;
  session.customerId = "";
  session.codeVerifier = "";
  session.nonce = "";
  session.state = "";
  session.returnTo = "";
  session.otpEmail = undefined;
  session.otpCode = undefined;
  session.otpExpiry = undefined;
  await session.destroy();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const postLogoutRedirectUri = `${appUrl.replace(/\/+$/g, "")}/login`;

  const storeDomainRaw = process.env.SHOPIFY_STORE_DOMAIN ?? "";
  const storeDomain = storeDomainRaw.trim().replace(/^https?:\/\//i, "");
  if (!storeDomain) {
    return NextResponse.redirect(postLogoutRedirectUri);
  }

  try {
    const endpoints = await discoverAuthEndpoints(storeDomain);
    const endUrl = new URL(endpoints.end_session_endpoint);
    // id_token_hint is optional for upstream logout implementations.
    // When our session came from OTP-only login, we may not have an id_token.
    if (idToken) {
      endUrl.searchParams.set("id_token_hint", idToken);
    }
    endUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return NextResponse.redirect(endUrl);
  } catch {
    return NextResponse.redirect(postLogoutRedirectUri);
  }
}
