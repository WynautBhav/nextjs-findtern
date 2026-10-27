"use client";

/**
 * Writes the employer's current project, compare picks and (per project) the
 * applied filters to cookies, so the next visit to the candidates or compare
 * page starts where they left off (see lib/employer-selection). Renders
 * nothing.
 */

import { useEffect } from "react";

const MAX_AGE = 60 * 60 * 24 * 30;
/** At most this many projects keep their filters; the oldest drop first. */
const MAX_PROJECTS = 5;

function write(name: string, value: string | null) {
  document.cookie = value
    ? `${name}=${encodeURIComponent(value)}; path=/employer; max-age=${MAX_AGE}; samesite=lax`
    : `${name}=; path=/employer; max-age=0; samesite=lax`;
}

function read(name: string): string {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(name.length + 1));
  } catch {
    return "";
  }
}

/** Save `query` as the filters for `project` (EMB-05), keeping a few others. */
function writeFilters(employerId: string, project: string, query: string) {
  const prefix = `${employerId}:`;
  const raw = read("ft_emp_filters");
  let map: Record<string, string> = {};
  if (raw.startsWith(prefix)) {
    try {
      const parsed = JSON.parse(raw.slice(prefix.length)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed ?? {})) if (typeof v === "string") map[k] = v;
    } catch {
      map = {};
    }
  }
  delete map[project];
  // Insertion order is recency: the current project goes last.
  if (query) map[project] = query.slice(0, 600);
  const keys = Object.keys(map).slice(-MAX_PROJECTS);
  const kept = Object.fromEntries(keys.map((k) => [k, map[k]]));
  write("ft_emp_filters", keys.length ? `${prefix}${JSON.stringify(kept)}` : null);
}

export function RememberSelection({
  employerId,
  project,
  compare,
  filters,
}: {
  employerId: string;
  /** Undefined leaves the stored project as it is. */
  project?: string | null;
  compare?: string[];
  /** The applied filter query for `project`; undefined leaves it as it is. */
  filters?: string;
}) {
  const compareKey = compare?.join(",");
  useEffect(() => {
    // Names match PROJECT_COOKIE / COMPARE_COOKIE / FILTERS_COOKIE in
    // lib/employer-selection, which is server-only (next/headers).
    if (project !== undefined) write("ft_emp_project", project ? `${employerId}:${project}` : null);
    if (compareKey !== undefined) write("ft_emp_compare", compareKey ? `${employerId}:${compareKey}` : null);
    if (project && filters !== undefined) writeFilters(employerId, project, filters);
  }, [employerId, project, compareKey, filters]);
  return null;
}
