import { withoutProParams } from "./employer-filter-restore.ts";
import { skillFilterHref } from "./skill-filter-href.ts";

/**
 * How the Candidates list relates to the selected project's own skills and city. Pure and free of `@/` imports so
 * it runs under plain `node --test`.
 * - matched: the project fills Required skills (and City); nothing of the employer's own overrides it.
 * - edited: matching is on but the employer picked their own skills, so the project's no longer apply.
 * - off: "Stop matching" (pf=0): the project fills nothing in.
 * - none: no project, or one with no skills and no city to match on.
 */
export type ProjectMatchState = "matched" | "edited" | "off" | "none";

const MAX_PROJECT_SKILLS = 7;

function sameSkills(a: string[], b: string[]): boolean {
  const key = (list: string[]) => list.map((s) => s.toLowerCase()).sort().join("|");
  return key(a) === key(b.slice(0, MAX_PROJECT_SKILLS));
}

export function projectMatchState(input: {
  hasProject: boolean;
  /** `pf` is not 0. */
  projectDefaults: boolean;
  /** `skills` is in the URL, even empty. */
  skillsSet: boolean;
  /** The employer's own `skills` param (what the URL holds). */
  skills: string[];
  projectSkills: string[];
  projectCity?: string;
}): ProjectMatchState {
  if (!input.hasProject) return "none";
  if (!input.projectDefaults) return "off";
  if (input.projectSkills.length === 0 && !input.projectCity) return "none";
  if (input.skillsSet && !sameSkills(input.skills, input.projectSkills)) return "edited";
  return "matched";
}

/**
 * The link each project-match button makes, built from the current query so it never does nothing:
 * - "match" (from off or edited): matching back on (`pf` dropped) AND the employer's own `skills` dropped;
 * - "stop": matching off (`pf=0`), the project fills nothing in.
 */
export function projectMatchHref(pathname: string, query: string, action: "match" | "stop", hasPro: boolean): string {
  if (action === "match") return skillFilterHref(pathname, query, null, hasPro);
  const next = new URLSearchParams(hasPro ? query : withoutProParams(query));
  next.set("pf", "0");
  next.delete("page");
  return `${pathname}?${next.toString()}`;
}

/** "matched on 5 skills + Pune" for the context line; "" when nothing narrows by skill or city. */
export function matchedOnText(skillCount: number, cities: string[]): string {
  const parts = [skillCount > 0 ? `${skillCount}\u00a0skill${skillCount === 1 ? "" : "s"}` : "", cities.join(", ")].filter(Boolean);
  return parts.length > 0 ? `matched on ${parts.join(" + ")}` : "";
}
