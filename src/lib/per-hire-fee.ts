/**
 * Which score bands pay the one-time hiring fee. The single source of truth:
 * checkout, the cart, offers, invoices, the calculator and every public
 * price line read this one setting, so none can disagree.
 *
 * Pure (no imports), so `node --test` can load it. The stored value lives in
 * `platform_settings` under PER_HIRE_FEE_KEY (lib/platform-settings.ts).
 * Turning a band off never rewrites a price: `pricing_plans.per_hire_charge_minor`
 * and `BANDS[].perHireMinor` stay the amount charged when the band is on.
 */

import { bandFor, type BandId } from "./score.ts";

/** The score band ids from lib/score.ts: standard 0-6, skilled 6-8, assured 8-10. */
export type FeeBand = BandId;
export type PerHireFeeSetting = Record<FeeBand, boolean>;

export const PER_HIRE_FEE_KEY = "per_hire_fee_bands";
export const FEE_BANDS: readonly FeeBand[] = ["standard", "skilled", "assured"];

/** Espresso charged; Cappuccino and Latte free for now. */
export const PER_HIRE_FEE_DEFAULT: PerHireFeeSetting = { standard: true, skilled: false, assured: false };

/** Plan names the employer sees, per band (matches PLAN_NAME in lib/score.ts). */
export const FEE_BAND_LABEL: Record<FeeBand, { plan: string; scores: string }> = {
  standard: { plan: "Espresso", scores: "0-6" },
  skilled: { plan: "Cappuccino", scores: "6-8" },
  assured: { plan: "Latte", scores: "8-10" },
};

/* Slug fragments that identify a band in the CMS. `pricing_plans.slug` is
 * admin-authored and has no enum behind it, so match loosely. */
export const SLUG_HINTS: Record<FeeBand, string[]> = {
  standard: ["espresso", "standard", "basic", "starter", "low", "tier1", "tier-1"],
  skilled: ["cappuccino", "skilled", "intermediate", "mid", "plus", "tier2", "tier-2"],
  assured: ["latte", "assured", "premium", "pro", "high", "tier3", "tier-3"],
};

/** A band id or a plan slug to its band; null when it matches neither. */
export function feeBandOf(bandOrSlug: string | null | undefined): FeeBand | null {
  const key = String(bandOrSlug ?? "").trim().toLowerCase();
  if (!key) return null;
  const exact = FEE_BANDS.find((b) => b === key);
  if (exact) return exact;
  return FEE_BANDS.find((b) => SLUG_HINTS[b].some((hint) => key.includes(hint))) ?? null;
}

/**
 * The stored value, tolerant of anything: a missing row, a JSON string, a
 * partial object or garbage. Each band falls back to the default on its own,
 * so one bad key never flips the others.
 */
export function parsePerHireFeeSetting(raw: unknown): PerHireFeeSetting {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...PER_HIRE_FEE_DEFAULT };
    }
  }
  const out = { ...PER_HIRE_FEE_DEFAULT };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const band of FEE_BANDS) {
      const v = (value as Record<string, unknown>)[band];
      if (typeof v === "boolean") out[band] = v;
    }
  }
  return out;
}

/** The band a score falls in; null when there is no usable score (missing, 0 or not a number). */
export function feeBandOfScore(score: number | null | undefined): FeeBand | null {
  const n = Number(score);
  return Number.isFinite(n) && n > 0 ? bandFor(n).id : null;
}

/** Whether the hiring fee is charged at a score. No score: charged, as before this setting existed. */
export function perHireChargedForScore(score: number | null | undefined, setting: PerHireFeeSetting): boolean {
  const band = feeBandOfScore(score);
  return band ? setting[band] : true;
}

/**
 * Whether the hiring fee is charged for a band id or plan slug. A name that
 * matches no band is charged: an unknown plan keeps the old behaviour rather
 * than silently going free.
 */
export function perHireChargedFor(bandOrSlug: string | null | undefined, setting: PerHireFeeSetting): boolean {
  const band = feeBandOf(bandOrSlug);
  return band ? setting[band] : true;
}
