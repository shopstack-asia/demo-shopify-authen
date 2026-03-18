/**
 * Shopify Multipass token generator for auto-login on the Shopify storefront.
 * Multipass is only available on Shopify Plus and Enterprise plans.
 * If your store is on Basic or Advanced, leave SHOPIFY_MULTIPASS_SECRET empty
 * and users will be redirected to /profile after login instead.
 */

import * as crypto from "crypto";

const MULTIPASS_ALGORITHM = "aes-128-cbc";
const MULTIPASS_KEY_LENGTH = 16;
const MULTIPASS_SIGNATURE_LENGTH = 32;

/**
 * Derive encryption and signature keys from the Multipass secret using SHA256.
 */
function deriveKeys(secret: string): { encryptionKey: Buffer; signatureKey: Buffer } {
  const hash = crypto.createHash("sha256").update(secret).digest();
  return {
    encryptionKey: hash.subarray(0, MULTIPASS_KEY_LENGTH),
    signatureKey: hash.subarray(MULTIPASS_KEY_LENGTH, MULTIPASS_KEY_LENGTH + MULTIPASS_SIGNATURE_LENGTH),
  };
}

/**
 * Base64url encode (no padding, URL-safe).
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a Multipass token for the given customer email.
 * Used to redirect the user to Shopify storefront and log them in automatically.
 *
 * @param email - Customer email
 * @param returnTo - Optional URL to redirect to after login on Shopify
 * @returns Base64url-encoded token to append to /account/login/multipass/{token}
 */
export function generateMultipassToken(
  email: string,
  returnTo?: string
): string {
  const secret = process.env.SHOPIFY_MULTIPASS_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_MULTIPASS_SECRET is not set");
  }

  const customerData: Record<string, string> = {
    email,
    created_at: new Date().toISOString(),
  };
  if (returnTo) {
    customerData.return_to = returnTo;
  }

  const json = JSON.stringify(customerData);
  const { encryptionKey, signatureKey } = deriveKeys(secret);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(MULTIPASS_ALGORITHM, encryptionKey, iv);
  const encrypted =
    Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const ciphertextWithIv = Buffer.concat([iv, encrypted]);
  const signature = crypto
    .createHmac("sha256", signatureKey)
    .update(ciphertextWithIv)
    .digest();
  const combined = Buffer.concat([ciphertextWithIv, signature]);
  return base64UrlEncode(combined);
}

/**
 * Build the full Shopify Multipass login URL.
 * Example: https://mystore.myshopify.com/account/login/multipass/{token}
 */
export function getMultipassRedirectUrl(
  email: string,
  returnTo?: string
): string {
  const storeUrl = (process.env.SHOPIFY_STORE_DOMAIN
    ? `https://${process.env.SHOPIFY_STORE_DOMAIN}`
    : ""
  ).replace(/\/$/, "");
  const token = generateMultipassToken(email, returnTo);
  return `${storeUrl}/account/login/multipass/${token}`;
}
