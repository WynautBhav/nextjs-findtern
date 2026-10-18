import type { Offer } from "./offer.ts";

/**
 * What an employer pays for one accepted proposal. Same rules as the legacy
 * order route (routes.ts ~15184), because both apps bill the same rows:
 *
 * - Score below 6: flat per-hire charge (₹5,000 / $50) unless the offer
 *   already carries a total; no stipend-plan discount; no monthly plan.
 * - Score 6+: no per-hire charge; paying upfront for more than one month
 *   takes 10% off.
 * - Full-time offer: 8.33% of annual CTC, upfront only.
 *
 * All amounts are minor units of the offer currency.
 */

export type PayMode = "upfront" | "monthly";

export const LOW_SCORE_PER_HIRE_MINOR = { INR: 500_000, USD: 5_000 } as const;
export const UPFRONT_DISCOUNT = 0.1;
export const FULL_TIME_FEE = 0.0833;

export type LineCharge = {
  baseMinor: number;
  discountMinor: number;
  totalMinor: number;
  perHireMinor: number;
  /** Why monthly isn't offered for this line, if it isn't. */
  monthlyBlocked: string | null;
};

export function lineCharge(offer: Offer, score: number, mode: PayMode = "upfront"): LineCharge {
  const lowScore = !(score >= 6);
  const perHireMinor = lowScore ? LOW_SCORE_PER_HIRE_MINOR[offer.currency] : 0;
  const monthlyBlocked = offer.fullTime
    ? "Full-time offers are paid upfront"
    : lowScore
      ? "Monthly payment needs a Findtern Score of 6 or more"
      : null;

  if (offer.fullTime) {
    const base = Math.round((offer.fullTime.annualCtcMinor ?? 0) * FULL_TIME_FEE);
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor: 0, monthlyBlocked };
  }

  if (mode === "monthly" && !monthlyBlocked) {
    const base = (offer.monthlyMinor ?? 0) + perHireMinor;
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
  }

  const base =
    offer.totalMinor != null
      ? offer.totalMinor
      : (offer.monthlyMinor ?? 0) * offer.months + perHireMinor;
  const discountMinor = !lowScore && offer.months > 1 ? Math.round(base * UPFRONT_DISCOUNT) : 0;
  return { baseMinor: base, discountMinor, totalMinor: base - discountMinor, perHireMinor, monthlyBlocked };
}

