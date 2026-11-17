/**
 * The Findtern Score - band logic.
 *
 * This is the artifact the hero is built around, so the numbers have to be
 * the real ones. They are the same constants the legacy Terms page publishes:
 * a score out of 10, and a fixed per-hire charge (which tiers pay it is the admin setting, per-hire-fee.ts).
 *
 * Boundaries are half-open - a score of exactly 6.0 is Skilled, exactly 8.0 is
 * Assured - which is how the rate card states it and how the "what you get"
 * copy in the pricing table describes it.
 */

import { inrMinorToUsdMinor } from "./currency.ts";
import { PRICING_DEFAULTS, type BandId, type PricingConfig } from "./pricing-config.ts";

export type { BandId };

export type Band = {
  id: BandId;
  name: string;
  /** Inclusive lower bound, out of 10. */
  min: number;
  /** Exclusive upper bound, out of 10. */
  max: number;
  /** Hourly rate in minor units (paise). */
  rateMinor: number;
  /** Per-hire charge in minor units when this band is charged (admin setting, per-hire-fee.ts); not what is billed on its own. */
  perHireMinor: number;
  /** One line on what this band means, used in the card. */
  blurb: string;
};

/** The per-hire charge where it applies (₹5,000 INR / $50 USD by default); which bands pay it is the admin setting (per-hire-fee.ts). */
export const PER_HIRE_CHARGE_INR = PRICING_DEFAULTS.bands[0].hireFeeInrMinor;
export const PER_HIRE_CHARGE_USD = inrMinorToUsdMinor(PER_HIRE_CHARGE_INR);
export const PER_HIRE_CUTOFF = 6;

const BAND_COPY: Record<BandId, { name: string; blurb: string }> = {
  standard: { name: "Standard", blurb: "Screened, still building." },
  skilled: { name: "Skilled", blurb: "Above the cohort median." },
  assured: { name: "Assured", blurb: "Top decile of the cohort." },
};

/** The bands as a config states them: INR money, band names and blurbs from here. */
function bandsFromConfig(config: PricingConfig): Band[] {
  return config.bands.map((b) => ({
    id: b.id,
    ...BAND_COPY[b.id],
    min: b.minScore,
    max: b.maxScore,
    rateMinor: b.hourlyInrMinor,
    perHireMinor: b.hireFeeInrMinor,
  }));
}

/** The published defaults. Anything showing a price to a visitor or employer should use `bandsForConfig` with the live config instead. */
export const BANDS: Band[] = bandsFromConfig(PRICING_DEFAULTS);

/** The bands under a live config, in INR (isIndia) or USD at ₹100 = $1. */
export function bandsForConfig(config: PricingConfig, isIndia: boolean): Band[] {
  const inr = bandsFromConfig(config);
  return isIndia
    ? inr
    : inr.map((b) => ({ ...b, rateMinor: inrMinorToUsdMinor(b.rateMinor), perHireMinor: inrMinorToUsdMinor(b.perHireMinor) }));
}

/** The plan name employers see for each band (pricing page, invoices). */
export const PLAN_NAME: Record<BandId, string> = {
  standard: "Espresso",
  skilled: "Cappuccino",
  assured: "Latte",
};

/** Which band a score falls in. */
export function bandFor(score: number): Band {
  const s = Math.max(0, Math.min(10, score));
  return BANDS.find((b) => s >= b.min && s < b.max) ?? BANDS[BANDS.length - 1];
}

/** The plan name an employer sees for a score: Espresso, Cappuccino or Latte. */
export function planNameFor(score: number): string {
  return PLAN_NAME[bandFor(score).id];
}

/* ── Regional rates ────────────────────────────────────────────────────
 * INR is the authored rate card (paise). USD is derived at ₹100 = $1 -
 * $0 / $1 / $2 hourly and a $50 per-hire charge where it applies. Geometry (min/max)
 * is identical across regions; only money moves. */

/** Same bands, USD money, at the fixed ₹100 = $1 rule (lib/currency). */
export const BANDS_USD: Band[] = BANDS.map((b) => ({
  ...b,
  rateMinor: inrMinorToUsdMinor(b.rateMinor),
  perHireMinor: inrMinorToUsdMinor(b.perHireMinor),
}));

/** The published bands for a visitor region. */
export function bandsForRegion(isIndia: boolean): Band[] {
  return isIndia ? BANDS : BANDS_USD;
}

/** Currency matching `bandsForRegion`. */
export function currencyForRegion(isIndia: boolean): "INR" | "USD" {
  return isIndia ? "INR" : "USD";
}

/** The band a score is currently in, as a 0–1 fraction across BANDS. */
export function bandPosition(score: number): number {
  const idx = BANDS.indexOf(bandFor(score));
  return BANDS.length > 1 ? idx / (BANDS.length - 1) : 0;
}

/** Cohort distribution used to place "you" on the card. */
export const DISTRIBUTION = [14, 41, 78, 132, 211, 296, 388, 274, 149, 57];
