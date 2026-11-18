/**
 * What a promo code is right now, how full it is and when it ends. Pure (no DB, no React), so the ledger, the
 * lead figures and the tests read the same rules.
 *
 * State order: a code at its limit is "used up", whatever else is true (that is the count the page's "Used up"
 * figure gives); then past its end date "expired"; then switched off "paused"; otherwise "active".
 */

export type PromoState = "active" | "paused" | "used_up" | "expired";

export type PromoStateInput = {
  isActive: boolean;
  maxUsages: number | null;
  usedCount: number;
  validUntil: Date | string | null;
};

export const isUsedUp = (p: Pick<PromoStateInput, "maxUsages" | "usedCount">): boolean => Boolean(p.maxUsages) && p.usedCount >= (p.maxUsages as number);

export function promoState(p: PromoStateInput, now: Date = new Date()): PromoState {
  if (isUsedUp(p)) return "used_up";
  const until = p.validUntil ? new Date(p.validUntil).getTime() : null;
  if (until !== null && !Number.isNaN(until) && until < now.getTime()) return "expired";
  return p.isActive ? "active" : "paused";
}

/** The true share of the limit that is used, 0 to 1; null when the code has no limit (no bar is drawn). */
export function usedShare(p: Pick<PromoStateInput, "maxUsages" | "usedCount">): number | null {
  if (!p.maxUsages || p.maxUsages <= 0) return null;
  return Math.min(1, Math.max(0, p.usedCount / p.maxUsages));
}

const DAY = 86_400_000;

/** "no expiry", "in 6 days", "tomorrow", "today", "3 days ago": whole days from now, so a date never reads in hours. */
export function expiryRelative(validUntil: Date | string | null, now: Date = new Date()): string {
  if (!validUntil) return "no expiry";
  const t = new Date(validUntil).getTime();
  if (Number.isNaN(t)) return "no expiry";
  const diff = t - now.getTime();
  if (diff >= 0) {
    const ahead = Math.floor(diff / DAY);
    return ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : ahead < 60 ? `in ${ahead} days` : `in ${Math.floor(ahead / 30)} months`;
  }
  const days = Math.floor(-diff / DAY);
  return days === 0 ? "earlier today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : `${Math.floor(days / 30)} months ago`;
}
