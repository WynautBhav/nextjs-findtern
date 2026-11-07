import { scopeLabel, scopeValue } from "../../lib/db/schema.ts";
import { formatDayLabel } from "../../lib/format.ts";
import { toArray } from "../../lib/journey.ts";

/** What an open-role row says about one role, worked out once for the list, the detail and the public pages. */
export type OpportunityRole = {
  id: string;
  projectName: string;
  scopeOfWork?: string | null;
  description?: string | null;
  skills?: unknown;
  locationType?: string | null;
  fullTimeOffer?: boolean | null;
  city?: string | null;
  state?: string | null;
  createdAt: Date | string | null;
};

export const WORK_MODE: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };
const MAX_CHIPS = 7;

/**
 * `scopeOfWork` is a duration code ("short-term") on current rows and free
 * prose on legacy ones: the code becomes "Up to 60 days", the prose is a brief.
 */
export function roleScope(scopeOfWork: string | null | undefined): { duration: string | null; brief: string | null } {
  if (!scopeOfWork?.trim()) return { duration: null, brief: null };
  return scopeValue(scopeOfWork) ? { duration: scopeLabel(scopeOfWork), brief: null } : { duration: null, brief: scopeOfWork.trim() };
}

/** "Remote · Up to 90 days · Posted today": where, how long, how fresh. */
export function roleFacts(role: OpportunityRole): string {
  const mode = role.locationType ? (WORK_MODE[role.locationType.toLowerCase()] ?? role.locationType) : null;
  const place = mode === "Remote" ? null : [role.city, role.state].filter(Boolean).join(", ") || null;
  const day = role.createdAt ? formatDayLabel(role.createdAt) : null;
  const posted = day && day !== "Unknown" ? `Posted ${/^\d/.test(day) ? day : day.toLowerCase()}` : null;
  return [mode, place, roleScope(role.scopeOfWork).duration, posted].filter(Boolean).join(" · ");
}

/** The role's skills with the candidate's own first; how many they share. */
export function matchSkills(skills: unknown, mine?: Set<string>) {
  const has = (s: string) => Boolean(mine?.has(s.toLowerCase().trim()));
  const all = [...toArray<string>(skills)].sort((a, b) => Number(has(b)) - Number(has(a)));
  return { all, shown: all.slice(0, MAX_CHIPS), more: Math.max(0, all.length - MAX_CHIPS), matched: all.filter(has).length, has };
}

