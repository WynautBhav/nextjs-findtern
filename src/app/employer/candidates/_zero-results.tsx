import Link from "next/link";
import { SearchX } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { relaxations, type RelaxKey } from "@/components/employer/candidate-view";
import { projectMatchHref } from "@/lib/project-match";
import { activeChips, queryOf, resetHref, titleCase, withFilters, withoutCity, type CandidatesData, type Filters } from "./_query";
import { matchStateOf, projectNameOf } from "./_toolbar";

/** The headline and the plain-language reason, by the likeliest cause (the copy the page always had). */
function reason(data: CandidatesData, filters: Filters): { title: string; body: string } {
  if (filters.cgpaMin > 0 || filters.cgpaVerified || filters.colleges.length > 0) {
    return {
      title: "No candidates match your CGPA or college filters",
      body:
        data.pro.hiddenNoScore > 0
          ? `${data.pro.hiddenNoScore} candidate${data.pro.hiddenNoScore === 1 ? " was" : "s were"} left out for having no score. Lower the minimum CGPA, turn off verified only or choose more colleges.`
          : "Lower the minimum CGPA, turn off verified only or choose more colleges.",
    };
  }
  if (data.cityList.length > 0) {
    return {
      title: `No candidates for ${data.cityList.map(titleCase).join(", ")}`,
      body: "Nobody in the pool has picked this city as a place to work yet. Clear the location, or include candidates who work remotely.",
    };
  }
  if (filters.q) {
    return {
      title: `No candidates match “${filters.q}”`,
      body: "Search looks at skills and cities, for example React or Pune. Names and profiles are not searched.",
    };
  }
  return {
    title: "No candidates match",
    body: "Lower a score floor, drop a skill or turn on remote candidates. New interns join the pool as soon as their AI interview is scored.",
  };
}

/**
 * Nothing matched: names what narrows the list and offers up to four one-click ways to widen it (see `relaxations`),
 * each a plain link. The counts behind each option are not known without another query, so none is promised.
 */
export function ZeroResults({ data, filters }: { data: CandidatesData; filters: Filters }) {
  const { title, body } = reason(data, filters);
  const match = matchStateOf(data, filters);
  const scoreFloors = filters.minScore > 0 || Object.values(filters.minRatings).some((v) => v > 0);
  const proFilters = filters.cgpaMin > 0 || filters.cgpaVerified || filters.colleges.length > 0;
  const options = relaxations({
    q: filters.q,
    skills: data.effectiveSkills,
    cities: data.cityList,
    includeRemote: data.includeRemote,
    proFilters,
    scoreFloors,
    match,
    projectName: projectNameOf(data),
    saved: filters.saved,
  });
  const href: Record<RelaxKey, string> = {
    q: withFilters(filters, { q: "", page: "" }),
    skill: withFilters(filters, { skills: data.effectiveSkills.slice(0, -1), skillsSet: true, page: "" }),
    city: withoutCity(filters),
    remote: withFilters(filters, { remote: true, page: "" }),
    project: projectMatchHref("/employer/candidates", queryOf({ ...filters, page: 1 }).slice(1), "match", data.pro.active),
    pro: withFilters(filters, { cgpaMin: 0, cgpaVerified: false, colleges: [], collegeSort: null, page: "" }),
    score: withFilters(filters, { minScore: 0, minRatings: { communication: 0, coding: 0, aptitude: 0, interview: 0 }, page: "" }),
  };
  const narrowing = [
    ...(data.effectiveSkills.length > 0 ? [`${data.effectiveSkills.length} required skill${data.effectiveSkills.length === 1 ? "" : "s"}: ${data.effectiveSkills.map((s) => s.split(" · ")[0]).join(", ")}`] : []),
    ...activeChips(filters).map((chip) => chip.label),
    ...(data.projectApplied?.city && !filters.citySet ? [`City: ${data.projectApplied.city} (from project)`] : []),
  ];
  return (
    <section aria-labelledby="zero-heading" className={`${SURFACE_CLASS} mt-2 px-5 py-8 sm:px-8 sm:py-10`}>
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-full bg-ink-100 text-ink-600">
          <SearchX className="size-6" aria-hidden />
        </span>
        <h2 id="zero-heading" className="mt-4 text-balance text-lg font-semibold text-ink-900 sm:text-xl">
          {title}
        </h2>
        <p className="mt-2 text-pretty text-sm leading-6 text-ink-600">{body}</p>

        {narrowing.length > 0 ? (
          <div className="mt-5 w-full rounded-xl bg-ink-50 px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-subtle">Narrowing the list</p>
            <ul className="mt-1.5 space-y-1 text-sm text-ink-800">
              {narrowing.map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {options.length > 0 ? (
          <ul aria-label="Ways to widen the search" className="mt-5 grid w-full gap-3 text-left sm:grid-cols-2">
            {options.map((o, i) => (
              <li key={o.key} className="min-w-0">
                <Link
                  href={href[o.key]}
                  scroll={false}
                  className={buttonClass({
                    variant: i === 0 ? "primary" : "outline",
                    size: "md",
                    className: "h-auto min-h-11 w-full flex-col items-start justify-center gap-0.5 whitespace-normal px-4 py-2.5 text-left",
                  })}
                >
                  <span className="text-sm font-semibold">{o.label}</span>
                  <span className={i === 0 ? "text-[13px] font-normal text-white/85" : "text-[13px] font-normal text-ink-600"}>{o.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <Link href={resetHref(data.activeProjectId)} className={buttonClass({ variant: "ghost", size: "sm", className: "mt-4 min-h-11 text-ink-700" })}>
          Reset all filters
        </Link>
      </div>
    </section>
  );
}
