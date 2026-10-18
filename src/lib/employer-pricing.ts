import type { pricingPlans } from "@/lib/db/schema";
import { inrMinorToUsdMinor } from "@/lib/currency";
import { BANDS, bandFor, bandsForRegion } from "@/lib/score";

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
 *   2. `BANDS` in `lib/score.ts` - the published rate, when no CMS row matches.
 *
 * The result reports which one it used, so a CMS price is never mistaken for a
 * hard-coded constant.
 */

type PlanRow = typeof pricingPlans.$inferSelect;

export type Currency = "INR" | "USD";

export { employerRegion, type Region } from "./region";

export type Pricing = {
  bandName: string;
  bandBlurb: string;
  hourlyRateMinor: number;
  perHireMinor: number;
  source: "plan" | "default";
};

/* Slug fragments that identify a band in the CMS. `pricing_plans.slug` is
 * admin-authored and has no enum behind it, so match loosely and fall back to
 * price ordering when nothing matches. */
const SLUG_HINTS: Record<string, string[]> = {
  standard: ["espresso", "standard", "basic", "starter", "low", "tier1", "tier-1"],
  skilled: ["cappuccino", "skilled", "intermediate", "mid", "plus", "tier2", "tier-2"],
  assured: ["latte", "assured", "premium", "pro", "high", "tier3", "tier-3"],
};

/**
 * @param region  Kept for callers; pricing no longer varies by region beyond
 *   currency, which `currency` already carries.
 */
export function resolvePricing(
  score: number,
  plans: PlanRow[],
  currency: Currency,
  region: "IN" | null,
): Pricing {
  const band = bandFor(score);
  // The CMS fallback must be in the employer's currency: INR band minors
  // formatted as USD once quoted a $100/hr rate that should have been $1.
  const fallbackBand =
    bandsForRegion(currency === "INR").find((b) => b.id === band.id) ?? band;
  const fallback: Pricing = {
    bandName: fallbackBand.name,
    bandBlurb: fallbackBand.blurb,
    hourlyRateMinor: fallbackBand.rateMinor,
    perHireMinor: fallbackBand.perHireMinor,
    source: "default",
  };

  // Only INR rows are authored; USD is derived at ₹100 = $1 (lib/currency),
  // so the two regions can never quote different prices for the same band.
  const inrPlans = plans.filter(
    (plan) => plan.isActive && plan.currency.toUpperCase() === "INR",
  );
  if (inrPlans.length === 0) return fallback;

  const scoped = inrPlans.filter((plan) => (plan.region ?? null) === "IN");
  const pool = scoped.length > 0 ? scoped : inrPlans;
  void region;

  const bandIndex = BANDS.findIndex((entry) => entry.id === band.id);
  const hints = SLUG_HINTS[band.id] ?? [];

  const bySlug = pool.find((plan) => {
    const slug = plan.slug.toLowerCase();
    return hints.some((hint) => slug.includes(hint));
  });
  const plan =
    bySlug ??
    // No slug matched. Plans are priced in ascending order across the three
    // bands, so index into the sorted list instead of guessing again.
    [...pool].sort((a, b) => a.priceHourlyMinor - b.priceHourlyMinor)[Math.max(0, bandIndex)];

  if (!plan) return fallback;

  const convert = currency === "USD" ? inrMinorToUsdMinor : (minor: number) => minor;
  return {
    bandName: plan.displayName || band.name,
    bandBlurb: band.blurb,
    hourlyRateMinor: convert(plan.priceHourlyMinor),
    perHireMinor: convert(plan.perHireChargeMinor),
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
