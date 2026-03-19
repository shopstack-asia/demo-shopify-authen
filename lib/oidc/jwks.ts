import { readFile } from "fs/promises";
import { join } from "path";
import { exportJWK, importPKCS8, importSPKI } from "jose";

const STATIC_KID = "shopify-key-1";
const DEFAULT_PRIVATE_KEY_FILE = ".oidc-private.pem";
const DEFAULT_PUBLIC_KEY_FILE = ".oidc-public.pem";

export type OidcKeyMaterial = {
  kid: string;
  publicJwk: {
    kty: string;
    use: string;
    kid: string;
    alg: string;
    n: string;
    e: string;
  };
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  publicKey: Awaited<ReturnType<typeof importSPKI>>;
};

let keyMaterial: OidcKeyMaterial | null = null;

function normalizePem(s: string): string {
  return s.trim().replace(/\\n/g, "\n");
}

async function loadPemFromEnvOrFile(
  envKey: string,
  envKeyPem: string,
  pathEnv: string,
  defaultPath: string
): Promise<string> {
  const fromEnv = (process.env[envKey] ?? process.env[envKeyPem])?.trim();
  if (fromEnv) return normalizePem(fromEnv);

  const path = process.env[pathEnv]?.trim() || join(process.cwd(), defaultPath);
  try {
    const content = await readFile(path, "utf8");
    return content.trim();
  } catch {
    throw new Error(
      `Missing OIDC key. Set ${envKey} (or ${envKeyPem}), or set ${pathEnv} / create ${defaultPath}.`
    );
  }
}

/**
 * Load RSA keys from env (OIDC_PRIVATE_KEY / OIDC_PUBLIC_KEY) or from files
 * (OIDC_PRIVATE_KEY_PATH / OIDC_PUBLIC_KEY_PATH, or .oidc-private.pem / .oidc-public.pem).
 * Same key everywhere = key stability for Shopify.
 */
async function loadKeyMaterial(): Promise<OidcKeyMaterial> {
  if (keyMaterial) return keyMaterial;

  const privatePem = await loadPemFromEnvOrFile(
    "OIDC_PRIVATE_KEY",
    "OIDC_PRIVATE_KEY_PEM",
    "OIDC_PRIVATE_KEY_PATH",
    DEFAULT_PRIVATE_KEY_FILE
  );
  const publicPem = await loadPemFromEnvOrFile(
    "OIDC_PUBLIC_KEY",
    "OIDC_PUBLIC_KEY_PEM",
    "OIDC_PUBLIC_KEY_PATH",
    DEFAULT_PUBLIC_KEY_FILE
  );

  const kid = process.env.OIDC_KID?.trim() || STATIC_KID;

  const publicKey = await importSPKI(publicPem, "RS256");
  const privateKey = await importPKCS8(privatePem, "RS256");

  const rawJwk = (await exportJWK(publicKey)) as { n?: string; e?: string };
  const n = rawJwk.n?.replace(/=+$/, "") ?? "";
  const e = (rawJwk.e ?? "AQAB").replace(/=+$/, "");
  if (!n) throw new Error("OIDC_PUBLIC_KEY did not produce a valid JWK (missing n)");

  const publicJwk = {
    kty: "RSA",
    use: "sig",
    kid,
    alg: "RS256",
    n,
    e,
  };

  keyMaterial = { kid, publicJwk, privateKey, publicKey };
  return keyMaterial;
}

export async function getJwks(): Promise<{ keys: OidcKeyMaterial["publicJwk"][] }> {
  const material = await loadKeyMaterial();
  return { keys: [material.publicJwk] };
}

export async function getSigningKeys() {
  const material = await loadKeyMaterial();
  return {
    kid: material.kid,
    privateKey: material.privateKey,
    publicKey: material.publicKey,
    publicJwk: material.publicJwk,
  };
}

export function getOptionalEnv(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim().length === 0) return undefined;
  return v.trim();
}

export function requireOidcEnvOrThrow(name: string): string {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim().length === 0) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}
