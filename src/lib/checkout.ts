import type { Offer } from "./offer.ts";
import { perHireChargedForScore, type PerHireFeeSetting } from "./per-hire-fee.ts";

/**
 * What an employer pays for one accepted proposal. Same base rules as the
 * legacy order route (routes.ts ~15184), because both apps bill the same rows:
 *
 * - One-time hiring fee (₹5,000 / $50, or what the offer was priced with) on
 *   the internship hires whose score band is switched on in the admin setting
 *   (lib/per-hire-fee.ts), charged once with the first payment. Whether it is
 *   charged is decided here, at charge time, from the live setting and the
 *   offer's band, so an admin switch also reprices offers not yet paid.
 * - Score below 6: no stipend-plan discount and no monthly plan.
 * - Paying the whole engagement upfront carries no discount (bug sheet
 *   26 Oct removed the 10% upfront discount); upfront and monthly differ only
 *   in when the money is paid.
 * - Full-time offer: 8.33% of annual CTC, upfront only, no separate fee.
 *
 * All amounts are minor units of the offer currency.
 */

/**
 * "postpaid" (score 6+): the hiring fee + Month 1 charge now, each later month's charge due 2 days before
 * the intern's pay day (billing-plan.ts). "monthly" is only a later instalment of
 * a hire already paid on the old pay-at-start plan.
 */
export type PayMode = "upfront" | "monthly" | "postpaid";

export const PER_HIRE_MINOR = { INR: 500_000, USD: 5_000 } as const;
export const FULL_TIME_FEE = 0.0833;

/** 8.33% of the annual CTC, rounded to whole major units (legacy rounding). */
export function fullTimeFeeMinor(annualCtcMinor: number): number {
  return Math.max(0, Math.round((annualCtcMinor * FULL_TIME_FEE) / 100) * 100);
}

/**
 * Who decides the hiring fee on a charge. Money still to be collected passes
 * `feeSetting`: the fee is the offer's amount when its band is on, else 0.
 * A hire that already paid passes `feeMinor`, the fee its order recorded, so
 * a later switch never alters what was settled. Neither: the fee as stored on
 * the offer (every order made before the setting existed was charged it).
 */
export type FeeOptions = {
  firstPayment?: boolean;
  feeSetting?: PerHireFeeSetting;
  /** The score the offer's band falls back to when the offer stored none (the intern's live score). */
  bandScore?: number | null;
  /** The fee a paid order recorded for this hire; wins over `feeSetting`. */
  feeMinor?: number | null;
};

/** The hiring fee on one line (before `firstPayment`): what the offer would charge, then the setting or a recorded fee applied. */
export function hireFeeMinor(offer: Offer, opts: Pick<FeeOptions, "feeSetting" | "bandScore" | "feeMinor"> = {}): number {
  if (offer.fullTime) return 0;
  const amount = (offer.perHireMinor ?? 0) > 0 ? offer.perHireMinor! : PER_HIRE_MINOR[offer.currency];
  if (opts.feeMinor != null) return Math.max(0, Math.round(opts.feeMinor));
  if (opts.feeSetting && !perHireChargedForScore(offer.candidateScore ?? opts.bandScore, opts.feeSetting)) return 0;
  return amount;
}

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
  opts: FeeOptions = {},
): LineCharge {
  const lowScore = !(score >= 6);
  const firstPayment = opts.firstPayment ?? true;
  const monthlyBlocked = offer.fullTime
    ? "Full-time offers are paid upfront"
    : lowScore
      ? "Paying monthly needs a Findtern Score of 6 or more"
      : null;

  if (offer.fullTime) {
    // Whole rupees / dollars, as legacy rounds it (EMH-39): the quote on the
    // offer and the charge must be the same figure, and legacy dues read it.
    const base = fullTimeFeeMinor(offer.fullTime.annualCtcMinor ?? 0);
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor: 0, monthlyBlocked };
  }

  // The fee the offer was priced with, or the standard one (offers sent to
  // 6+ candidates before this rule stored none), if its band is charged.
  const fee = hireFeeMinor(offer, opts);
  const perHireMinor = firstPayment ? fee : 0;

  if (mode === "postpaid" && !monthlyBlocked) {
    // First payment: the fee + Month 1. A later month is its monthly charge alone, no fee.
    const base = firstPayment ? fee + (offer.monthlyMinor ?? 0) : (offer.monthlyMinor ?? 0);
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
  }

  if (mode === "monthly" && !monthlyBlocked) {
    const base = (offer.monthlyMinor ?? 0) + perHireMinor;
    return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
  }

  // A stored total already carries whatever fee the offer was sent with, so
  // that stored amount (not the fee charged now) comes out of it: a band
  // switched off leaves the engagement alone, and the total never goes negative.
  const engagement =
    offer.totalMinor != null
      ? Math.max(0, offer.totalMinor - (offer.perHireMinor ?? 0))
      : (offer.monthlyMinor ?? 0) * offer.months;
  const base = engagement + perHireMinor;
  return { baseMinor: base, discountMinor: 0, totalMinor: base, perHireMinor, monthlyBlocked };
}
