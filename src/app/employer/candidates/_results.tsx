import Link from "next/link";
import { ChevronDown, Search, X } from "lucide-react";

import { redactForEmployer } from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { MAX_COMPARE } from "@/lib/employer-selection";
import { SITE } from "@/lib/content/site";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { cn } from "@/lib/utils";
import { CandidateCard } from "@/components/employer/candidate-card";
import { EmptyScene } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { buttonClass } from "@/components/ui/button";
import { showClearAll } from "@/components/employer/candidate-view";
import { FiltersToggle } from "@/components/employer/candidate-filter-collapse";
import { SortSelect } from "./_sort-select";
import {
  SORT_OPTIONS,
  activeChips,
  activeFilterCount,
  queryOf,
  resetHref,
  titleCase,
  toggle,
  withFilters,
  withoutCity,
  type CandidatesData,
  type Filters,
  type SortKey,
} from "./_query";

/**
 * Keyword search: skills or city - never a name or bio (the pool is redacted).
 * The one search bar at the top of the page; the skill tokens sit under it.
 */
export function CandidateSearch({ filters, className }: { filters: Filters; className?: string }) {
  return (
    <form method="get" role="search" className={cn("relative min-w-0", className)}>
      {Array.from(new URLSearchParams(queryOf({ ...filters, q: "", page: 1, saved: false }).slice(1)).entries()).map(([k, v], i) => (
        <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="candidate-search" className="sr-only">
        Search by skill or city
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        id="candidate-search"
        name="q"
        type="search"
        defaultValue={filters.q}
        placeholder="Skill or city"
        className="h-11 w-full rounded-full border border-ink-200 bg-white pl-11 pr-4 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm"
      />
    </form>
  );
}

/** Sort options: best match, each field high to low, and the score low to high. */
function sortOptions(filters: Filters) {
  const to = (sort: SortKey | "", dir: "asc" | "desc") =>
    withFilters(filters, { sorts: sort ? [sort] : [], dir, page: "" });
  return [
    { value: "", label: "Best match", href: to("", "desc") },
    ...SORT_OPTIONS.map((o) => ({ value: o.value, label: o.value === "score" ? "Highest Findtern Score" : `Highest ${o.label}`, href: to(o.value, "desc") })),
    { value: "score:asc", label: "Lowest Findtern Score", href: to("score", "asc") },
  ];
}

export function Results({
  data,
  filters,
  compareIds,
}: {
  data: CandidatesData;
  filters: Filters;
  compareIds: string[];
}) {
  const { candidates, total, pages, loadFailed } = data;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const compareLink = (id: string) =>
    compareIds.includes(id) || !compareFull ? withFilters(filters, { ids: toggle(compareIds, id) }) : null;
  const projectCity = data.projectApplied?.city ?? "";
  const chips = filters.saved
    ? []
    : [
        ...activeChips(filters),
        // The project's own city narrows the list too: say so, and let it be dropped like the others.
        ...(projectCity ? [{ key: "project-city", label: `City: ${projectCity} (from project)`, href: withoutCity(filters, data.effectiveSkills) }] : []),
      ];
  const reset = resetHref(data.activeProjectId);
  const saved = filters.saved && Boolean(data.activeProjectId);
  const sortValue = filters.sorts[0] ? `${filters.sorts[0]}${filters.dir === "asc" ? ":asc" : ""}` : "";
  const projectName = data.projects.find((p) => p.id === data.activeProjectId)?.projectName;
  const projectKeep = (id: string) => {
    const next = new URLSearchParams({ project: id });
    if (compareIds.length > 0) next.set("ids", compareIds.join(","));
    return `/employer/candidates?${next.toString()}`;
  };

  return (
    <>
      {/* One results bar: count and project, then All | Shortlist and Sort. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-ink-100 pb-3 sm:pb-4">
        {/* lg and up: hide or show the filter column (phones have the Filters sheet). */}
        <FiltersToggle controls="candidate-filter-column" count={activeFilterCount(filters, data.effectiveSkills, projectCity)} />
        {loadFailed ? null : (
          <h2 className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-ink-900">
            <span role="status" className="nums whitespace-nowrap">
              {total} {saved ? "shortlisted" : `candidate${total === 1 ? "" : "s"}`}
            </span>
            {projectName ? (
              data.projects.length > 1 ? (
                <span className="flex min-w-0 items-center gap-1 font-normal text-ink-600 max-sm:hidden">
                  for
                  <SortSelect
                    id="results-project"
                    label="Project"
                    prefix=""
                    value={data.activeProjectId ?? ""}
                    options={data.projects.map((p) => ({ value: p.id, label: p.projectName, href: projectKeep(p.id) }))}
                    className="h-9 max-w-80 border-transparent bg-transparent pl-1.5 font-semibold text-ink-900 [field-sizing:content] hover:border-ink-200 sm:min-h-9"
                  />
                </span>
              ) : (
                <span className="truncate font-normal text-ink-600 max-sm:hidden">
                  for <span className="font-semibold text-ink-900">{projectName}</span>
                </span>
              )
            ) : null}
          </h2>
        )}
        <div className="ml-auto flex min-w-0 max-w-full items-center justify-end gap-2 sm:gap-3">
          {data.activeProjectId ? (
            <nav aria-label="Show" className={cn("items-center gap-5", saved ? "flex" : "flex max-sm:hidden")}>
              <TabLink href={withFilters(filters, { saved: false, page: "" })} active={!saved}>
                All{saved ? null : <span className="nums font-normal text-ink-600"> {total}</span>}
              </TabLink>
              <TabLink href={withFilters(filters, { saved: true, page: "" })} active={saved}>
                Shortlist <span className="nums text-ink-600">({data.savedCount})</span>
              </TabLink>
            </nav>
          ) : null}
          {saved ? null : (
            <SortSelect
              className="h-11 rounded-full border-ink-200 pl-3.5 [field-sizing:content] sm:h-9 sm:min-h-9 sm:touch:h-11"
              value={sortValue}
              options={sortOptions(filters)}
            />
          )}
        </div>
      </div>

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-x-1 pt-3">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.href}
                scroll={false}
                aria-label={`Remove filter: ${chip.label}`}
                className="group inline-flex min-h-9 items-center touch:min-h-11"
              >
                <span className="inline-flex h-7 items-center gap-1 rounded-full bg-ink-100 pl-2.5 pr-2 text-[13px] font-medium text-ink-800 transition-colors group-hover:bg-ink-200">
                  {chip.label}
                  <X className="size-3.5 text-ink-500" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
          {showClearAll(chips.map((chip) => chip.key)) ? (
            <li>
              <Link href={reset} className="inline-flex min-h-9 items-center px-2 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11">
                Clear all
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}

      {loadFailed ? (
        <LoadError what="the candidate pool" retryHref={withFilters(filters)} email={SITE.adminEmail} />
      ) : candidates.length === 0 ? (
        saved ? (
          <EmptyScene
            art
            title="Nobody shortlisted for this project yet"
            body="Press Save on a candidate to add them to this project's shortlist."
            next={{ label: "Browse all candidates", href: withFilters(filters, { saved: false, page: "" }) }}
            who="You - save a candidate"
          />
        ) : data.cityList.length > 0 ? (
          // EMB-21: legacy offered "Clear location" and "Include remote
          // candidates" right on the empty result.
          <div>
            <EmptyScene
              art
              title={`No candidates for ${data.cityList.map(titleCase).join(", ")}`}
              body="Nobody in the pool has picked this city as a place to work yet. Clear the location, or include candidates who work remotely."
              next={{ label: "Clear location", href: withoutCity(filters, data.effectiveSkills) }}
              who="You - widen the search"
            />
            {!data.includeRemote ? (
              <p className="mt-3 text-center">
                <Link
                  href={withoutCity(filters, data.effectiveSkills, { remote: true })}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                >
                  Include remote candidates
                </Link>
              </p>
            ) : null}
          </div>
        ) : filters.q ? (
          // The typed keyword is the likeliest cause: name it and offer to drop just that.
          <EmptyScene
            art
            title={`No candidates match “${filters.q}”`}
            body="Search looks at skills and cities, for example React or Pune. Names and profiles are not searched."
            next={{ label: "Clear the search", href: withFilters(filters, { q: "", page: "" }) }}
            who="You - try another word"
          />
        ) : (
          <EmptyScene
            art
            title="No candidates match"
            body="Lower a score floor, drop a skill or turn on remote candidates. New interns join the pool as soon as their AI interview is scored."
            next={{ label: "Reset filters", href: reset }}
            who="You - adjust the filters"
          />
        )
      ) : (
        <>
          <ScoreLegend />
          {/* Thin dividers, no box per row: one list. */}
          <ul className="mt-1 divide-y divide-ink-100">
            {candidates.map((candidate) => {
              const rel = data.relations.get(candidate.id);
              return (
                <CandidateCard
                  key={candidate.id}
                  // The AI interview recording stays hidden until hire; only the
                  // written report is shown before (legacy detail:1578).
                  // The list never shows contact details, so they stay off the wire even after hire.
                  candidate={{ ...redactForEmployer(candidate, data.nameUnlocked.has(candidate.id)), email: "", linkedinUrl: "" }}
                  currency={data.currency}
                  region={data.region}
                  selected={compareIds.includes(candidate.id)}
                  compareHref={compareLink(candidate.id)}
                  comparable={!rel?.hired}
                  projectId={data.activeProjectId}
                  shortlisted={data.shortlisted.has(candidate.id)}
                  nameUnlocked={data.nameUnlocked.has(candidate.id)}
                  hired={rel?.hired}
                  pricing={resolvePricing(candidate.score, data.plans, data.currency, data.region)}
                  proposal={rel?.proposal ?? null}
                  fullTimeFrom={rel?.fullTimeFrom ?? null}
                  fullTime={data.fullTime}
                  wantedSkills={data.effectiveSkills}
                  presence={data.presence[candidate.id] ?? null}
                  interested={data.saved.has(candidate.id)}
                  pendingMeetingAt={rel?.pendingMeetingAt ?? null}
                />
              );
            })}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5 border-t border-ink-100 pt-6">
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((page) => page === 1 || page === pages || Math.abs(page - filters.page) <= 1)
                .map((page, i, visible) => (
                  <span key={page} className="flex items-center gap-1.5">
                    {i > 0 && visible[i - 1] !== page - 1 ? <span className="px-1 text-ink-400">…</span> : null}
                    <Link
                      href={withFilters(filters, { page: page === 1 ? "" : page })}
                      aria-current={page === filters.page ? "page" : undefined}
                      aria-label={`Page ${page}`}
                      className={cn(
                        "nums grid size-10 place-items-center rounded-full text-sm font-medium touch:size-11",
                        page === filters.page ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100",
                      )}
                    >
                      {page}
                    </Link>
                  </span>
                ))}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative -mx-1 inline-flex h-11 min-w-6 items-center justify-center whitespace-pre rounded-sm px-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 sm:h-9 sm:touch:h-11",
        "after:absolute after:inset-x-0 after:-bottom-[13px] after:h-0.5 after:rounded-full after:content-[''] max-sm:after:bottom-0",
        active ? "font-semibold text-ink-900 after:bg-ink-900" : "font-medium text-ink-600 hover:text-ink-900",
      )}
    >
      {children}
    </Link>
  );
}

/** What Espresso, Cappuccino and Latte mean, once per page (the row tooltip says it for one candidate). */
function ScoreLegend() {
  return (
    // Phones: every card already names its tier and what it means, so the legend only takes room above the first one.
    <details className="group/legend mt-1 border-b border-ink-100 text-sm max-sm:hidden">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-ink-700 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        What the score bands mean
        <ChevronDown className="size-4 text-ink-500 transition-transform group-open/legend:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <dl className="grid gap-x-6 gap-y-2 pb-4 sm:grid-cols-3">
        {[...BANDS].reverse().map((band) => (
          <div key={band.id}>
            <dt className="font-semibold text-ink-900">
              {PLAN_NAME[band.id]} <span className="nums font-normal text-ink-600">{band.max >= 10 ? `${band.min} or above` : `${band.min} to under ${band.max}`}</span>
            </dt>
            <dd className="text-ink-600">{band.blurb}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
