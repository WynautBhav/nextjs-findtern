import type { RelaxCounts } from "@/components/employer/candidate-view";
import { type RelaxFix, relaxFixes } from "@/lib/candidates-relax";
import { loadCandidates } from "./_query";
import { readFilters, resetHref, type CandidatesData, type Filters, type SearchParams } from "@/lib/candidates-params";

export { relaxFixes, type RelaxFix };

/** More options than this are never counted: each count reads the pool once, so this bounds the work of an empty page. */
const MAX_COUNTED = 7;
/** Past this the panel shows the fixes without numbers rather than make the employer wait. */
const COUNT_TIMEOUT_MS = 4000;

/** A link's query as the page would read it from the URL. */
function paramsOf(href: string): SearchParams {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(href.split("?")[1] ?? "")) {
    const had = out[key];
    out[key] = had === undefined ? value : Array.isArray(had) ? [...had, value] : [had, value];
  }
  return out as SearchParams;
}

/**
 * For an empty list only: how many candidates each fix would return, by running the page's own load (the same pool, hold,
 * hide and privacy rules) on the filters the fix's link would give, counting and nothing else. At most `MAX_COUNTED` fixes
 * plus "Reset all filters", read together, with a timeout. Any failure is null: the panel then shows no numbers.
 */
export async function countRelaxations(uid: string, fixes: RelaxFix[], activeProjectId: string | null): Promise<RelaxCounts | null> {
  const targets: { id: string; href: string }[] = [...fixes.slice(0, MAX_COUNTED).map((f) => ({ id: f.id, href: f.href })), { id: "reset", href: resetHref(activeProjectId) }];
  const count = async ({ id, href }: { id: string; href: string }): Promise<[string, number | null]> => {
    try {
      const params = paramsOf(href);
      const data = await loadCandidates(uid, readFilters(params), { hasFilterParams: true, fresh: true, countOnly: true, lean: true });
      return [id, data.loadFailed || data.restoreTo ? null : data.total];
    } catch (err) {
      console.error("[employer/candidates] relax count", id, err);
      return [id, null];
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const counted = await Promise.race([
      Promise.all(targets.map(count)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), COUNT_TIMEOUT_MS);
      }),
    ]);
    if (!counted) return null;
    return Object.fromEntries(counted);
  } catch (err) {
    console.error("[employer/candidates] relax counts", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** An empty list is the rare path: only then count what each one-click widening would return. Used by the page and the results endpoint alike. */
export async function withRelaxCounts(uid: string, data: CandidatesData, filters: Filters): Promise<void> {
  if (data.restoreTo || data.total !== 0 || data.loadFailed || filters.saved) return;
  const fixes = relaxFixes(data, filters);
  if (fixes.length > 0) data.relaxCounts = await countRelaxations(uid, fixes, data.activeProjectId);
}
