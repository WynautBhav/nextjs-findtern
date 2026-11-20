import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, Info, LayoutGrid, List, Rows3, Search, X } from "lucide-react";

import { redactForEmployer } from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { PER_HIRE_FEE_DEFAULT } from "@/lib/per-hire-fee";
import { MAX_COMPARE } from "@/lib/employer-selection";
import { SITE } from "@/lib/content/site";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { cn } from "@/lib/utils";
import { CandidateCard } from "@/components/employer/candidate-card";
import { EmptyScene } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { buttonClass } from "@/components/ui/button";
import { PAGE_SIZES, pageWindow, showClearAll } from "@/components/employer/candidate-view";
import { Segmented, SegmentLink } from "@/components/employer/candidates/toolbar-parts";
import { FiltersToggle } from "@/components/employer/candidate-filter-collapse";
import { SUBSCRIPTION_HREF } from "@/components/employer/candidates/pro-filters";
import { activeSortDir, pickSortPatch, sortChoiceOf, sortDirPatch, type SortChoice, type SortDir } from "@/lib/candidate-sort";
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
      <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-500" aria-hidden />
      <input
        id="candidate-search"
        name="q"
        type="search"
        defaultValue={filters.q}
        placeholder="Skill or city"
        className="h-11 w-full rounded-apple-sm border border-ink-200 bg-ink-50 pl-11 pr-4 text-base text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-brand-600/20 md:text-sm"
      />
    </form>
  );
}

/**
 * Sort options: best match, each score field, and the college (Findtern Pro). Which way each runs is
 * the direction control beside the select; picking an option starts it at its natural direction
 * (scores high to low, colleges A-Z), so the list reads as it always did until the control is used.
 */
function sortOptions(filters: Filters, proActive: boolean) {
  // One choice at a time: picking a score sort drops the college order, and the reverse.
  const to = (choice: SortChoice) => withFilters(filters, { ...pickSortPatch(choice), page: "" });
  return [
    { value: "", label: "Best match", href: to("") },
    ...SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label, href: to(o.value) })),
    // Findtern Pro: shown to everyone, choosable by subscribers (the loader ignores `sort=college` for anyone else).
    { value: "college", label: proActive ? "College" : "College (Pro)", href: to("college"), disabled: !proActive },
  ];
}

/**
 * Ascending / descending for the sort chosen beside it. A pair of links (the server page builds every
 * URL, as for the layout toggle): the current one is `aria-current`. Direction applies to every sort but
 * Best match, which is a ranking with one fixed order: there the pair is shown disabled, with the reason.
 */
function SortDirection({ filters, choice, collegeSort }: { filters: Filters; choice: SortChoice; collegeSort: Filters["collegeSort"] }) {
  const current = activeSortDir(choice, filters.dir, collegeSort);
  const options: { dir: SortDir; label: string; Icon: typeof ArrowUp }[] = [
    { dir: "asc", label: "Sort ascending", Icon: ArrowUp },
    { dir: "desc", label: "Sort descending", Icon: ArrowDown },
  ];
  const cell = "grid size-10 place-items-center rounded-[10px] sm:size-8 sm:touch:size-11";
  if (current === null) {
    return (
      <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
        <div role="group" aria-label="Sort direction" aria-describedby="sort-dir-reason" className="flex items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5 opacity-50">
          {options.map(({ dir, label, Icon }) => (
            <span key={dir} role="img" aria-label={`${label} (not available)`} className={cn(cell, "text-ink-500")}>
              <Icon className="size-4" aria-hidden />
            </span>
          ))}
        </div>
        <span id="sort-dir-reason" className="text-xs text-text-subtle max-lg:sr-only">
          Best match has a fixed order
        </span>
      </div>
    );
  }
  const [other] = options.filter((o) => o.dir !== current);
  const Now = current === "asc" ? ArrowUp : ArrowDown;
  return (
    <>
      {/* A phone has no room for two buttons beside Sort and the layout toggle: one button shows the direction and flips it. */}
      <Link
        href={withFilters(filters, { ...sortDirPatch(choice, other.dir), page: "" })}
        scroll={false}
        aria-label={`${current === "asc" ? "Sort ascending" : "Sort descending"}, switch to ${other.dir === "asc" ? "ascending" : "descending"}`}
        title={`${current === "asc" ? "Ascending" : "Descending"}: tap for ${other.dir === "asc" ? "ascending" : "descending"}`}
        className="grid size-11 shrink-0 place-items-center rounded-apple-sm border border-ink-200 bg-white text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:hidden"
      >
        <Now className="size-4" aria-hidden />
      </Link>
      <nav aria-label="Sort direction" className="flex shrink-0 items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5 max-sm:hidden">
        {options.map(({ dir, label, Icon }) => {
          const active = current === dir;
          return (
            <Link
              key={dir}
              href={withFilters(filters, { ...sortDirPatch(choice, dir), page: "" })}
              scroll={false}
              aria-label={label}
              aria-current={active ? "true" : undefined}
              title={label}
              className={cn(
                cell,
                "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500",
                active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/**
 * What narrows the list besides the skill tokens: each chip drops its filter,
 * "Clear all" resets to the project's defaults. Rendered once, in the toolbar
 * card above the columns, so the Filters sheet, the card and this row all say
 * the same count.
 */
export function ActiveFilters({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  const projectCity = data.projectApplied?.city ?? "";
  const chips = filters.saved
    ? []
    : [
        ...activeChips(filters),
        // The project's own city narrows the list too: say so, and let it be dropped like the others.
        ...(projectCity ? [{ key: "project-city", label: `City: ${projectCity} (from project)`, href: withoutCity(filters) }] : []),
      ];
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1", className)}>
      <span aria-hidden className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle max-lg:hidden">
        Active filters
      </span>
      <ul aria-label="Active filters" className="contents">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              scroll={false}
              aria-label={`Remove filter: ${chip.label}`}
              className="group inline-flex min-h-9 items-center outline-none touch:min-h-11"
            >
              <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-ink-200 bg-ink-100 pl-2.5 pr-2 text-[13px] font-medium text-ink-800 transition-colors group-hover:bg-ink-200 group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
                {chip.label}
                <X className="size-3.5 text-ink-500" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {showClearAll(chips.map((chip) => chip.key)) ? (
        <Link href={resetHref(data.activeProjectId)} className="inline-flex min-h-9 items-center px-2 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11 lg:ml-auto">
          Clear all
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Sort and the project picker, inside the toolbar card (beside the search at lg; its own row on a phone,
 * where the project lives in the Filters sheet). Sort is hidden on the shortlist tab, as before.
 */
export function ToolbarSort({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  const saved = filters.saved && Boolean(data.activeProjectId);
  // A college order is only real for a subscriber (the loader empties it for anyone else).
  const choice = sortChoiceOf(filters.sorts, filters.collegeSort);
  const projectKeep = (id: string) => {
    // No `ids`: each project keeps its own compare picks, so the new project shows its own.
    const next = new URLSearchParams({ project: id });
    return `/employer/candidates?${next.toString()}`;
  };
  const select = "h-11 min-w-0 rounded-apple-sm border-ink-200 bg-white pl-3.5 max-sm:max-w-[9rem] [field-sizing:content]";
  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-2", className)}>
      {data.projects.length > 1 && data.activeProjectId ? (
        <SortSelect
          id="results-project"
          label="Project"
          prefix="Project: "
          value={data.activeProjectId}
          options={data.projects.map((p) => ({ value: p.id, label: p.projectName, href: projectKeep(p.id) }))}
          className={cn(select, "max-w-[min(28rem,100%)] max-lg:hidden")}
        />
      ) : null}
      {saved ? null : (
        <>
          <SortSelect className={select} value={choice} options={sortOptions(filters, data.pro.active)} />
          <SortDirection filters={filters} choice={choice} collegeSort={filters.collegeSort} />
        </>
      )}
      <ViewToggle filters={filters} />
    </div>
  );
}

/**
 * Cards (the full-width cards), Grid (compact cards, two across, three on wide screens) or List (one dense line
 * per candidate). All three carry the same actions. The choice rides in the URL (`view=grid`, `view=rows`; Cards
 * is the default and needs none), so every link on the page keeps it; it is a display choice, not a filter.
 */
function ViewToggle({ filters }: { filters: Filters }) {
  const options = [
    { view: "list" as const, label: "Card view", Icon: Rows3 },
    { view: "grid" as const, label: "Grid view", Icon: LayoutGrid },
    { view: "rows" as const, label: "List view", Icon: List },
  ];
  return (
    <nav aria-label="Layout" className="flex shrink-0 items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5">
      {options.map(({ view, label, Icon }) => {
        const active = filters.view === view;
        return (
          <Link
            key={view}
            href={withFilters(filters, { view, page: "" })}
            scroll={false}
            aria-label={label}
            aria-current={active ? "true" : undefined}
            title={label}
            className={cn(
              "grid size-10 place-items-center rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 sm:size-8 sm:touch:size-11",
              active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}

/** "Per page 12 24 48": how many candidates one page holds. Changing it returns to page 1. */
function PageSizeControl({ filters, className }: { filters: Filters; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-ink-600", className)}>
      <span>Per page</span>
      <Segmented label="Candidates per page">
        {PAGE_SIZES.map((size) => (
          <SegmentLink key={size} href={withFilters(filters, { pageSize: size, page: "" })} active={filters.pageSize === size} label={`${size} per page`}>
            <span className="nums">{size}</span>
          </SegmentLink>
        ))}
      </Segmented>
    </div>
  );
}

/**
 * The real count, above the columns: "Showing 31 candidates matched to your filters". The
 * count is the page's own total (hired candidates already left out), never a made-up figure.
 * Phones get the short form; lg and up also carry the button that hides the filter column.
 */
export function StatusRow({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  const { total, loadFailed } = data;
  const saved = filters.saved && Boolean(data.activeProjectId);
  return (
    <div className={cn("flex min-w-0 items-center gap-x-4 gap-y-2", className)}>
      {/* lg and up: hide or show the filter column (phones have the Filters sheet). */}
      <FiltersToggle controls="candidate-filter-column" count={activeFilterCount(filters, data.effectiveSkills, data.projectApplied?.city ?? "")} />
      {loadFailed ? null : (
        <h2 className="min-w-0 text-sm text-ink-600 max-sm:text-base max-sm:font-semibold max-sm:text-ink-900">
          <span className="max-sm:hidden">Showing </span>
          <span role="status" className="nums font-semibold text-ink-900">
            {total} {saved ? "shortlisted" : `candidate${total === 1 ? "" : "s"}`}
          </span>
          <span className="max-sm:hidden">{saved ? " for this project" : " matched to your filters"}</span>
        </h2>
      )}
    </div>
  );
}

/**
 * Two things Findtern Pro adds above the list, both server-rendered:
 * - a link that carried Pro filters to an employer without the subscription: the filters were ignored, and
 *   this says so (Dismiss goes to the same page without them, so the address bar is honest too);
 * - for a subscriber with a CGPA filter on: how many candidates were left out for having no score, and how
 *   many shown results rest on a converted percentage ("approx.").
 * `role="status"` so a change after the list reloads is announced.
 */
function ProNotes({ data, filters }: { data: CandidatesData; filters: Filters }) {
  const { pro } = data;
  const cgpaOn = filters.cgpaMin > 0 || filters.cgpaVerified;
  const parts: string[] = [];
  if (pro.active && cgpaOn) {
    if (pro.hiddenNoScore > 0) parts.push(`${pro.hiddenNoScore} candidate${pro.hiddenNoScore === 1 ? " with" : "s with"} no CGPA or percentage on their profile ${pro.hiddenNoScore === 1 ? "is" : "are"} not shown.`);
    if (pro.approxKept > 0) parts.push(`${pro.approxKept} of these ${data.total} result${data.total === 1 ? "" : "s"} ${pro.approxKept === 1 ? "gives" : "give"} a percentage, converted to CGPA at ÷ 9.5 (approx.).`);
  }
  if (!pro.ignored && parts.length === 0) return null;
  return (
    <div role="status" className="mb-3 space-y-2">
      {pro.ignored ? (
        <div className="flex items-start gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm text-ink-900 ring-1 ring-inset ring-info/25">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p className="min-w-0 flex-1">
            Those filters are part of Findtern Pro, so this list is not filtered by them.
            {pro.offered ? (
              <>
                {" "}
                <Link href={SUBSCRIPTION_HREF} className="font-medium underline underline-offset-4 hover:text-ink-700">
                  See Findtern Pro
                </Link>
              </>
            ) : null}
          </p>
          <Link
            href={withFilters(filters, { page: "" })}
            replace
            scroll={false}
            aria-label="Dismiss this notice"
            className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-lg text-ink-600 outline-none hover:bg-white/60 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 sm:size-9 sm:touch:size-11"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
      ) : null}
      {parts.length > 0 ? (
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-700">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ink-500" aria-hidden />
          <span>{parts.join(" ")}</span>
        </p>
      ) : null}
    </div>
  );
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
  const reset = resetHref(data.activeProjectId);
  const saved = filters.saved && Boolean(data.activeProjectId);
  const paged = pageWindow(total, filters.page, filters.pageSize);
  const firstShown = paged.first;
  const lastShown = paged.last;
  const currentPage = paged.page;
  const pageLink =
    "inline-flex h-10 items-center rounded-xl bg-ink-100 px-3.5 text-sm font-medium text-ink-700 outline-none hover:bg-ink-200 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 touch:h-11";

  return (
    <>
      {/* All | Shortlist. The count and Sort sit above the columns now. */}
      {data.activeProjectId ? (
        <div className={cn("border-b border-ink-100 pb-3 sm:pb-4 lg:border-b-0 lg:pb-5", saved ? "flex" : "flex max-sm:hidden")}>
          <nav aria-label="Show" className="flex items-center gap-5">
            <TabLink href={withFilters(filters, { saved: false, page: "" })} active={!saved}>
              All{saved ? null : <span className="nums font-normal text-ink-600"> {total}</span>}
            </TabLink>
            <TabLink href={withFilters(filters, { saved: true, page: "" })} active={saved}>
              Shortlist <span className="nums text-ink-600">({data.savedCount})</span>
            </TabLink>
          </nav>
        </div>
      ) : null}

      {loadFailed ? null : <ProNotes data={data} filters={filters} />}

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
        ) : filters.cgpaMin > 0 || filters.cgpaVerified || filters.colleges.length > 0 ? (
          // Findtern Pro filters are the likeliest cause of nobody matching: name them and offer to drop just those.
          <EmptyScene
            art
            title="No candidates match your CGPA or college filters"
            body={
              data.pro.hiddenNoScore > 0
                ? `${data.pro.hiddenNoScore} candidate${data.pro.hiddenNoScore === 1 ? " was" : "s were"} left out for having no score. Lower the minimum CGPA, turn off verified only or choose more colleges.`
                : "Lower the minimum CGPA, turn off verified only or choose more colleges."
            }
            next={{ label: "Clear CGPA and college filters", href: withFilters(filters, { cgpaMin: 0, cgpaVerified: false, colleges: [], collegeSort: null, page: "" }) }}
            who="You - widen the filters"
          />
        ) : data.cityList.length > 0 ? (
          // EMB-21: legacy offered "Clear location" and "Include remote
          // candidates" right on the empty result.
          <div>
            <EmptyScene
              art
              title={`No candidates for ${data.cityList.map(titleCase).join(", ")}`}
              body="Nobody in the pool has picked this city as a place to work yet. Clear the location, or include candidates who work remotely."
              next={{ label: "Clear location", href: withoutCity(filters) }}
              who="You - widen the search"
            />
            {!data.includeRemote ? (
              <p className="mt-3 text-center">
                <Link
                  href={withoutCity(filters, { remote: true })}
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
          {/* Chunks, not one endless scroll: how many to a page is the employer's choice. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:mt-1">
            <p className="nums text-sm text-ink-600">
              Showing <strong className="font-semibold text-ink-900">{firstShown}&ndash;{lastShown}</strong> of <strong className="font-semibold text-ink-900">{total}</strong>
            </p>
            <PageSizeControl filters={filters} />
          </div>
          <ul
            aria-label="Candidates"
            className={cn("mt-3", filters.view === "grid" ? "grid gap-5 sm:grid-cols-2 2xl:grid-cols-3" : filters.view === "rows" ? "flex flex-col gap-2.5" : "flex flex-col gap-4 lg:gap-5")}
          >
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
                  projectId={data.activeProjectId}
                  shortlisted={data.shortlisted.has(candidate.id)}
                  nameUnlocked={data.nameUnlocked.has(candidate.id)}
                  pricing={resolvePricing(candidate.score, data.plans, data.currency, data.region, PER_HIRE_FEE_DEFAULT)}
                  proposal={rel?.proposal ?? null}
                  expired={rel?.expired ?? null}
                  wantedSkills={data.effectiveSkills}
                  presence={data.presence[candidate.id] ?? null}
                  interested={data.saved.has(candidate.id)}
                  pendingMeetingAt={rel?.pendingMeetingAt ?? null}
                  layout={filters.view}
                />
              );
            })}
          </ul>

          {/* "Showing 1-4 of 24", then the page links when there is more than one page. */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-xs sm:p-5">
            <p className="nums text-sm text-ink-600">
              Showing <strong className="font-semibold text-ink-900">{firstShown}&ndash;{lastShown}</strong> of <strong className="font-semibold text-ink-900">{total}</strong> candidate{total === 1 ? "" : "s"}
            </p>
            <PageSizeControl filters={filters} className="max-sm:w-full" />
            {pages > 1 ? (
              <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
                {currentPage > 1 ? (
                  <Link href={withFilters(filters, { page: currentPage - 1 === 1 ? "" : currentPage - 1 })} className={pageLink}>
                    Previous
                  </Link>
                ) : null}
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter((page) => page === 1 || page === pages || Math.abs(page - currentPage) <= 1)
                  .map((page, i, visible) => (
                    <span key={page} className="flex items-center gap-1.5">
                      {i > 0 && visible[i - 1] !== page - 1 ? <span className="px-1 text-ink-500">…</span> : null}
                      <Link
                        href={withFilters(filters, { page: page === 1 ? "" : page })}
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-label={`Page ${page}`}
                        className={cn(
                          "nums grid size-10 place-items-center rounded-xl text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 touch:size-11",
                          page === currentPage ? "bg-ink-900 text-white" : "text-ink-800 hover:bg-ink-100",
                        )}
                      >
                        {page}
                      </Link>
                    </span>
                  ))}
                {currentPage < pages ? (
                  <Link href={withFilters(filters, { page: currentPage + 1 })} className={cn(pageLink, "text-ink-900")}>
                    Next
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
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
