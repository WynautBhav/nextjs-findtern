import { withoutProParams } from "./employer-filter-restore.ts";

/**
 * The link a skill chip makes: the current query with `skills` changed (null drops it, and `pf=0`, so the project's skills apply)
 * and the page reset. Without Findtern Pro the Pro filters and the college sort a stale link carried are dropped, so
 * the chips never echo filters this employer cannot use. Pure.
 */
export function skillFilterHref(pathname: string, query: string, skills: string[] | null, hasPro: boolean): string {
  const next = new URLSearchParams(hasPro ? query : withoutProParams(query));
  let droppedPf = false;
  if (skills === null) {
    next.delete("skills");
    // "Project skills" is only real while matching is on: with `pf=0` dropping `skills` alone would change nothing.
    droppedPf = next.has("pf");
    next.delete("pf");
  } else next.set("skills", skills.join(","));
  next.delete("page");
  // Leaving no filter would look like a bare visit and restore the remembered ones, `pf=0` included.
  if (droppedPf && ![...next.keys()].some((k) => k !== "project" && k !== "ids")) next.set("fresh", "1");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Adds one skill to the required list from the search box: the typed keyword is spent, so `q` goes. */
export function requireSkillHref(pathname: string, query: string, active: string[], skill: string, hasPro: boolean): string {
  const href = skillFilterHref(pathname, query, [...active.filter((s) => s.toLowerCase() !== skill.toLowerCase()), skill], hasPro);
  const [path, qs = ""] = href.split("?");
  const next = new URLSearchParams(qs);
  next.delete("q");
  const out = next.toString();
  return out ? `${path}?${out}` : path;
}
