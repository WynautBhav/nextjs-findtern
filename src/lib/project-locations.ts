/**
 * Preferred locations on an employer project: at most three (client QA; the
 * legacy form allowed five). Projects saved under the old limit keep their
 * list: a list over the cap is accepted when it only contains places the
 * project already had, so an unchanged (or trimmed) legacy list still saves.
 * Pure, so the onboarding form, both project routes and the tests share it.
 */
import { findContact } from "./contact-scrub.ts";
import { canonicalSkill } from "./data/skills.ts";

export const MAX_PROJECT_LOCATIONS = 3;

const key = (place: string) => place.trim().toLowerCase();

/**
 * The cities an on-site or hybrid project is looking in, for the candidates
 * filter: its main city, then the city part of each preferred location
 * ("Pune, Maharashtra" -> "Pune"). Remote projects look nowhere in particular.
 */
export function projectCities(project: { city?: string | null; locationType?: string | null; preferredLocations?: unknown }): string[] {
  if (!project.locationType || project.locationType === "remote") return [];
  const preferred = Array.isArray(project.preferredLocations) ? project.preferredLocations : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [project.city, ...preferred.map((p) => String(p ?? "").split(",")[0])]) {
    const city = String(raw ?? "").trim();
    if (city && !seen.has(key(city))) {
      seen.add(key(city));
      out.push(city);
    }
  }
  return out;
}

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

export function isProjectOpen(status: string | null | undefined, takenDownAt?: Date | string | null): boolean {
  // A listing Findtern took down keeps status "active" but takes no offers.
  if (takenDownAt) return false;
  const s = String(status ?? "").trim().toLowerCase();
  return !(CLOSED_PROJECT_STATUSES as readonly string[]).includes(s);
}

/**
 * Pause and Close (OA8). "inactive" is a pause the employer can undo;
 * "closed" is final. Anything else is read as active (legacy rule above).
 */
export const PAUSED_PROJECT_STATUS = "inactive";
export const FINAL_PROJECT_STATUS = "closed";

export function isProjectClosedForGood(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === FINAL_PROJECT_STATUS;
}

/**
 * Whether a listing may show in discovery and on the public pages: status
 * "active" and not taken down by Findtern. The caller also checks that the
 * employer is active and a real (non-test) one, in SQL.
 */
export function isListingLive(p: { status?: string | null; takenDownAt?: Date | string | null }): boolean {
  return String(p.status ?? "").trim().toLowerCase() === "active" && !p.takenDownAt;
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

/**
 * Project skills come from the shared list, so matching works. Each skill is
 * stored in the list's spelling. A skill the project already has stays as it
 * is, so a legacy project with free-text skills can still be edited.
 */
export function resolveProjectSkills(
  next: readonly string[],
  stored: readonly string[] = [],
): { skills: string[]; error: string | null } {
  const skills: string[] = [];
  const unknown: string[] = [];
  for (const raw of next) {
    const value = raw.trim();
    if (!value) continue;
    const kept = stored.find((s) => s.trim().toLowerCase() === value.toLowerCase());
    const found = kept ?? canonicalSkill(value);
    if (found) {
      if (!skills.some((s) => s.toLowerCase() === found.toLowerCase())) skills.push(found);
    } else unknown.push(value);
  }
  return { skills, error: unknown.length ? `Pick skills from the list: ${unknown.join(", ")}.` : null };
}

/* ── Project place (EMH-14, EMH-48) ─────────────────────────────────────
 * On-site and hybrid roles need a city and a state, inside India: the
 * candidates are India-based, so a foreign on-site project matches nobody.
 * Remote roles carry no place. */

export const INDIA_ONLY_NOTE = "Candidates are India-based. Please select only cities and states within India.";

export function projectPlaceError(
  p: { locationType?: string | null; city?: string | null; state?: string | null },
  indianStates: readonly string[],
  /** The districts of a state; when given, the city must be one of them (the routes pass it, the form does not). */
  districtsOf?: (state: string) => readonly string[],
): string | null {
  const mode = String(p.locationType ?? "").trim();
  if (!mode || mode === "remote") return null;
  const city = String(p.city ?? "").trim();
  const state = String(p.state ?? "").trim();
  if (!state) return "Pick the state for an on-site or hybrid role.";
  if (!city) return "Pick the city for an on-site or hybrid role.";
  if (!indianStates.some((s) => s.toLowerCase() === state.toLowerCase())) return INDIA_ONLY_NOTE;
  if (districtsOf && !districtsOf(state).some((d) => d.toLowerCase() === city.toLowerCase())) {
    return `Pick a city in ${state} from the list.`;
  }
  return null;
}

/* ── Listing description and status changes (OA8) ───────────────────── */

export const MAX_PROJECT_DESCRIPTION = 2000;

/** Error message for this description, or null. Contact details are refused, not hidden. */
export function projectDescriptionError(text: string | null | undefined): string | null {
  const value = String(text ?? "");
  if (value.length > MAX_PROJECT_DESCRIPTION) return `Keep the description under ${MAX_PROJECT_DESCRIPTION} characters.`;
  if (findContact(value).kinds.length === 0) return null;
  return "Remove the phone number / email / link from the description: candidates contact you through Findtern.";
}

/**
 * Why an employer may not move a listing to `next`, or null when it may.
 * Taken-down listings stay down until an admin restores them; a closed
 * listing is final (use a new one).
 */
export function projectStatusChangeError(
  project: { status?: string | null; takenDownAt?: Date | string | null; takenDownReason?: string | null },
  next: "active" | "inactive" | "closed",
): string | null {
  if (project.takenDownAt && next === "active") {
    return `Findtern took this listing down: ${project.takenDownReason || "no reason recorded"}. Contact support.`;
  }
  const current = String(project.status ?? "").trim().toLowerCase();
  if (isProjectClosedForGood(current) && next !== "closed") {
    return "This listing is closed for good. Create a new listing instead.";
  }
  return null;
}
