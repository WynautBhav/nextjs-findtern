/**
 * The Findtern Score - band logic.
 *
 * This is the artifact the hero is built around, so the numbers have to be
 * the real ones. They are the same constants the legacy Terms page publishes:
 * a score out of 10, and a per-hire charge that applies only below 6.
 *
 * Boundaries are half-open - a score of exactly 6.0 is Skilled, exactly 8.0 is
 * Assured - which is how the rate card states it and how the "what you get"
 * copy in the pricing table describes it.
 */

export type BandId = "standard" | "skilled" | "assured";

export type Band = {
  id: BandId;
  name: string;
  /** Inclusive lower bound, out of 10. */
  min: number;
  /** Exclusive upper bound, out of 10. */
  max: number;
  /** Hourly rate in minor units (paise). */
  rateMinor: number;
  /** Flat per-hire charge in minor units. Zero above the cutoff. */
  perHireMinor: number;
  /** One line on what this band means, used in the card. */
  blurb: string;
};

/** Score at or above which the per-hire charge is waived. */
export const PER_HIRE_CUTOFF = 6;
export const BANDS: Band[] = [
  {
    id: "standard",
    name: "Standard",
    min: 0,
    max: 6,
    rateMinor: 0,
    perHireMinor: 500000,
    blurb: "Screened, still building.",
  },
  {
    id: "skilled",
    name: "Skilled",
    min: 6,
    max: 8,
    rateMinor: 10000,
    perHireMinor: 0,
    blurb: "Above the cohort median.",
  },
  {
    id: "assured",
    name: "Assured",
    min: 8,
    max: 10,
    rateMinor: 20000,
    perHireMinor: 0,
    blurb: "Top decile of the cohort.",
  },
];

/** Which band a score falls in. */
export function bandFor(score: number): Band {
  const s = Math.max(0, Math.min(10, score));
  return BANDS.find((b) => s >= b.min && s < b.max) ?? BANDS[BANDS.length - 1];
}

/* ── Regional rates ────────────────────────────────────────────────────
 * INR is the authored rate card (paise). USD mirrors it in whole dollars -
 * $0 / $1 / $2 hourly and a $50 per-hire charge - matching the USD rows of
 * the `pricing_plans` seed. Figures are always rounded UP to whole major
 * units ("next big number"): a rate card that reads $1.20/hr invites
 * negotiation, which the product explicitly refuses. Geometry (min/max) is
 * identical across regions; only money moves. */

/** Same bands, USD money. Authored, not converted at render time, so the
 *  card can never show $1.13/hr because someone edited the INR seed. */
export const BANDS_USD: Band[] = BANDS.map((b) => ({
  ...b,
  rateMinor: { standard: 0, skilled: 100, assured: 200 }[b.id] ?? 0,
  perHireMinor: b.perHireMinor > 0 ? 5000 : 0,
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
