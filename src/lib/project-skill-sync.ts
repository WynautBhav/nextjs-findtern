/**
 * Skills changed on the Candidates page (a chip removed, "+ Skill", a skill picked in the search) are the selected
 * project's skills too: the change saves to the project, then filters. A project keeps at least
 * MIN_PROJECT_SKILLS, so once the saved list has that many the filter cannot drop below; under it (a new or legacy
 * project) the change only filters until there are enough to save. `saved` is the project's stored list, not the chips:
 * a chip the project refused (a skill outside the list) can always be removed. Pure, so the rule is tested under plain `node --test`.
 */
import { MIN_PROJECT_SKILLS } from "./project-locations.ts";

export type ProjectSkillPlan = { action: "save" } | { action: "block"; message: string } | { action: "filter"; message: string };

/** `current` is the list on screen now: only a removal can be blocked, so a short list can always be built back up. */
export function projectSkillPlan(saved: readonly string[], current: readonly string[], next: readonly string[]): ProjectSkillPlan {
  if (next.length >= MIN_PROJECT_SKILLS) return { action: "save" };
  if (saved.length >= MIN_PROJECT_SKILLS && next.length < current.length) {
    return { action: "block", message: `A project needs at least ${MIN_PROJECT_SKILLS} skills. Add another skill before removing this one.` };
  }
  const more = MIN_PROJECT_SKILLS - next.length;
  return { action: "filter", message: `Add ${more} more skill${more === 1 ? "" : "s"} to save them to the project.` };
}

/**
 * What a city picked in the Candidates location filter saves to the project. On-site or hybrid: the project's city, in
 * the district list's spelling, with its state; a name in two states (Aurangabad, Bilaspur…) keeps the project's own
 * state when it is one of them, otherwise it is not guessed, and clearing never empties a city such a project needs.
 * Remote: the preferred work location (one city), which clearing empties.
 */
export type CityPlan =
  | { action: "save"; body: { city: string; state: string } | { preferredLocations: string[] }; label: string }
  | { action: "skip"; message: string };

export function projectCityPlan(
  city: string,
  project: { locationType: string | null; state: string | null },
  districts: readonly { district: string; state: string }[],
): CityPlan {
  const name = city.trim();
  const hits = districts.filter((d) => d.district.toLowerCase() === name.toLowerCase());
  if (!project.locationType || project.locationType === "remote") {
    if (!name) return { action: "save", body: { preferredLocations: [] }, label: "" };
    if (hits.length === 0) return { action: "skip", message: "Not saved to the project: pick a city from the list." };
    return { action: "save", body: { preferredLocations: [hits[0].district] }, label: hits[0].district };
  }
  if (!name) return { action: "skip", message: "An on-site or hybrid project keeps its city. The filter is cleared here only." };
  if (hits.length === 0) return { action: "skip", message: "Not saved to the project: pick a city from the list." };
  const hit = hits.length === 1 ? hits[0] : hits.find((d) => d.state.toLowerCase() === (project.state ?? "").trim().toLowerCase());
  if (!hit) return { action: "skip", message: `Not saved to the project: ${hits[0].district} is in more than one state. Change it on the project page.` };
  return { action: "save", body: { city: hit.district, state: hit.state }, label: `${hit.district}, ${hit.state}` };
}
