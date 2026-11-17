import type { pricingPlans } from "@/lib/db/schema";
import { inrMinorToUsdMinor } from "./currency.ts";
import { perHireChargedFor, type PerHireFeeSetting } from "./per-hire-fee.ts";
import { PRICING_DEFAULTS, bandById, planForBand, type PricingConfig } from "./pricing-config.ts";
import { bandFor } from "./score.ts";

/**
 * What a candidate costs, derived from their Findtern Score.
 *
 * One place, because four screens need the same answer - the proposal composer,
 * the cart, the checkout summary, and the candidate browser. The legacy build
 * recomputed it inline in each (the `getCandidateHourlyRate` /
 * `getCandidatePerHireChargeAmount` pair appears three times in
 * `employer-send-proposal.tsx` alone) and they drifted.
 *
 * Source of truth, in order:
 *   1. `pricing_plans` - the admin-editable CMS rate card.
 *   2. the pricing config (`lib/pricing-config.ts`) - the published rate, when no CMS row matches.
 *
 * The result reports which one it used, so a CMS price is never mistaken for a
 * hard-coded constant.
 */

type PlanRow = typeof pricingPlans.$inferSelect;

export type Currency = "INR" | "USD";

export { employerRegion, type Region } from "./region.ts";

export type Pricing = {
  bandName: string;
  bandBlurb: string;
  hourlyRateMinor: number;
  /** What this candidate's hiring fee is now: the band's amount when its band is charged, else 0. */
  perHireMinor: number;
  /** The amount when the band is charged (the stored rate card), whether or not it is now. */
  perHireListMinor: number;
  /** False when the admin setting waives the fee for this band ("free for now"). */
  perHireCharged: boolean;
  source: "plan" | "default";
};

/**
 * @param region  Kept for callers; pricing no longer varies by region beyond
 *   currency, which `currency` already carries.
 * @param feeSetting  Which bands pay the hiring fee (lib/per-hire-fee.ts).
 *   Required, so no caller can price a candidate without the setting.
 * @param config  What the band is priced at when no active INR plan row
 *   matches it (lib/pricing-config.ts); the published defaults when omitted.
 */
export function resolvePricing(
  score: number,
  plans: PlanRow[],
  currency: Currency,
  region: "IN" | null,
  feeSetting: PerHireFeeSetting,
  config: PricingConfig = PRICING_DEFAULTS,
): Pricing {
  const band = bandFor(score);
  // The hiring fee follows the admin setting per band; lib/checkout.ts bills
  // it with the first payment under the same setting. A band that is off
  // prices at 0, and no fallback below may bring the amount back.
  const charged = perHireChargedFor(band.id, feeSetting);
  const priced = (listMinor: number) => ({ perHireMinor: charged ? listMinor : 0, perHireListMinor: listMinor, perHireCharged: charged });
  // Rates are in the employer's currency: INR band minors formatted as USD
  // once quoted a $100/hr rate that should have been $1. Only INR rows are
  // authored; USD is derived at ₹100 = $1 (lib/currency), so the two regions
  // can never quote different prices for the same band.
  const convert = currency === "USD" ? inrMinorToUsdMinor : (minor: number) => minor;
  const fromConfig = bandById(config, band.id);
  const fallback: Pricing = {
    bandName: band.name,
    bandBlurb: band.blurb,
    hourlyRateMinor: convert(fromConfig.hourlyInrMinor),
    ...priced(convert(fromConfig.hireFeeInrMinor)),
    source: "default",
  };
  void region;

  const plan = planForBand(plans, band.id);
  if (!plan) return fallback;

  return {
    bandName: plan.displayName || band.name,
    bandBlurb: band.blurb,
    hourlyRateMinor: convert(plan.priceHourlyMinor),
    // A stored 0 has always meant "use the band's fee": free goes through the switch only.
    ...priced(convert(plan.perHireChargeMinor) || fallback.perHireListMinor),
    source: "plan",
  };
}

/** `offer_details.duration` is a token: 1m / 2m / 3m / 6m. */
export function durationMonths(duration: string | undefined): number {
  switch (String(duration ?? "").toLowerCase()) {
    case "2m":
      return 2;
    case "3m":
      return 3;
    case "6m":
      return 6;
    default:
      return 1;
  }
}

export function normaliseCurrency(raw: string | null | undefined): Currency {
  return String(raw ?? "").trim().toUpperCase() === "USD" ? "USD" : "INR";
}
