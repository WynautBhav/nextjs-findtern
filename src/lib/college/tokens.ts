import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Drive share links.
 *
 * The token is 32 random bytes (256 bits), shown once to the placement officer
 * and never stored: the table holds its SHA-256. A leaked database therefore
 * leaks no working links, and a link is revoked by stamping the drive, not by
 * hunting down copies of the URL. SHA-256 rather than a slow KDF is right
 * here: the input is random, not a guessable password.
 */
export function generateDriveToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDriveToken(token) };
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
