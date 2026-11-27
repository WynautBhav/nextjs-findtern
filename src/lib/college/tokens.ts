import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { driveCodeSecret } from "../drives/code-derive.ts";

/**
 * Drive share links.
 *
 * The token is HMAC-SHA256(server secret, a random per-link key): 256 bits.
 * The table holds the key and the token's SHA-256, never the token, so the
 * officer can be shown the link again while a leaked database alone (no server
 * secret) still leaks no working link. A link is revoked by stamping the drive,
 * not by hunting down copies of the URL. SHA-256 rather than a slow KDF is
 * right here: the input is random, not a guessable password.
 * Drives made before the key existed have none and their link is not
 * recoverable.
 */
export function generateDriveToken(secret: string = driveCodeSecret()): { token: string; hash: string; key: string } {
  const key = randomBytes(32).toString("base64url");
  const token = deriveDriveToken(key, secret);
  return { token, hash: hashDriveToken(token), key };
}

/** The link's token again, from the stored key. Verify it against the stored hash before showing it (a rotated secret changes it). */
export function deriveDriveToken(key: string, secret: string): string {
  if (secret.length < 32) throw new Error("drive link secret must be at least 32 characters");
  return createHmac("sha256", secret).update(`drive-link:${key}`, "utf8").digest("base64url");
}

export function hashDriveToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time compare of a presented token against a stored hash. */
export function tokenMatches(token: string | null | undefined, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashDriveToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
