import { relaxations, type Relaxation, type RelaxCounts } from "@/components/employer/candidate-view";
import { projectMatchHref } from "@/lib/project-match";
import { loadCandidates, queryOf, readFilters, resetHref, withFilters, withoutCity, type CandidatesData, type Filters, type SearchParams } from "./_query";
import { matchStateOf, projectNameOf } from "./_toolbar";

/** A fix the zero-results panel offers: what it is and the link that applies it (the same link that is counted). */
export type RelaxFix = Relaxation & { href: string };

/** More options than this are never counted: each count reads the pool once, so this bounds the work of an empty page. */
const MAX_COUNTED = 7;
/** Past this the panel shows the fixes without numbers rather than make the employer wait. */
const COUNT_TIMEOUT_MS = 4000;

/** The fixes that apply to this empty list, each with the link that makes it. Pure of the database. */
export function relaxFixes(data: CandidatesData, filters: Filters): RelaxFix[] {
  const scoreFloors = filters.minScore > 0 || Object.values(filters.minRatings).some((v) => v > 0);
  const proFilters = filters.cgpaMin > 0 || filters.cgpaVerified || filters.colleges.length > 0;
  const options = relaxations({
    q: filters.q,
    skills: data.effectiveSkills,
    cities: data.cityList,
    includeRemote: data.includeRemote,
    proFilters,
    scoreFloors,
    laptop: filters.laptop === "yes",
    match: matchStateOf(data, filters),
    projectName: projectNameOf(data),
    cityFromProject: Boolean(data.projectApplied?.city) && !filters.citySet,
    saved: filters.saved && Boolean(data.activeProjectId),
  });
  const without = (skill: string) => data.effectiveSkills.filter((s) => s !== skill);
  const href = (o: Relaxation): string => {
    switch (o.key) {
      case "q":
        return withFilters(filters, { q: "", page: "" });
      case "skill":
        return withFilters(filters, { skills: without(o.id.slice("skill:".length)), skillsSet: true, page: "" });
      case "city":
        return withoutCity(filters);
      case "remote":
        return withFilters(filters, { remote: true, page: "" });
      case "stop":
        return projectMatchHref("/employer/candidates", queryOf({ ...filters, page: 1 }).slice(1), "stop", data.pro.active);
      case "project":
        return projectMatchHref("/employer/candidates", queryOf({ ...filters, page: 1 }).slice(1), "match", data.pro.active);
      case "pro":
        return withFilters(filters, { cgpaMin: 0, cgpaVerified: false, colleges: [], collegeSort: null, page: "" });
      case "score":
        return withFilters(filters, { minScore: 0, minRatings: { communication: 0, coding: 0, aptitude: 0, interview: 0 }, page: "" });
      case "laptop":
        return withFilters(filters, { laptop: "", page: "" });
    }
  };
  return options.map((o) => ({ ...o, href: href(o) }));
}

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
      const data = await loadCandidates(uid, readFilters(params), { hasFilterParams: true, fresh: true, countOnly: true });
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
