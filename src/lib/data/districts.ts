/**
 * Indian districts, for the location picker.
 *
 * 750 rows carried over from the legacy `cityStatePincode.json`. That file was
 * 151KB because it also carried population, area, density and two codes no
 * screen read; this keeps the district, its state and the state code, which is
 * everything the picker and the auto-filled state field need — 47KB instead.
 *
 * Why it matters: a free-text city field means "Bengaluru", "Bangalore" and
 * "bangalore" are three locations, and an employer filtering by city misses
 * candidates. Same argument as the skills vocabulary.
 */
import rows from "./districts.json" with { type: "json" };

export type District = {
  district: string;
  state: string;
  stateCode: string;
};

export const DISTRICTS: District[] = rows;

export const STATES: string[] = Array.from(new Set(DISTRICTS.map((d) => d.state))).sort();

/** Districts matching a district or state query, capped for the dropdown. */
export function suggestDistricts(query: string, limit = 8): District[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const districtHits: District[] = [];
  const stateHits: District[] = [];
  for (const row of DISTRICTS) {
    const d = row.district.toLowerCase();
    const s = row.state.toLowerCase();
    if (d.startsWith(q)) districtHits.push(row);
    else if (s.startsWith(q)) stateHits.push(row);
    if (districtHits.length >= limit) break;
  }
  return [...districtHits, ...stateHits].slice(0, limit);
}

/** The state a named district belongs to — used to auto-fill the state field. */
export function stateForDistrict(name: string): string | null {
  const q = name.trim().toLowerCase();
  return DISTRICTS.find((d) => d.district.toLowerCase() === q)?.state ?? null;
}