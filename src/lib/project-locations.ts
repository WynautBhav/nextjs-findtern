/**
 * Preferred locations on an employer project: at most three (client QA; the
 * legacy form allowed five). Projects saved under the old limit keep their
 * list: a list over the cap is accepted when it only contains places the
 * project already had, so an unchanged (or trimmed) legacy list still saves.
 * Pure, so the onboarding form, both project routes and the tests share it.
 */
export const MAX_PROJECT_LOCATIONS = 3;

const key = (place: string) => place.trim().toLowerCase();

/** Error message for this list, or null when it may be saved. */
export function projectLocationsError(next: readonly string[], stored: readonly string[] = []): string | null {
  if (next.length <= MAX_PROJECT_LOCATIONS) return null;
  const had = new Set(stored.map(key));
  if (next.every((place) => had.has(key(place)))) return null;
  return `Pick up to ${MAX_PROJECT_LOCATIONS} preferred locations.`;
}

/* ── Project status (EMH-03) ────────────────────────────────────────────
 * Legacy writes "inactive" when a project is closed and treats every other
 * value as active (its keep-one-active rule relies on it). This build writes
 * "inactive" too, and reads closed / inactive / archived (any case) as
 * closed; blank, null and anything else stay open, as in legacy. */

export const CLOSED_PROJECT_STATUSES = ["inactive", "closed", "archived"] as const;

/** The value written when an employer closes a project. */
export const CLOSED_PROJECT_STATUS = "inactive";

export function isProjectOpen(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return !(CLOSED_PROJECT_STATUSES as readonly string[]).includes(s);
}

/* ── Project skills (EMH-13, bug sheet 7 S1 r80) ─────────────────────────
 * Legacy: at least 4 skills, at most 7. A project saved with fewer before
 * this rule may keep its list while other fields change. */

export const MIN_PROJECT_SKILLS = 4;
export const MAX_PROJECT_SKILLS = 7;

/** Error message for this skill list, or null when it may be saved. */
export function projectSkillsError(next: readonly string[], stored?: readonly string[]): string | null {
  const clean = next.map((s) => s.trim()).filter(Boolean);
  if (clean.length > MAX_PROJECT_SKILLS) return `A project can have at most ${MAX_PROJECT_SKILLS} skills.`;
  if (clean.length >= MIN_PROJECT_SKILLS) return null;
  const same =
    stored !== undefined &&
    clean.length > 0 &&
    clean.length === stored.length &&
    clean.every((s) => stored.some((t) => t.trim().toLowerCase() === s.toLowerCase()));
  return same ? null : `Add at least ${MIN_PROJECT_SKILLS} skills.`;
}

/* ── Project place (EMH-14, EMH-48) ─────────────────────────────────────
 * On-site and hybrid roles need a city and a state, inside India: the
 * candidates are India-based, so a foreign on-site project matches nobody.
 * Remote roles carry no place. */

export const INDIA_ONLY_NOTE = "Candidates are India-based. Please select only cities and states within India.";

export function projectPlaceError(
  p: { locationType?: string | null; city?: string | null; state?: string | null },
  indianStates: readonly string[],
): string | null {
  const mode = String(p.locationType ?? "").trim();
  if (!mode || mode === "remote") return null;
  const city = String(p.city ?? "").trim();
  const state = String(p.state ?? "").trim();
  if (!state) return "Pick the state for an on-site or hybrid role.";
  if (!city) return "Pick the city for an on-site or hybrid role.";
  if (!indianStates.some((s) => s.toLowerCase() === state.toLowerCase())) return INDIA_ONLY_NOTE;
  return null;
}
