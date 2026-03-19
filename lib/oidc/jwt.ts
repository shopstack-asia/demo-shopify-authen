import { createHash } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { getOidcClientId, getOidcIssuer } from "@/lib/oidc/client";
import { getSigningKeys } from "@/lib/oidc/jwks";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/** OIDC at_hash: base64url(left 128 bits of SHA256(access_token)). Required when access_token is issued with id_token. */
function atHash(accessToken: string): string {
  const hash = createHash("sha256").update(accessToken, "utf8").digest();
  const leftHalf = hash.subarray(0, 16);
  return leftHalf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export type SignedOidcAccessTokenClaims = {
  sub: string;
  email: string;
};

export async function createIdToken(params: {
  sub: string;
  email: string;
  aud: string; // client_id
  nonce?: string; // required when authorization request had nonce (e.g. Shopify)
  accessToken?: string; // when provided, at_hash is added (OIDC: required when access_token is issued with id_token)
  ttlSeconds?: number;
}): Promise<string> {
  const issuer = getOidcIssuer();
  const { kid, privateKey } = await getSigningKeys();

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
  const exp = now + ttlSeconds;

  // id_token payload: iss, sub, aud, email, exp, iat; nonce when provided; auth_time; at_hash when access_token provided
  const payload: Record<string, string | number | boolean> = {
    email: params.email,
    email_verified: true,
    auth_time: now,
  };
  if (params.nonce) payload.nonce = params.nonce;
  if (params.accessToken) payload.at_hash = atHash(params.accessToken);

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setIssuer(issuer)
    .setSubject(params.sub)
    .setAudience(params.aud)
    .setIssuedAt(now)
    .setExpirationTime(new Date(exp * 1000))
    .sign(privateKey);
}

export async function createAccessToken(params: {
  sub: string;
  email: string;
  aud: string; // client_id
  ttlSeconds?: number;
}): Promise<string> {
  const issuer = getOidcIssuer();
  const { kid, privateKey } = await getSigningKeys();

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS;
  const exp = now + ttlSeconds;

  return await new SignJWT({ email: params.email })
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setIssuer(issuer)
    .setSubject(params.sub)
    .setAudience(params.aud)
    .setIssuedAt(now)
    .setExpirationTime(new Date(exp * 1000))
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<SignedOidcAccessTokenClaims> {
  const issuer = getOidcIssuer();
  const expectedAud = getOidcClientId();
  const { publicKey } = await getSigningKeys();

  const { payload } = await jwtVerify(token, publicKey, {
    issuer,
    audience: expectedAud,
  });

  const sub = payload.sub;
  const email = payload.email;

  if (typeof sub !== "string" || !sub) throw new Error("Invalid access token: missing sub");
  if (typeof email !== "string" || !email) throw new Error("Invalid access token: missing email");

  return { sub, email };
}

/** Verify id_token with our public key (sanity check before sending to RP). */
export async function verifyIdToken(idToken: string, expectedAudience: string): Promise<void> {
  const issuer = getOidcIssuer();
  const { publicKey } = await getSigningKeys();
  await jwtVerify(idToken, publicKey, {
    issuer,
    audience: expectedAudience,
  });
}

