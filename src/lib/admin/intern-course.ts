import { sql, type SQL } from "drizzle-orm";

/**
 * The Course filter on the candidate list. "Course" is the degree an intern
 * saved in onboarding (`extra_data.academics.degree`; the flat `degree` key is
 * what seed scripts write), compared ignoring case and surrounding spaces.
 */

/** The stored degree, blank when none. `extraData` is the onboarding row's extra_data column. */
export const courseExpr = (extraData: SQL | SQL.Aliased | object) =>
  sql<string>`btrim(coalesce(nullif(${extraData}->'academics'->>'degree', ''), ${extraData}->>'degree', ''))`;

export const parseCourse = (params: Record<string, string>): string => (params.course ?? "").trim();

/** Where-condition for one course (bound parameter), or undefined for no filter. */
export function courseFilterSql(extraData: SQL | SQL.Aliased | object, course: string): SQL | undefined {
  const value = course.trim();
  return value ? sql`lower(${courseExpr(extraData)}) = lower(${value})` : undefined;
}

/** Toolbar options from the degrees stored on candidates: blanks dropped, one per spelling ignoring case, sorted. */
export function courseOptions(stored: (string | null | undefined)[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const raw of stored) {
    const v = (raw ?? "").trim();
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
}
