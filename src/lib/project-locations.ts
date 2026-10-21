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
