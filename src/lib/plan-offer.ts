import type { CmsPlan } from "@/lib/content/types";

/**
 * The one promotional frame on the rate card.
 *
 * A plan is "on offer" when the admin has set a compare-at price above the
 * current one. The copy below is what every surface (home table, pricing
 * page, employer cards) prints beside that strikethrough, so the wording of
 * the pilot offer cannot drift between pages. Zero imports beyond the type,
 * so it is safe for `node --test`.
 */
export const PLAN_OFFER = {
  badge: "Pilot batch offer",
  note: "Discounted price for the initial batch. Normal pricing applies once the pilot closes.",
  /** Tag shown beside a price that has been struck through to zero. */
  freeTag: "Free for the pilot",
} as const;

export function planHasOffer(plan: Pick<CmsPlan, "priceHourlyMinor" | "compareAtHourlyMinor" | "perHireChargeMinor" | "compareAtPerHireMinor">): boolean {
  return (
    (plan.compareAtHourlyMinor ?? 0) > plan.priceHourlyMinor ||
    (plan.compareAtPerHireMinor ?? 0) > plan.perHireChargeMinor
  );
}

/* ── Monthly arithmetic ────────────────────────────────────────────────
 * The hourly rate is the published number; the monthly figure beside it is
 * derived from one assumption set, printed wherever the figure appears so a
 * reader can check it: 8 hours a day, 5 days a week, 4 weeks a month. */
export const WORK_MONTH = {
  hoursPerDay: 8,
  daysPerWeek: 5,
  weeksPerMonth: 4,
} as const;

export const HOURS_PER_MONTH = WORK_MONTH.hoursPerDay * WORK_MONTH.daysPerWeek * WORK_MONTH.weeksPerMonth; // 160

/** Hours in a month for a given weekly schedule. */
export function monthlyHours(hoursPerDay: number, daysPerWeek: number, weeksPerMonth = WORK_MONTH.weeksPerMonth): number {
  return Math.max(0, Math.round(hoursPerDay * daysPerWeek * weeksPerMonth));
}

/** Cost of a month of work in minor units, before the per-hire fee. */
export function monthlyCostMinor(hourlyMinor: number, hoursPerDay: number, daysPerWeek: number): number {
  return hourlyMinor * monthlyHours(hoursPerDay, daysPerWeek);
}
