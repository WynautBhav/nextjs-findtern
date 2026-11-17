/**
 * Full-waiver promo codes, pure: no DB, safe for `node --test`.
 *
 * A full-waiver code makes the WHOLE payment free (monthly charge and the one-time hiring fee), for testing and
 * complimentary hires. It is a separate kind of code, never a "100%" percentage code: `discount_type = 'full_waiver'`.
 * (No schema change: that column is free text. A code of any other type is never a waiver, whatever its value.)
 *
 * Always capped: a use limit (1 to 25), an expiry (at most 30 days out) and an explicit audience. Admin create,
 * redemption and edit all check these here, and a row that breaks them (made by hand in SQL) is dead at redemption.
 */
import type { PromoRow } from "./promo-rules.ts";

export const FULL_WAIVER_TYPE = "full_waiver";
export const WAIVER_PREFIX = "FREE-";

export const FULL_WAIVER_LIMITS = { maxUsesDefault: 1, maxUsesCap: 25, expiryDaysDefault: 7, expiryDaysCap: 30 } as const;

/** 31 characters: no 0 O 1 I L, so a code read aloud or off a screenshot is typed right. */
export const WAIVER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RANDOM_CHARS = 12;
/** Bytes at or above this are thrown away: 248 = 8 x 31, so `byte % 31` is then perfectly even. */
const BYTE_LIMIT = 248;

const DAY_MS = 86_400_000;

export const isFullWaiver = (row: { discountType?: string | null } | null | undefined): boolean => row?.discountType === FULL_WAIVER_TYPE;

type RandomSource = (n: number) => Uint8Array;
const cryptoSource: RandomSource = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** `FREE-XXXX-XXXX-XXXX`: 12 characters from the alphabet (about 59 bits), drawn from the Web Crypto source (browser and Node). */
export function generateWaiverCode(random: RandomSource = cryptoSource): string {
  let body = "";
  while (body.length < RANDOM_CHARS) {
    for (const byte of random(RANDOM_CHARS * 2)) {
      if (byte >= BYTE_LIMIT) continue;
      body += WAIVER_ALPHABET[byte % WAIVER_ALPHABET.length];
      if (body.length === RANDOM_CHARS) break;
    }
  }
  return `${WAIVER_PREFIX}${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

/** The only part of a code that may appear in an audit row or a log. */
export const waiverCodeTail = (code: string): string => code.slice(-4);

/** A waiver takes the whole order: the hiring fee too (the one exception to "the fee is never discounted"). */
export function waiverPricing(orderMinor: number): { discountMinor: number; payableMinor: 0 } {
  return { discountMinor: orderMinor, payableMinor: 0 };
}

/** Admin create: why this waiver request is refused, or null. `validUntil` is an instant. */
export function waiverCreateProblem(input: { maxUsages?: number | null; validUntil?: Date | null; appliesTo?: string | null; now?: Date }): string | null {
  const now = input.now ?? new Date();
  if (input.appliesTo !== "employer" && input.appliesTo !== "intern" && input.appliesTo !== "both") return "Choose who can use this code: companies, interns or both";
  const { maxUsages } = input;
  if (maxUsages == null || !Number.isInteger(maxUsages) || maxUsages < 1) return "Max uses is required: a whole number of at least 1";
  if (maxUsages > FULL_WAIVER_LIMITS.maxUsesCap) return `A full-waiver code can be used ${FULL_WAIVER_LIMITS.maxUsesCap} times at most`;
  const until = input.validUntil;
  if (!until || Number.isNaN(until.getTime())) return "An expiry is required for a full-waiver code";
  if (until <= now) return "The expiry must be in the future";
  if (until.getTime() > now.getTime() + FULL_WAIVER_LIMITS.expiryDaysCap * DAY_MS) return `A full-waiver code can last ${FULL_WAIVER_LIMITS.expiryDaysCap} days at most`;
  return null;
}

/** Redemption: a waiver row without a cap or an expiry (or over the caps) is dead, whoever made it. Ordinary codes: null. */
export function waiverRowProblem(row: Pick<PromoRow, "discountType" | "maxUsages" | "validUntil">): string | null {
  if (!isFullWaiver(row)) return null;
  if (row.maxUsages === null || row.maxUsages < 1 || row.maxUsages > FULL_WAIVER_LIMITS.maxUsesCap || !row.validUntil) return "Invalid promo code";
  return null;
}

export const WAIVER_LOCKED = "A full-waiver code can only be turned on or off. Disable it and create a new one to change its terms.";

type WaiverTerms = { discountType: string; discountValue: number; appliesTo: string | null; maxUsages: number | null; validFrom: Date | null; validUntil: Date | null; code: string; minOrderAmountMinor: number | null };

/**
 * Admin edit: a waiver's terms (code, audience, cap, window, value) never change after create, so the caps
 * can't be walked up one edit at a time. `next` holds only what the edit sets; a value equal to what the row has is not a change.
 */
export function waiverEditProblem(
  existing: Pick<WaiverTerms, "discountType"> & Partial<WaiverTerms>,
  next: Partial<Record<keyof WaiverTerms, unknown>>,
): string | null {
  if (!isFullWaiver(existing)) return null;
  const same = (a: unknown, b: unknown) => (a instanceof Date || b instanceof Date ? new Date(a as Date).getTime() === new Date(b as Date).getTime() : (a ?? null) === (b ?? null));
  const keys: (keyof WaiverTerms)[] = ["discountType", "discountValue", "appliesTo", "maxUsages", "validFrom", "validUntil", "code", "minOrderAmountMinor"];
  const changed = keys.some((k) => next[k] !== undefined && !same(next[k], existing[k]));
  return changed ? WAIVER_LOCKED : null;
}
