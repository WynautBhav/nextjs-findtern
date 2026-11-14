import type { CmsPlan } from "@/lib/content/types";
import { scheduledMonthlyHours } from "./offer.ts";

/**
 * The 2026 offer and the monthly arithmetic, in one place.
 *
 * A plan is "on offer" when the admin has set a compare-at price above the
 * current one. Every surface derives the same answer from this, so the home
 * table, the pricing page and the employer cards cannot disagree about which
 * plan is discounted. Zero imports beyond the type, so it is safe for
 * `node --test`.
 */
export function planHasOffer(plan: Pick<CmsPlan, "priceHourlyMinor" | "compareAtHourlyMinor" | "perHireChargeMinor" | "compareAtPerHireMinor">): boolean {
  return (
    (plan.compareAtHourlyMinor ?? 0) > plan.priceHourlyMinor ||
    (plan.compareAtPerHireMinor ?? 0) > plan.perHireChargeMinor
  );
}

/**
 * The per-hire charge is shown as "free for now" on Cappuccino (6-8) and
 * Latte (8+); Espresso keeps its charge. DISPLAY ONLY: the stored charge,
 * checkout and invoices are untouched, so this must not be used for billing.
 * Takes a plan slug or, where no plan row loaded, the score band id.
 */
const PER_HIRE_FREE_FOR_NOW = new Set(["cappuccino", "latte", "skilled", "assured"]);
export function perHireFreeForNow(slugOrBand: string | null | undefined): boolean {
  return PER_HIRE_FREE_FOR_NOW.has((slugOrBand ?? "").toLowerCase());
}

/* ── Monthly arithmetic ────────────────────────────────────────────────
 * Marketing figures use the same billed month as a real offer (offer.ts):
 * Mon–Fri is 22 working days × 8 h = 176 h, Mon–Sat 26 × 8 = 208 h. */
export const HOURS_PER_MONTH = scheduledMonthlyHours("mon_fri", 0);
