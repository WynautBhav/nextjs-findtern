import type { Offer } from "./offer.ts";

/**
 * What an employer pays for one accepted proposal. Same base rules as the
 * legacy order route (routes.ts ~15184), because both apps bill the same rows:
 *
 * - One-time hiring fee (₹5,000 / $50, or what the offer was priced with) on
 *   every internship hire, charged once with the first payment (bug sheet
 *   23 Oct; the rate card already showed it on every plan).
 * - Score below 6: no stipend-plan discount and no monthly plan.
 * - Paying the whole engagement upfront carries no discount (bug sheet
 *   26 Oct removed the 10% upfront discount); upfront and monthly differ only
 *   in when the money is paid.
 * - Full-time offer: 8.33% of annual CTC, upfront only, no separate fee.
 *
 * All amounts are minor units of the offer currency.
 */

export type PayMode = "upfront" | "monthly";

export const PER_HIRE_MINOR = { INR: 500_000, USD: 5_000 } as const;
export const FULL_TIME_FEE = 0.0833;

export type LineCharge = {
  /** Engagement plus the hiring fee, before any discount. */
  baseMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** The one-time hiring fee in this charge (0 after the first payment). */
  perHireMinor: number;
  /** Why monthly isn't offered for this line, if it isn't. */
  monthlyBlocked: string | null;
};

export function lineCharge(
  offer: Offer,
  score: number,
  mode: PayMode = "upfront",
  opts: { firstPayment?: boolean } = {},
): LineCharge {
  const lowScore = !(score >= 6);
  const firstPayment = opts.firstPayment ?? true;
  const monthlyBlocked = offer.fullTime
    ? "Full-time offers are paid upfront"
    : lowScore
      ? "Monthly payment needs a Findtern Score of 6 or more"
      : null;

  if (offer.fullTime) {
    const base = Math.round((offer.fullTime.annualCtcMinor ?? 0) * FULL_TIME_FEE);
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor: 0, monthlyBlocked };
  }

  // The fee the offer was priced with, or the standard one (offers sent to
  // 6+ candidates before this rule stored none).
  const fee = (offer.perHireMinor ?? 0) > 0 ? offer.perHireMinor! : PER_HIRE_MINOR[offer.currency];
  const perHireMinor = firstPayment ? fee : 0;

  if (mode === "monthly" && !monthlyBlocked) {
    const base = (offer.monthlyMinor ?? 0) + perHireMinor;
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
  }

  // A stored total already carries whatever fee the offer was sent with.
  const engagement =
    offer.totalMinor != null
      ? Math.max(0, offer.totalMinor - (offer.perHireMinor ?? 0))
      : (offer.monthlyMinor ?? 0) * offer.months;
  const base = engagement + perHireMinor;
  return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
}
