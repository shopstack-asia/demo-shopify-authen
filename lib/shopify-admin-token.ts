const ADMIN_OAUTH_TOKEN_GRANT_ENDPOINT = `admin/oauth/access_token`;

type CachedToken = { token: string; expiresAt: number };

let cachedToken: CachedToken | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

/**
 * Get Shopify Admin access token (cached in-memory).
 * Uses CustomAuthenApp client_credentials.
 */
export async function getAdminAccessToken(): Promise<string> {
  // Return cached token if it's still valid (refresh 60s before expiry).
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const storeDomain = requireEnv("SHOPIFY_MYSHOPIFY_DOMAIN");
  const clientId = requireEnv("SHOPIFY_ADMIN_CLIENT_ID");
  const clientSecret = requireEnv("SHOPIFY_ADMIN_CLIENT_SECRET");

  const tokenEndpoint = `https://${storeDomain}/${ADMIN_OAUTH_TOKEN_GRANT_ENDPOINT}`;

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const raw = text.trim();
    // Shopify often returns HTML error pages; keep the useful part only.
    const short =
      raw.includes("app_not_installed") && raw.includes("Oauth error")
        ? raw.match(/Oauth error[^<]+/i)?.[0]?.trim() || "Oauth error app_not_installed"
        : raw.length > 300
          ? raw.slice(0, 300) + "…"
          : raw.trim() || "Shopify OAuth error";
    throw new Error(`Failed to get admin token: ${res.status} ${short}`.trim());
  }

  const data: { access_token?: unknown; expires_in?: unknown } = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (typeof data.access_token !== "string" || data.access_token.trim().length === 0) {
    throw new Error("Failed to parse admin token response: missing access_token");
  }
  if (typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in)) {
    throw new Error("Failed to parse admin token response: missing expires_in");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

