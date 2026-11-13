/**
 * The compare picks, one list per project (bug sheet 12 Nov, row 8: "show
 * different candidates for different projects"). Kept in a cookie as
 * `employerId:` + a JSON map of project id -> candidate ids, the same shape as
 * the filters cookie. Before this the cookie held one id list for every
 * project (`employerId:id1,id2`); that form is still read, and handed to the
 * project the employer last had open.
 *
 * Pure and free of imports so it runs under plain `node --test` and in the
 * browser (lib/employer-selection is server-only).
 */

/** Compare shows at most four columns. */
export const MAX_COMPARE = 4;
/** At most this many projects keep picks; the one touched longest ago drops first. */
export const MAX_COMPARE_PROJECTS = 10;

export type CompareMap = Record<string, string[]>;

/** A comma list (or several) as trimmed, de-duplicated ids, at most four. */
export function parseIds(raw: string | string[] | undefined | null): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return Array.from(
    new Set(
      joined
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_COMPARE);
}

function cleanIds(value: unknown): string[] {
  return Array.isArray(value) ? parseIds(value.filter((v): v is string => typeof v === "string")) : [];
}

/**
 * The picks held in a cookie value. Anything unreadable is empty. A value in
 * the old single-list form goes to `legacyProject` when there is one.
 * Insertion order is recency: the last key was touched last.
 */
export function readCompareMap(raw: string | null | undefined, employerId: string, legacyProject?: string | null): CompareMap {
  const prefix = `${employerId}:`;
  if (!raw || !raw.startsWith(prefix)) return {};
  const body = raw.slice(prefix.length);
  if (!body.startsWith("{")) {
    const ids = parseIds(body);
    return legacyProject && ids.length ? { [legacyProject]: ids } : {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const map: CompareMap = {};
  for (const [project, value] of Object.entries(parsed as Record<string, unknown>)) {
    const ids = cleanIds(value);
    if (project && ids.length) map[project] = ids;
  }
  return Object.fromEntries(Object.entries(map).slice(-MAX_COMPARE_PROJECTS));
}

/** `map` with `projectId`'s picks replaced by `ids` (empty clears them), that project the most recent, the map capped. */
export function writeCompareMap(map: CompareMap, projectId: string, ids: string[]): CompareMap {
  const next: CompareMap = { ...map };
  delete next[projectId];
  const kept = parseIds(ids);
  if (projectId && kept.length) next[projectId] = kept;
  return Object.fromEntries(Object.entries(next).slice(-MAX_COMPARE_PROJECTS));
}

/** The cookie value for `map`, or null when nothing is picked (the cookie is then cleared). */
export function serializeCompareMap(employerId: string, map: CompareMap): string | null {
  return Object.keys(map).length ? `${employerId}:${JSON.stringify(map)}` : null;
}
