import { createHmac } from "node:crypto";

// No 0/O/1/I/L so a code read off an email cannot be mistyped.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * A drive code is derived from its row id and a server secret, never stored in
 * the clear: the table keeps only `hashDriveCode(code)`. Resending an email
 * re-derives the same code, so no plaintext code ever sits in the database.
 */
export function deriveDriveCode(codeId: string, secret: string): string {
  if (secret.length < 32) throw new Error("drive code secret must be at least 32 characters");
  const mac = createHmac("sha256", secret).update(`drive-code:${codeId}`, "utf8").digest();
  let out = "";
  for (let i = 0; i < 12; i += 1) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

/** Lookup key for a presented code (case, spaces and dashes ignored). Keyed, so a leaked table cannot be brute-forced offline. */
export function hashDriveCode(code: string, secret: string): string {
  if (secret.length < 32) throw new Error("drive code secret must be at least 32 characters");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHmac("sha256", secret).update(`drive-code-lookup:${clean}`, "utf8").digest("hex");
}

/** The server secret, read the same way as src/lib/security/sign.ts. */
export function driveCodeSecret(): string {
  const s = process.env.SIGNING_SECRET ?? process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SIGNING_SECRET (or SESSION_SECRET) is not set or is shorter than 32 characters.");
  return s;
}
