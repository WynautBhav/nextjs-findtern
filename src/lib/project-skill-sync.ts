/**
 * Skills on the Candidates page only filter (bug sheet 25 Nov): the employer can drop every chip and explore freely.
 * The selected project changes only when they press "Save to project", and only with MIN_PROJECT_SKILLS to
 * MAX_PROJECT_SKILLS skills (the project route holds the same rule). Pure, so the rule is tested under plain `node --test`.
 */
import { MAX_PROJECT_SKILLS, MIN_PROJECT_SKILLS } from "./project-locations.ts";

export type ProjectSkillSave = { state: "same" } | { state: "ready" } | { state: "blocked"; message: string };

const key = (list: readonly string[]) => list.map((s) => s.trim().toLowerCase()).sort().join("|");

/** Whether the chips on screen (`current`) differ from the project's stored list (`saved`), and can be saved as they are. */
export function projectSkillSave(saved: readonly string[], current: readonly string[]): ProjectSkillSave {
  if (key(saved) === key(current)) return { state: "same" };
  const n = current.length;
  if (n >= MIN_PROJECT_SKILLS && n <= MAX_PROJECT_SKILLS) return { state: "ready" };
  if (n === 0 || n > MAX_PROJECT_SKILLS) return { state: "blocked", message: `Pick ${MIN_PROJECT_SKILLS} to ${MAX_PROJECT_SKILLS} skills to save them to the project.` };
  const more = MIN_PROJECT_SKILLS - n;
  return { state: "blocked", message: `Add ${more} more skill${more === 1 ? "" : "s"} to save them to the project.` };
}

/**
 * What a city picked in the Candidates location filter saves to the project. On-site or hybrid: the project's city, in
 * the district list's spelling, with its state; a name in two states (Aurangabad, Bilaspur…) keeps the project's own
 * state when it is one of them, otherwise it is not guessed, and clearing never empties a city such a project needs.
 * Remote: nothing, a remote project has no work location, so the filter applies on screen only.
 */
export type CityPlan =
  | { action: "save"; body: { city: string; state: string }; label: string }
  | { action: "skip"; message: string };

export function projectCityPlan(
  city: string,
  project: { locationType: string | null; state: string | null },
  districts: readonly { district: string; state: string }[],
): CityPlan {
  const name = city.trim();
  const hits = districts.filter((d) => d.district.toLowerCase() === name.toLowerCase());
  if (!project.locationType || project.locationType === "remote") {
    return { action: "skip", message: "A remote project has no work location. The city filter applies here only." };
  }
  if (!name) return { action: "skip", message: "An on-site or hybrid project keeps its city. The filter is cleared here only." };
  if (hits.length === 0) return { action: "skip", message: "Not saved to the project: pick a city from the list." };
  const hit = hits.length === 1 ? hits[0] : hits.find((d) => d.state.toLowerCase() === (project.state ?? "").trim().toLowerCase());
  if (!hit) return { action: "skip", message: `Not saved to the project: ${hits[0].district} is in more than one state. Change it on the project page.` };
  return { action: "save", body: { city: hit.district, state: hit.state }, label: `${hit.district}, ${hit.state}` };
}
