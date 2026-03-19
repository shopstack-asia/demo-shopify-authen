import crypto from "crypto";

export type AuthorizationCodeRecord = {
  sub: string;
  email: string;
  clientId: string;
  redirectUri: string;
  nonce?: string; // when present, id_token must include it (OIDC)
  expiresAt: number; // ms epoch
  usedAt?: number; // ms epoch
};

const DEFAULT_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function cleanupExpired(store: Map<string, AuthorizationCodeRecord>) {
  const now = Date.now();
  store.forEach((rec, code) => {
    if (rec.expiresAt <= now || rec.usedAt) store.delete(code);
  });
}

function getStore(): Map<string, AuthorizationCodeRecord> {
  const globalAny = globalThis as unknown as {
    __oidcAuthCodeStore__?: Map<string, AuthorizationCodeRecord>;
  };
  if (!globalAny.__oidcAuthCodeStore__) {
    globalAny.__oidcAuthCodeStore__ = new Map();
  }
  return globalAny.__oidcAuthCodeStore__;
}

export function createAuthorizationCode(params: {
  sub: string;
  email: string;
  clientId: string;
  redirectUri: string;
  nonce?: string;
  ttlMs?: number;
}): string {
  const store = getStore();
  cleanupExpired(store);

  const code = base64UrlEncode(crypto.randomBytes(32));
  const expiresAt = Date.now() + (params.ttlMs ?? DEFAULT_CODE_TTL_MS);

  store.set(code, {
    sub: params.sub,
    email: params.email,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    nonce: params.nonce,
    expiresAt,
  });

  return code;
}

export function consumeAuthorizationCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
}): AuthorizationCodeRecord | null {
  const store = getStore();
  cleanupExpired(store);

  const rec = store.get(params.code) ?? null;
  if (!rec) return null;
  if (rec.usedAt) {
    store.delete(params.code);
    return null;
  }
  if (rec.expiresAt <= Date.now()) {
    store.delete(params.code);
    return null;
  }
  if (rec.clientId !== params.clientId) return null;
  if (rec.redirectUri !== params.redirectUri) return null;

  // Single-use: remove immediately.
  store.delete(params.code);
  return { ...rec, usedAt: Date.now() };
}

// --- Refresh tokens (Shopify expects refresh_token in token response) ---

export type RefreshTokenRecord = {
  sub: string;
  email: string;
  clientId: string;
  expiresAt: number;
  usedAt?: number;
};

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getRefreshStore(): Map<string, RefreshTokenRecord> {
  const globalAny = globalThis as unknown as {
    __oidcRefreshTokenStore__?: Map<string, RefreshTokenRecord>;
  };
  if (!globalAny.__oidcRefreshTokenStore__) {
    globalAny.__oidcRefreshTokenStore__ = new Map();
  }
  return globalAny.__oidcRefreshTokenStore__;
}

function cleanupExpiredRefreshTokens(store: Map<string, RefreshTokenRecord>) {
  const now = Date.now();
  store.forEach((rec, token) => {
    if (rec.expiresAt <= now || rec.usedAt) store.delete(token);
  });
}

export function createRefreshToken(params: {
  sub: string;
  email: string;
  clientId: string;
}): string {
  const store = getRefreshStore();
  cleanupExpiredRefreshTokens(store);

  const token = base64UrlEncode(crypto.randomBytes(32));
  const expiresAt = Date.now() + REFRESH_TOKEN_TTL_MS;

  store.set(token, {
    sub: params.sub,
    email: params.email,
    clientId: params.clientId,
    expiresAt,
  });

  return token;
}

export function consumeRefreshToken(params: {
  refreshToken: string;
  clientId: string;
}): RefreshTokenRecord | null {
  const store = getRefreshStore();
  cleanupExpiredRefreshTokens(store);

  const rec = store.get(params.refreshToken) ?? null;
  if (!rec) return null;
  if (rec.usedAt) {
    store.delete(params.refreshToken);
    return null;
  }
  if (rec.expiresAt <= Date.now()) {
    store.delete(params.refreshToken);
    return null;
  }
  if (rec.clientId !== params.clientId) return null;

  store.delete(params.refreshToken);
  return { ...rec, usedAt: Date.now() };
}

