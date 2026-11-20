import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Fireflies Webhooks V2 signature (https://docs.fireflies.ai/graphql-api/webhooks-v2#webhook-authentication):
 * header `X-Hub-Signature: sha256=<hex>` where hex = HMAC-SHA256(signing secret, raw request body).
 * Constant-time compare. Returns false for a missing header, a missing secret, a wrong prefix or any length mismatch.
 * Pure: relative imports only.
 */
export function firefliesSignature(rawBody: string | Uint8Array, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyFirefliesSignature(rawBody: string | Uint8Array, header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const want = Buffer.from(firefliesSignature(rawBody, secret));
  const got = Buffer.from(header.trim());
  return got.length === want.length && timingSafeEqual(got, want);
}
