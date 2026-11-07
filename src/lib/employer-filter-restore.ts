/**
 * The part of a remembered query string that is worth restoring on a bare visit
 * to /employer/candidates: structured filters only.
 *
 * Why this exists: older builds saved `view=grid` (and other non-filter keys)
 * into the remembered filters. The page decides "bare visit" by looking for
 * filter keys, and `view` is not one, so restoring `?view=grid` was still a
 * bare visit and redirected again, forever. A typed keyword (`q`) is a one-off
 * search and is never restored.
 *
 * Pure and free of `@/` imports so it runs under plain `node --test`.
 */
export function restorableFilters(saved: string, filterKeys: readonly string[]): string {
  let source: URLSearchParams;
  try {
    source = new URLSearchParams(saved);
  } catch {
    return "";
  }
  const allowed = new Set(filterKeys);
  const kept = new URLSearchParams();
  for (const [key, value] of source) {
    if (key === "q" || !allowed.has(key)) continue;
    kept.append(key, value);
  }
  return kept.toString();
}
