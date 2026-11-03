import { randomInt } from "node:crypto";

/** No 0/O/1/I/L: a code read aloud or off a poster cannot be mistyped. */
export const COLLEGE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const COLLEGE_CODE_PATTERN = /^FT[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

/** A new random code, "FT" + 5 characters. The caller makes sure it is unused. */
export function generateCollegeCode(): string {
  let out = "FT";
  for (let i = 0; i < 5; i++) out += COLLEGE_CODE_ALPHABET[randomInt(COLLEGE_CODE_ALPHABET.length)];
  return out;
}

/** What a student typed, if it looks like a Findtern college code ("ft7kq3m", " FT-7KQ3M "); else null. */
export function parseCollegeCode(input: string): string | null {
  const t = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return COLLEGE_CODE_PATTERN.test(t) ? t : null;
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
