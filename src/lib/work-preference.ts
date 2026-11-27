import { stateForDistrict } from "./data/districts.ts";
import { WORK_MODE_ORDER, workModes } from "./onboarding.ts";
import { bandFor } from "./score.ts";

/**
 * Where a candidate is willing to work, as an offer has to respect it (bug
 * sheet 23 Oct: "work location will be based on candidate preference").
 *
 * `modes` is the stored implied set (onsite ⇒ hybrid + remote, hybrid ⇒
 * remote). `cities` are the preferred work cities, split into the city and
 * state an offer stores; a bare district name gets its state from the list.
 */
export type WorkPreference = {
  modes: string[];
  cities: { label: string; city: string; state: string }[];
  /** A free-band (Standard, no hourly rate) candidate: remote offers only (bug sheet 30 Oct). */
  freeBand?: boolean;
};

export function workPreferenceOf(
  row: { locationTypes?: unknown; preferredLocations?: unknown } | null | undefined,
  /** The candidate's Findtern Score; 0 or missing means unscored, which is not the free band. */
  score?: number | null,
): WorkPreference {
  const modes = workModes(Array.isArray(row?.locationTypes) ? row.locationTypes.map(String) : []);
  const raw = Array.isArray(row?.preferredLocations) ? row.preferredLocations.map(String) : [];
  const seen = new Set<string>();
  const cities: WorkPreference["cities"] = [];
  for (const entry of raw) {
    const label = entry.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const comma = label.lastIndexOf(",");
    const city = (comma === -1 ? label : label.slice(0, comma)).trim();
    const state = (comma === -1 ? stateForDistrict(label) ?? "" : label.slice(comma + 1)).trim();
    cities.push({ label, city, state });
  }
  const freeBand = typeof score === "number" && score > 0 && bandFor(score).rateMinor === 0;
  return { modes, cities, ...(freeBand ? { freeBand } : {}) };
}

/**
 * The modes an offer may use: the candidate's most on-site mode and every less on-site one (open to on-site means open
 * to hybrid and remote too; bug 27 Nov), or all three when they never said. Implied here, not only where the profile
 * saves, because stored rows don't always hold the implied modes.
 */
export function offerableModes(pref: WorkPreference): string[] {
  if (pref.freeBand) return ["remote"];
  const widest = Math.max(...pref.modes.map((m) => WORK_MODE_ORDER.indexOf(m as (typeof WORK_MODE_ORDER)[number])));
  return widest >= 0 ? WORK_MODE_ORDER.slice(0, widest + 1) : [...WORK_MODE_ORDER];
}

/** Null when the offer's mode fits the candidate, else what to tell the employer. */
export function modeProblem(pref: WorkPreference, mode: string): string | null {
  const allowed = offerableModes(pref);
  if (allowed.includes(mode)) return null;
  const label = (m: string) => (m === "onsite" ? "on-site" : m);
  if (pref.freeBand) return "This candidate is in the free Standard band, which is offered for remote work only.";
  return `This candidate is open to ${allowed.map(label).join(" or ")} work only.`;
}
