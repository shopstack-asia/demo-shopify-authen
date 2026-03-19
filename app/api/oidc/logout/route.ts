import { NextRequest, NextResponse } from "next/server";
import { getOidcIssuer, validateRedirectUriOrThrow } from "@/lib/oidc/client";
import { getSession } from "@/lib/session";

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
    const url = new URL(redirectUri);
    return NextResponse.redirect(url.toString(), 302);
  } catch {
    try {
      const redirectUri = validateRedirectUriOrThrow({
        redirectUri: postLogoutRedirectUri,
        allowListEnv: "OIDC_REDIRECT_URIS",
      });
      const url = new URL(redirectUri);
      return NextResponse.redirect(url.toString(), 302);
    } catch {
      return redirectToLogin();
    }
  }
}

