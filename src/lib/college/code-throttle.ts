import { limiters, type RateLimiter } from "../security/rate-limit.ts";

/**
 * Attempt budget for typing a college code, the only way into a college. Every attempt counts, right or
 * wrong and before the code is looked at, so a wrong guess, a malformed one and a lucky one cost the same.
 *
 *  - 10 per 15 min per user, 30 per 15 min per address: a campus lab shares an address, one account cannot
 *    hammer from many.
 *  - 30 per 24 h per user, counting only attempts that were let through: the backoff tier. Someone who
 *    keeps guessing past the first pauses is shut out for the rest of the day, not for another 15 minutes.
 *
 * In memory, per process (see RateLimiter); production runs one instance (deploy/ecosystem.config.cjs).
 */
type Tiers = { user: RateLimiter; ip: RateLimiter; userDay: RateLimiter };

const DEFAULT_TIERS: Tiers = { user: limiters.collegeCodeUser, ip: limiters.collegeCodeIp, userDay: limiters.collegeCodeUserDay };

export type CodeThrottle = { ok: true } | { ok: false; retryAfterSeconds: number };

export function takeCodeAttempt(input: { uid: string; ip: string; now?: number }, tiers: Tiers = DEFAULT_TIERS): CodeThrottle {
  const now = input.now ?? Date.now();
  const userKey = `u:${input.uid}`;
  const ipKey = `ip:${input.ip}`;
  // Both short tiers are charged on every attempt, so neither can be probed while the other is paused.
  const userOk = tiers.user.take(userKey, now);
  const ipOk = tiers.ip.take(ipKey, now);
  if (!userOk || !ipOk) {
    return { ok: false, retryAfterSeconds: Math.max(1, userOk ? 0 : tiers.user.retryAfterSeconds(userKey, now), ipOk ? 0 : tiers.ip.retryAfterSeconds(ipKey, now)) };
  }
  // Only attempts that got past the short tiers spend the day budget: pressing the button while paused cannot lock someone out for a day.
  const dayKey = `ud:${input.uid}`;
  if (!tiers.userDay.take(dayKey, now)) return { ok: false, retryAfterSeconds: Math.max(1, tiers.userDay.retryAfterSeconds(dayKey, now)) };
  return { ok: true };
}
