/**
 * The pricing single source of truth: every band's money in one shape.
 *
 * Pure (no DB, no framework), so `node --test` and client code can load it.
 * The server reads it with `getPricingConfig()` (lib/platform-settings.ts),
 * which combines the admin-editable stores:
 *   - hourly rate + hiring-fee amount: the INR `pricing_plans` rows,
 *   - which bands pay the fee: the `per_hire_fee_bands` setting,
 *   - intern stipend per band: the `intern_stipend_bands` setting,
 *   - activation fee: `intern_activation_fee_minor`.
 * Anything missing or garbled falls back to `PRICING_DEFAULTS`, which equal
 * the figures published before any of this was editable.
 *
 * Fixed on purpose (owner decision): the score cut-offs 6 and 8 and the
 * ₹100 = $1 rule (lib/currency.ts). USD is always derived, never stored.
 */

import { INR_PER_USD, inrMinorToUsdMinor } from "./currency.ts";

export type BandId = "standard" | "skilled" | "assured";
export const BAND_IDS: readonly BandId[] = ["standard", "skilled", "assured"];

export type BandConfig = {
  id: BandId;
  /** Inclusive lower bound of the score range, out of 10. Fixed. */
  minScore: number;
  /** Exclusive upper bound of the score range, out of 10. Fixed. */
  maxScore: number;
  /** Hourly rate the employer pays, INR paise. 0 is allowed (Espresso). */
  hourlyInrMinor: number;
  /** The hiring fee when the band is charged, INR paise. Always > 0: "free" is the switch, never a 0 amount. */
  hireFeeInrMinor: number;
  /** Whether the hiring fee is charged for this band now (the "free for now" switch, inverted). */
  hireFeeCharged: boolean;
  /** Fixed monthly intern stipend, INR paise; null = no stipend (below a score of 6). */
  stipendInrMinor: number | null;
};

export type PricingConfig = {
  bands: BandConfig[];
  /** Intern activation fee, INR paise, GST-inclusive. */
  activationFeeInrMinor: number;
  /** Fixed business rule, read-only. */
  inrPerUsd: number;
};

/** What each band meant before the figures were editable. */
export const PRICING_DEFAULTS: PricingConfig = {
  bands: [
    { id: "standard", minScore: 0, maxScore: 6, hourlyInrMinor: 0, hireFeeInrMinor: 500000, hireFeeCharged: true, stipendInrMinor: null },
    { id: "skilled", minScore: 6, maxScore: 8, hourlyInrMinor: 10000, hireFeeInrMinor: 500000, hireFeeCharged: false, stipendInrMinor: 800000 },
    { id: "assured", minScore: 8, maxScore: 10, hourlyInrMinor: 20000, hireFeeInrMinor: 500000, hireFeeCharged: false, stipendInrMinor: 1500000 },
  ],
  activationFeeInrMinor: 249900,
  inrPerUsd: INR_PER_USD,
};

/** The largest amount the admin may store, minor units (matches the admin route's own cap). */
export const MAX_MINOR = 100_000_000;

/* ── Reading a band ────────────────────────────────────────────────── */

export function bandById(config: PricingConfig, id: BandId): BandConfig {
  return config.bands.find((b) => b.id === id) ?? PRICING_DEFAULTS.bands.find((b) => b.id === id)!;
}

/** The band a score falls in: half-open, 6.0 is Skilled and 8.0 is Assured. Cut-offs are fixed. */
export function bandIdForScore(score: number): BandId {
  const s = Math.max(0, Math.min(10, Number(score) || 0));
  return s >= 8 ? "assured" : s >= 6 ? "skilled" : "standard";
}

export type BandMoney = {
  id: BandId;
  hourlyMinor: number;
  /** The fee when the band is charged, in `currency`. */
  hireFeeListMinor: number;
  hireFeeCharged: boolean;
  /** The fee a new offer is priced with now: the list fee when charged, else 0. */
  hireFeeMinor: number;
  /** Always INR paise: the intern is paid in INR whatever the employer's currency. */
  stipendInrMinor: number | null;
};

const convert = (currency: "INR" | "USD") => (inrMinor: number) => (currency === "USD" ? inrMinorToUsdMinor(inrMinor) : inrMinor);

/** One band's money in an employer currency (USD derived at ₹100 = $1). */
export function bandMoneyFor(config: PricingConfig, id: BandId, currency: "INR" | "USD" = "INR"): BandMoney {
  const b = bandById(config, id);
  const c = convert(currency);
  return {
    id,
    hourlyMinor: c(b.hourlyInrMinor),
    hireFeeListMinor: c(b.hireFeeInrMinor),
    hireFeeCharged: b.hireFeeCharged,
    hireFeeMinor: b.hireFeeCharged ? c(b.hireFeeInrMinor) : 0,
    stipendInrMinor: b.stipendInrMinor,
  };
}

/** The money for the band a score falls in. */
export function bandMoney(config: PricingConfig, score: number, currency: "INR" | "USD" = "INR"): BandMoney {
  return bandMoneyFor(config, bandIdForScore(score), currency);
}

/** The whole card in USD, derived from the INR one. Stipend stays INR (see BandMoney). */
export function toUsd(config: PricingConfig): BandMoney[] {
  return config.bands.map((b) => bandMoneyFor(config, b.id, "USD"));
}

/** The fixed monthly stipend for a score, INR paise; null below 6. */
export function stipendInrMinorFor(config: PricingConfig, score: number | null | undefined): number | null {
  const s = Number(score ?? 0);
  return s >= 6 ? bandById(config, bandIdForScore(s)).stipendInrMinor : null;
}

/** The per-band switch the billing code reads (lib/per-hire-fee.ts), taken from a config. */
export function feeSettingOf(config: PricingConfig): Record<BandId, boolean> {
  return { standard: bandById(config, "standard").hireFeeCharged, skilled: bandById(config, "skilled").hireFeeCharged, assured: bandById(config, "assured").hireFeeCharged };
}

/* ── Which pricing_plans row is which band ─────────────────────────── */

/* Slug fragments that identify a band in the CMS. `pricing_plans.slug` is
 * admin-authored and has no enum behind it, so match loosely. */
export const SLUG_HINTS: Record<BandId, string[]> = {
  standard: ["espresso", "standard", "basic", "starter", "low", "tier1", "tier-1"],
  skilled: ["cappuccino", "skilled", "intermediate", "mid", "plus", "tier2", "tier-2"],
  assured: ["latte", "assured", "premium", "pro", "high", "tier3", "tier-3"],
};

/** The columns of a `pricing_plans` row the config needs (structural, so a DB row fits). */
export type PlanRowLike = {
  slug: string;
  currency: string;
  isActive: boolean;
  region?: string | null;
  priceHourlyMinor: number;
  perHireChargeMinor: number;
};

/**
 * The active INR plan row for a band. Only INR rows are authored (USD is
 * derived). Rows scoped to India win over global ones; then the slug names
 * the band; failing that the rows sorted by price are indexed by band.
 */
export function planForBand<P extends PlanRowLike>(plans: readonly P[], id: BandId): P | undefined {
  const inrPlans = plans.filter((p) => p.isActive && String(p.currency).toUpperCase() === "INR");
  if (inrPlans.length === 0) return undefined;
  const scoped = inrPlans.filter((p) => (p.region ?? null) === "IN");
  const pool = scoped.length > 0 ? scoped : inrPlans;
  const hints = SLUG_HINTS[id];
  const bySlug = pool.find((p) => {
    const slug = p.slug.toLowerCase();
    return hints.some((hint) => slug.includes(hint));
  });
  if (bySlug) return bySlug;
  const bandIndex = BAND_IDS.indexOf(id);
  return [...pool].sort((a, b) => a.priceHourlyMinor - b.priceHourlyMinor)[Math.max(0, bandIndex)];
}

/* ── Parsing the stored values (tolerant, field by field) ──────────── */

export const INTERN_STIPEND_KEY = "intern_stipend_bands";
/** The stored `intern_stipend_bands` value: INR paise per band, null for no stipend. */
export type StipendBands = Record<BandId, number | null>;

export const STIPEND_BANDS_DEFAULT: StipendBands = {
  standard: PRICING_DEFAULTS.bands[0].stipendInrMinor,
  skilled: PRICING_DEFAULTS.bands[1].stipendInrMinor,
  assured: PRICING_DEFAULTS.bands[2].stipendInrMinor,
};

const isMinor = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= MAX_MINOR;

/**
 * The stored stipend value, tolerant of anything (missing row, JSON string,
 * partial object, garbage). Each band falls back to its default on its own.
 * Espresso never carries a stipend: a score below 6 is not paid one.
 */
export function parseStipendBands(raw: unknown): StipendBands {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...STIPEND_BANDS_DEFAULT };
    }
  }
  const out: StipendBands = { ...STIPEND_BANDS_DEFAULT };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (isMinor(v.skilled, 0)) out.skilled = v.skilled;
    if (isMinor(v.assured, 0)) out.assured = v.assured;
  }
  return out;
}

export type PricingSources = {
  /** All `pricing_plans` rows (inactive and USD ones are ignored). */
  plans?: readonly PlanRowLike[] | null;
  /** The parsed `per_hire_fee_bands` setting. */
  feeSetting?: Record<BandId, boolean> | null;
  /** The stored `intern_stipend_bands` value, raw. */
  stipendBands?: unknown;
  /** The stored `intern_activation_fee_minor` value, raw. */
  activationFeeMinor?: unknown;
};

/**
 * The config from whatever the stores hold. Field by field: a plan row with a
 * non-positive fee keeps the default fee (a stored 0 has always meant "use the
 * standard fee"), a bad stipend keeps the default stipend, and so on.
 */
export function parsePricingConfig(src: PricingSources = {}): PricingConfig {
  const stipends = parseStipendBands(src.stipendBands);
  const bands = PRICING_DEFAULTS.bands.map((d): BandConfig => {
    const plan = planForBand(src.plans ?? [], d.id);
    return {
      ...d,
      hourlyInrMinor: plan && isMinor(plan.priceHourlyMinor, 0) ? plan.priceHourlyMinor : d.hourlyInrMinor,
      hireFeeInrMinor: plan && isMinor(plan.perHireChargeMinor, 1) ? plan.perHireChargeMinor : d.hireFeeInrMinor,
      hireFeeCharged: typeof src.feeSetting?.[d.id] === "boolean" ? src.feeSetting[d.id] : d.hireFeeCharged,
      stipendInrMinor: stipends[d.id],
    };
  });
  const activation = Number(src.activationFeeMinor);
  return {
    bands,
    activationFeeInrMinor: isMinor(activation, 1) ? activation : PRICING_DEFAULTS.activationFeeInrMinor,
    inrPerUsd: PRICING_DEFAULTS.inrPerUsd,
  };
}

/* ── Validating an edit (the admin route and the editor share this) ── */

export type PricingIssue = { path: string; message: string };

/**
 * Whether a config is one the admin may save. Checks integers in minor units
 * within 0..MAX_MINOR, fee > 0, stipend >= 0 (null only for Espresso),
 * activation fee > 0, and that the bands are still the fixed contiguous
 * 0-6 / 6-8 / 8-10 split. Returns every issue, empty when valid.
 */
export function validatePricingConfig(config: PricingConfig): PricingIssue[] {
  const issues: PricingIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (!Array.isArray(config.bands) || config.bands.length !== PRICING_DEFAULTS.bands.length) {
    return [{ path: "bands", message: "Send all three bands." }];
  }
  PRICING_DEFAULTS.bands.forEach((d, i) => {
    const b = config.bands[i];
    if (b.id !== d.id || b.minScore !== d.minScore || b.maxScore !== d.maxScore) bad(`bands.${i}`, "The score ranges are fixed: 0-6, 6-8 and 8-10.");
    if (!isMinor(b.hourlyInrMinor, 0)) bad(`bands.${d.id}.hourlyInrMinor`, "The hourly rate must be a whole amount from 0 to 100,000,000.");
    if (!isMinor(b.hireFeeInrMinor, 1)) bad(`bands.${d.id}.hireFeeInrMinor`, "The hiring fee must be more than 0. To waive it, switch the band to free.");
    if (typeof b.hireFeeCharged !== "boolean") bad(`bands.${d.id}.hireFeeCharged`, "The free switch must be on or off.");
    if (d.id === "standard") {
      if (b.stipendInrMinor !== null) bad(`bands.${d.id}.stipendInrMinor`, "A score below 6 is not paid a stipend.");
    } else if (!isMinor(b.stipendInrMinor, 0)) {
      bad(`bands.${d.id}.stipendInrMinor`, "The stipend must be a whole amount of 0 or more.");
    }
  });
  if (!isMinor(config.activationFeeInrMinor, 1)) bad("activationFeeInrMinor", "The activation fee must be more than 0.");
  if (config.inrPerUsd !== INR_PER_USD) bad("inrPerUsd", "The USD rule is fixed at ₹100 = $1.");
  return issues;
}
