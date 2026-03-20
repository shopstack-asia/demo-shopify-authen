import { NextResponse } from "next/server";
import { getOidcIssuer } from "@/lib/oidc/client";

export const runtime = "nodejs";
// Prevent Vercel/Next caching so Shopify discovery always sees logout endpoint.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const issuer = getOidcIssuer();
  const base = issuer.replace(/\/+$/, "");
  const jwksUri = `${base}/.well-known/jwks.json`;

  return new NextResponse(
    JSON.stringify({
      issuer: base,
      authorization_endpoint: `${base}/api/oidc/authorize`,
      token_endpoint: `${base}/api/oidc/token`,
      userinfo_endpoint: `${base}/api/oidc/userinfo`,
      jwks_uri: jwksUri,
      end_session_endpoint: `${base}/api/oidc/logout`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // Must include every scope you can request in the authorization flow.
      // app/api/auth/login/route.ts requests: "openid email customer-account-api:full"
      scopes_supported: ["openid", "email", "customer-account-api:full"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
