import { MAX_MINOR } from "../pricing-config.ts";
import { FEE_BAND_LABEL } from "../per-hire-fee.ts";
import { legacyBandChange } from "./plan-band.ts";

/**
 * What the pricing editor's forms hold (rupee strings as typed) and the rules that
 * turn them into the PATCH/PUT bodies. Pure, so autosave can ask "is this draft
 * valid, and is it different from what is saved?" without the DOM, and the
 * messages are covered by `node --test`.
 */

export const PRICE_ERROR = "Enter a price in rupees, like 450 or 99.50.";

/** Rupees as the form shows them: "" for no value. */
export const toRupees = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));

/** Paise for a typed rupee amount; null when it is blank, not a number, or beyond what the API stores. */
export function parseRupees(raw: string): number | null {
  const t = raw.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const minor = Math.round(Number(t) * 100);
  return Number.isFinite(minor) && minor <= MAX_MINOR ? minor : null;
}

/** Whole rupees only (a stipend is a round monthly figure): paise, or null when blank, not an integer, or over the cap. */
export function parseWholeRupees(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const minor = Number(t) * 100;
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

/** Same price: 100 and 100.00 are equal; text that does not parse only equals itself (so a bad value still differs from a good one). */
export function rupeesEq(a: string, b: string): boolean {
  const x = parseRupees(a);
  const y = parseRupees(b);
  return x !== null || y !== null ? x === y : a.trim() === b.trim();
}

/** The same for whole-rupee fields (stipends). */
export function wholeRupeesEq(a: string, b: string): boolean {
  const x = parseWholeRupees(a);
  const y = parseWholeRupees(b);
  return x !== null || y !== null ? x === y : a.trim() === b.trim();
}

/* ---------- one plan card ---------- */

export type PlanDraft = {
  name: string;
  hourly: string;
  hourlyWas: string;
  perHire: string;
  perHireWas: string;
  duration: string;
  features: string[];
  featureList: { label: string; included: boolean }[];
  active: boolean;
};

type PlanLike = {
  displayName: string;
  priceHourlyMinor: number;
  perHireChargeMinor: number;
  compareAtHourlyMinor: number | null;
  compareAtPerHireMinor: number | null;
  internshipDuration: string;
  features: string[];
  featureList: { label: string; included: boolean }[];
  isActive: boolean;
};

export function planDraftFromPlan(p: PlanLike): PlanDraft {
  return {
    name: p.displayName,
    hourly: toRupees(p.priceHourlyMinor),
    hourlyWas: toRupees(p.compareAtHourlyMinor),
    perHire: toRupees(p.perHireChargeMinor),
    perHireWas: toRupees(p.compareAtPerHireMinor),
    duration: p.internshipDuration,
    features: [0, 1, 2].map((i) => p.features[i] ?? ""),
    featureList: p.featureList,
    active: p.isActive,
  };
}

/** A price compared as paise when it parses (100 = 100.00), as typed otherwise (so a bad value still differs from a good one). */
const priceKey = (raw: string) => {
  const m = parseRupees(raw);
  return m === null ? `?${raw.trim()}` : m;
};
const nonBlankRows = (rows: PlanDraft["featureList"]) => rows.filter((f) => f.label.trim());

export function planDraftEq(a: PlanDraft, b: PlanDraft): boolean {
  const key = (d: PlanDraft) =>
    JSON.stringify([
      d.name.trim(),
      priceKey(d.hourly),
      d.hourlyWas.trim() === "" ? null : priceKey(d.hourlyWas),
      priceKey(d.perHire),
      d.perHireWas.trim() === "" ? null : priceKey(d.perHireWas),
      d.duration.trim(),
      d.features.map((f) => f.trim()),
      nonBlankRows(d.featureList).map((f) => [f.label.trim(), f.included]),
      d.active,
    ]);
  return key(a) === key(b);
}

export type DraftIssue = {
  field: "name" | "hourly" | "perHire" | "hourlyWas" | "perHireWas" | "duration" | "features" | "featureList";
  message: string;
};

/** The first problem the server would refuse (or a blank/garbled price it must never be handed as ₹0); null when the draft can be saved. */
export function validatePlanDraft(d: PlanDraft, savedFeatures: readonly string[]): DraftIssue | null {
  const name = d.name.trim();
  if (!name) return { field: "name", message: "Give the plan a name." };
  if (name.length > 40) return { field: "name", message: "The name can be at most 40 characters." };
  const prices: [DraftIssue["field"], string, boolean][] = [
    ["hourly", d.hourly, true],
    ["hourlyWas", d.hourlyWas, false],
    ["perHire", d.perHire, true],
    ["perHireWas", d.perHireWas, false],
  ];
  for (const [field, raw, required] of prices) {
    if ((required || raw.trim() !== "") && parseRupees(raw) === null) return { field, message: PRICE_ERROR };
  }
  if (d.duration.trim().length > 60) return { field: "duration", message: "The duration can be at most 60 characters." };
  if (d.features.some((f) => f.trim().length > 120)) return { field: "features", message: "Each comparison row can be at most 120 characters." };
  const band = legacyBandChange(savedFeatures[1], d.features[1]);
  if (band?.block) return { field: "features", message: band.message };
  if (d.featureList.some((f) => f.label.trim().length > 120)) return { field: "featureList", message: "Each checklist row can be at most 120 characters." };
  if (nonBlankRows(d.featureList).length > 12) return { field: "featureList", message: "A card can have at most 12 checklist rows." };
  return null;
}

/** The PATCH body for a valid draft. Never carries `isFeatured`: that is one choice for the whole set, saved on its own. */
export function planPatchBody(id: string, d: PlanDraft) {
  return {
    id,
    displayName: d.name.trim(),
    priceHourlyMinor: parseRupees(d.hourly)!,
    compareAtHourlyMinor: parseRupees(d.hourlyWas),
    perHireChargeMinor: parseRupees(d.perHire)!,
    compareAtPerHireMinor: parseRupees(d.perHireWas),
    internshipDuration: d.duration,
    features: d.features,
    featureList: nonBlankRows(d.featureList),
    isActive: d.active,
  };
}

/* ---------- the settings blocks ---------- */

export function validateActivationFee(raw: string): { ok: true; minor: number } | { ok: false; message: string } {
  const minor = parseRupees(raw);
  if (minor === null) return { ok: false, message: PRICE_ERROR };
  if (minor <= 0) return { ok: false, message: "The fee must be above zero." };
  return { ok: true, minor };
}

export type StipendDraft = { skilled: string; assured: string };

export function validateStipends(
  d: StipendDraft,
):
  | { ok: true; bands: { standard: null; skilled: number; assured: number } }
  | { ok: false; field: "skilled" | "assured"; message: string } {
  const next = { skilled: 0, assured: 0 };
  for (const band of ["skilled", "assured"] as const) {
    const minor = parseWholeRupees(d[band]);
    if (minor === null) {
      return { ok: false, field: band, message: `The ${FEE_BAND_LABEL[band].plan} stipend must be a whole number of rupees, like 8000.` };
    }
    next[band] = minor;
  }
  return { ok: true, bands: { standard: null, ...next } };
}
