import type { CmsPlan } from "@/lib/content/types";
import { scheduledMonthlyHours } from "./offer.ts";
import { PER_HIRE_FEE_DEFAULT, perHireChargedFor, type PerHireFeeSetting } from "./per-hire-fee.ts";

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
 * Whether the one-time hiring fee is waived ("free for now") for a plan slug
 * or score band id, under the admin setting (lib/per-hire-fee.ts). The setting
 * is the one source: billing, offers and every public price line read it, so
 * this can no longer drift from what is charged. Without a setting the
 * defaults apply (Espresso charged, Cappuccino and Latte free).
 */
export function perHireFreeForNow(slugOrBand: string | null | undefined, setting: PerHireFeeSetting = PER_HIRE_FEE_DEFAULT): boolean {
  return !perHireChargedFor(slugOrBand, setting);
}

/* ── Monthly arithmetic ────────────────────────────────────────────────
 * Marketing figures use the same billed month as a real offer (offer.ts):
 * Mon–Fri is 22 working days × 8 h = 176 h, Mon–Sat 26 × 8 = 208 h. */
export const HOURS_PER_MONTH = scheduledMonthlyHours("mon_fri", 0);
