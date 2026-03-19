import { NextResponse } from "next/server";
import { getOidcIssuer } from "@/lib/oidc/client";

export const runtime = "nodejs";

export async function GET() {
  const issuer = getOidcIssuer();
  const base = issuer.replace(/\/+$/, "");
  const jwksUri = `${base}/.well-known/jwks.json`;

  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oidc/authorize`,
    token_endpoint: `${base}/api/oidc/token`,
    userinfo_endpoint: `${base}/api/oidc/userinfo`,
    jwks_uri: jwksUri,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    scopes_supported: ["openid", "email"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
  });
}
