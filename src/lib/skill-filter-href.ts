import { withoutProParams } from "./employer-filter-restore.ts";

/**
 * The link a skill chip makes: the current query with `skills` changed (null drops it so the project's skills apply)
 * and the page reset. Without Findtern Pro the Pro filters and the college sort a stale link carried are dropped, so
 * the chips never echo filters this employer cannot use. Pure.
 */
export function skillFilterHref(pathname: string, query: string, skills: string[] | null, hasPro: boolean): string {
  const next = new URLSearchParams(hasPro ? query : withoutProParams(query));
  if (skills === null) next.delete("skills");
  else next.set("skills", skills.join(","));
  next.delete("page");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
