import { limiters, type RateLimiter } from "./security/rate-limit.ts";

/**
 * Brute-force guard on the promo field. Codes are short and typed by hand, so an account (or a pool of accounts
 * behind one address) could walk the space through the apply endpoints. Only a refused code is charged: an account
 * that types a valid code is never slowed, and a wrong guess costs the same whether the code exists or not
 * (expired, exhausted and unknown all count).
 *
 *  - 8 refused codes per 15 min per signed-in account, 30 per 15 min per address.
 *
 * In memory, per process (see RateLimiter); production runs one instance. Never bypassable, like the college code budget.
 */
type Tiers = { user: RateLimiter; ip: RateLimiter };

const DEFAULT_TIERS: Tiers = { user: limiters.promoMissUser, ip: limiters.promoMissIp };

type Who = { uid: string; ip: string; now?: number };

/** Read-only: whether this account or address has used up its refused-code budget. */
export function promoGuessBlock(who: Who, tiers: Tiers = DEFAULT_TIERS): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
  const now = who.now ?? Date.now();
  const userKey = `pu:${who.uid}`;
  const ipKey = `pi:${who.ip}`;
  const userOut = tiers.user.remaining(userKey, now) === 0;
  const ipOut = tiers.ip.remaining(ipKey, now) === 0;
  if (!userOut && !ipOut) return { blocked: false };
  return { blocked: true, retryAfterSeconds: Math.max(1, userOut ? tiers.user.retryAfterSeconds(userKey, now) : 0, ipOut ? tiers.ip.retryAfterSeconds(ipKey, now) : 0) };
}

/** Spend one unit of both budgets for a code that was refused. */
export function chargePromoMiss(who: Who, tiers: Tiers = DEFAULT_TIERS): void {
  const now = who.now ?? Date.now();
  tiers.user.take(`pu:${who.uid}`, now);
  tiers.ip.take(`pi:${who.ip}`, now);
}

/** The refusal text for a blocked account. */
export function promoBlockedMessage(retryAfterSeconds: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many codes tried. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/**
 * Full-waiver redemptions: a code that makes a payment free is worth guessing, and a leaked one is worth spraying,
 * so every attempt on one is charged (a valid code too), far tighter than the refused-code budget above:
 * 5 per hour per account, 20 per hour per address. Same keys' shape, separate limiters, so the two budgets can't starve each other.
 */
const WAIVER_TIERS: Tiers = { user: limiters.promoWaiverUser, ip: limiters.promoWaiverIp };

/** Read-only: whether this account or address has used up its full-waiver budget. */
export function waiverRedeemBlock(who: Who, tiers: Tiers = WAIVER_TIERS): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
  const now = who.now ?? Date.now();
  const userKey = `pwu:${who.uid}`;
  const ipKey = `pwi:${who.ip}`;
  const userOut = tiers.user.remaining(userKey, now) === 0;
  const ipOut = tiers.ip.remaining(ipKey, now) === 0;
  if (!userOut && !ipOut) return { blocked: false };
  return { blocked: true, retryAfterSeconds: Math.max(1, userOut ? tiers.user.retryAfterSeconds(userKey, now) : 0, ipOut ? tiers.ip.retryAfterSeconds(ipKey, now) : 0) };
}

/** Spend one unit of both full-waiver budgets. */
export function chargeWaiverRedeem(who: Who, tiers: Tiers = WAIVER_TIERS): void {
  const now = who.now ?? Date.now();
  tiers.user.take(`pwu:${who.uid}`, now);
  tiers.ip.take(`pwi:${who.ip}`, now);
}

/** The refusal text for a blocked account. */
export function waiverBlockedMessage(retryAfterSeconds: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many free-code redemptions. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}
