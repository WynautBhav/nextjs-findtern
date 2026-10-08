import type { pricingPlans } from "@/lib/db/schema";
import { BANDS, bandFor } from "@/lib/score";

/**
 * What a candidate costs, derived from their Findtern Score.
 *
 * One place, because four screens need the same answer — the proposal composer,
 * the cart, the checkout summary, and the candidate browser. The legacy build
 * recomputed it inline in each (the `getCandidateHourlyRate` /
 * `getCandidatePerHireChargeAmount` pair appears three times in
 * `employer-send-proposal.tsx` alone) and they drifted.
 *
 * Source of truth, in order:
 *   1. `pricing_plans` — the admin-editable CMS rate card.
 *   2. `BANDS` in `lib/score.ts` — the published rate, when no CMS row matches.
 *
 * The result reports which one it used, so a CMS price is never mistaken for a
 * hard-coded constant.
 */

type PlanRow = typeof pricingPlans.$inferSelect;

export type Currency = "INR" | "USD";

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
  standard: ["standard", "basic", "starter", "low", "tier1", "tier-1"],
  skilled: ["skilled", "intermediate", "mid", "plus", "tier2", "tier-2"],
  assured: ["assured", "premium", "pro", "high", "tier3", "tier-3"],
};

/**
 * @param region  "IN" for an India-based employer, otherwise null. A
 *   region-scoped plan wins over a global one; a global plan is the fallback.
 */
export function resolvePricing(
  score: number,
  plans: PlanRow[],
  currency: Currency,
  region: "IN" | null,
): Pricing {
  const band = bandFor(score);
  const fallback: Pricing = {
    bandName: band.name,
    bandBlurb: band.blurb,
    hourlyRateMinor: band.rateMinor,
    perHireMinor: band.perHireMinor,
    source: "default",
  };

  const currencyMatches = plans.filter(
    (plan) =>
      plan.isActive && plan.currency.toUpperCase() === currency,
  );
  if (currencyMatches.length === 0) return fallback;

  const scoped = currencyMatches.filter((plan) => (plan.region ?? null) === region);
  const pool =
    scoped.length > 0
      ? scoped
      : currencyMatches.filter((plan) => plan.region === null || plan.region === undefined);
  if (pool.length === 0) return fallback;

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

  return {
    bandName: plan.displayName || band.name,
    bandBlurb: band.blurb,
    hourlyRateMinor: plan.priceHourlyMinor,
    perHireMinor: plan.perHireChargeMinor,
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
