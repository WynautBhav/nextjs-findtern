import { relaxations, type Relaxation } from "@/components/employer/candidate-view";
import { projectMatchHref } from "@/lib/project-match";
import { queryOf, withFilters, withoutCity, type CandidatesData, type Filters } from "@/lib/candidates-params";
import { matchStateOf, projectNameOf } from "@/lib/candidates-match-state";

/** A fix the zero-results panel offers: what it is and the link that applies it (the same link that is counted). */
export type RelaxFix = Relaxation & { href: string };

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

