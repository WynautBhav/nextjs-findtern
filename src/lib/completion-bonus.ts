import { rawScore } from "./employer-candidates.ts";
import { engagementPeriods, uncoveredParts, type Period } from "./employer-timesheets.ts";
import { addDaysIso } from "./admin/payout-run.ts";
import { postpaidAnchor } from "./billing-plan.ts";

/** Findtern-paid cash on completion, INR paise, by the score BEFORE the +1. Constants, not settings. */
export const BONUS_MINOR = { standard: 200000, skilled: 250000, assured: 300000 } as const;
export type BonusBand = keyof typeof BONUS_MINOR;

/** Below 6 standard, 6 up to (not including) 8 skilled, 8 and up assured. */
export function bonusBand(scoreBefore: number | null): BonusBand {
  const s = scoreBefore ?? 0;
  return s >= 8 ? "assured" : s >= 6 ? "skilled" : "standard";
}

/**
 * The completion bonus an intern can expect, shown on the offer before they accept (settled pricing: 6 to under 8 is
 * ₹2,500, 8 and up is ₹3,000). Null when none is promised: full-time, unscored, or below 6.
 */
export function offerBonusMinor(score: number | null, opts: { fullTime: boolean }): number | null {
  if (opts.fullTime || score === null || !Number.isFinite(score) || score < 6) return null;
  return BONUS_MINOR[bonusBand(score)];
}

export const bonusDueDate = (todayIst: string) => addDaysIso(todayIst, 7);

/** What a completion pays, or null when no bonus is owed (second approval, full-time, ended early). */
export function completionBonusPlan(i: {
  alreadyGranted: boolean;
  fullTime: boolean;
  ended: boolean;
  extra: Record<string, unknown>;
}): { bandId: BonusBand; amountMinor: number; scoreBefore: number | null } | null {
  if (i.alreadyGranted || i.fullTime || i.ended) return null;
  const scoreBefore = rawScore(i.extra);
  const bandId = bonusBand(scoreBefore);
  return { bandId, amountMinor: BONUS_MINOR[bandId], scoreBefore };
}

/**
 * Every engagement month is covered by approved sheets (legacy calendar-month sheets included).
 * An offer with no start date counts months from the IST day of the hire (`hiredAt`), the same
 * anchor billing-plan.ts uses (postpaidAnchor); with neither date there is nothing to count from.
 */
export function isEngagementComplete(
  startDate: string | null,
  months: number,
  approved: Period[],
  hiredAt?: Date | string | null,
): boolean {
  const start = postpaidAnchor(startDate, hiredAt);
  if (!start) return false;
  return engagementPeriods(start, months).every((p) => uncoveredParts(p, approved).length === 0);
}
