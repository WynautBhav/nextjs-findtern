import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** No 0/O/1/I/L: a code read aloud or off a poster cannot be mistyped. */
export const COLLEGE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Current format: "FT" + 8 characters (about 8.5e11 codes; nobody can walk them under the attempt limits). */
export const COLLEGE_CODE_PATTERN = /^FT[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
/**
 * The shape of codes issued before the 8-character format, which were readable by anyone through the old
 * college search. Still accepted as input only until an admin rotates them (college-codes-rotation.sql):
 * what decides is the stored value, so once a college holds a new code its old one matches nothing.
 */
export const LEGACY_COLLEGE_CODE_PATTERN = /^FT[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** A new random code, "FT" + 8 characters. The caller makes sure it is unused. */
export function generateCollegeCode(): string {
  let out = "FT";
  for (let i = 0; i < 8; i++) out += COLLEGE_CODE_ALPHABET[randomInt(COLLEGE_CODE_ALPHABET.length)];
  return out;
}

/** The TPO's fee-waiver code: 8 random characters, no "FT" prefix, so it is never mistaken for the public college code. */
export function generateTpoCode(): string {
  return Array.from({ length: 8 }, () => COLLEGE_CODE_ALPHABET[randomInt(COLLEGE_CODE_ALPHABET.length)]).join("");
}

/**
 * What a student typed, cleaned up, if it has the shape of a Findtern college code (new or legacy);
 * else null. Case, spaces, dashes, dots and underscores are ignored ("ft-7kq3 m", " FT7KQ3M8X ").
 * Shape only: whether a college holds the code is the database's answer.
 */
export function parseCollegeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const t = input.normalize("NFKC").trim().toUpperCase().replace(/[\s._-]/g, "");
  return COLLEGE_CODE_PATTERN.test(t) || LEGACY_COLLEGE_CODE_PATTERN.test(t) ? t : null;
}

/** Constant-time equality (both sides hashed first, so length does not leak either). */
export function codesEqual(typed: string, stored: string | null | undefined): boolean {
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(typed), h(stored ?? "")) && Boolean(stored);
}

/** For the audit trail: enough to tell attempts apart, never the whole code. "FT7•••••" / "short". */
export function maskCode(input: unknown): string {
  const t = typeof input === "string" ? input.normalize("NFKC").trim().toUpperCase().replace(/[\s._-]/g, "") : "";
  return t.length < 6 ? "short" : `${t.slice(0, 3)}${"•".repeat(Math.min(t.length - 3, 8))}`;
}

/** Runs `insert` with fresh codes until the unique index accepts one (23505 = duplicate). */
export async function withFreshCollegeCode<T>(insert: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await insert(generateCollegeCode());
    } catch (err) {
      const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
      const code = e.code ?? e.cause?.code;
      const constraint = e.constraint ?? e.cause?.constraint;
      if (code === "23505" && constraint === "colleges_code_unique" && attempt < 8) continue;
      throw err;
    }
  }
}
