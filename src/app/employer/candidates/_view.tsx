import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MAX_COMPARE } from "@/lib/compare-map";
import { SkillFilter } from "@/components/employer/skill-filter";
import { KeepFocusClear } from "@/components/app/keep-focus-clear";
import { PageHead, SURFACE_CLASS } from "@/components/app/primitives";
import { RememberSelection } from "@/components/employer/remember-selection";
import { HireFlow } from "@/components/employer/hire-flow";
import type { hireFlowCountsFor } from "@/lib/employer-flow";
import { cn } from "@/lib/utils";
import { FilterCollapse } from "@/components/employer/candidate-filter-collapse";
import { FilterColumn } from "./_filters";
import { Results } from "./_results";
import { ActiveFilters, ContextLine, SlimCount, ToolbarEnd, ToolbarSort, matchStateOf, projectNameOf } from "./_toolbar";
import { CandidateSearch } from "@/components/employer/candidates/candidate-search";
import { ProjectMatchControl } from "@/components/employer/candidates/project-match-control";
import { StickyBar } from "@/components/employer/candidates/sticky-bar";
import { compareHref, queryOf, rememberQueryOf, withFilters, type CandidatesData, type Filters } from "@/lib/candidates-params";

/** The page body, split from `page.tsx` (auth and loading) so it renders from plain data. */
export function CandidatesView({
  uid,
  data,
  filters,
  flow,
  filtersHidden,
}: {
  uid: string;
  data: CandidatesData;
  filters: Filters;
  flow: Awaited<ReturnType<typeof hireFlowCountsFor>>;
  filtersHidden: boolean;
}) {
  // After the load: it drops compare picks the employer has since hired (they are not on this list).
  const compareIds = filters.ids;
  const { total, loadFailed, activeProjectId, projectApplied } = data;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const pickedHere = data.candidates.filter((c) => compareIds.includes(c.id));

  // How the selected project fills the list, as one control: lg and up in the toolbar card, phones inside the Filters sheet.
  const match = matchStateOf(data, filters);
  const projectToggle = <ProjectMatchControl state={match} projectName={projectNameOf(data)} hasPro={data.pro.active} />;
  // The current filters without the keyword and the page: what a search or a suggestion builds its link on.
  const searchBase = queryOf({ ...filters, q: "", page: 1, saved: false }).slice(1);
  const searchProps = { q: filters.q, base: searchBase, required: data.effectiveSkills, hasPro: data.pro.active };

  return (
    <div>
      <PageHead
        title="Candidates"
        lede={
          <>
            <span className="max-sm:hidden">Names and contact details unlock once your hire is paid. Scores and skills are visible now.</span>
            <span className="sm:hidden">Names unlock once your hire is paid.</span>
          </>
        }
        className="mb-3 sm:mb-4 lg:mb-5 [&_h1]:text-[32px] [&_h1]:leading-10"
      />
      {/* The hiring-steps strip already links Candidates and Shortlist with their counts; Compare opens from the selection bar once two are ticked. */}
      {flow ? <HireFlow counts={flow} current="candidates" currentCount={loadFailed || (filters.saved && Boolean(activeProjectId)) ? null : total} /> : null}

      {/* lg and up: the slim bar that takes over once the toolbar card scrolls out. */}
      <StickyBar targetId="candidate-toolbar" label="Search and sort">
        <div className="flex items-center gap-3">
          <CandidateSearch id="candidate-search-slim" compact {...searchProps} className="min-w-0 flex-1 xl:max-w-md" />
          <SlimCount data={data} filters={filters} />
          <ToolbarSort data={data} filters={filters} compact className="shrink-0 flex-nowrap justify-end" />
        </div>
      </StickyBar>

      {/*
        Phones: search has the top line to itself (so its placeholder is never cut), then the count beside the Filters button, then the skill tokens, the chips, then Sort and view.
        lg: search and Sort span the top of one card, then the count, skills and chips; the filter column and the results sit side by side under it.
        DOM order is the tab order: search, skills, chips, sort, view, then project and Filters (row 2 at lg), the filter column, the results.
      */}
      <FilterCollapse
        initialHidden={filtersHidden}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-8 lg:data-[filters=hidden]:grid-cols-[minmax(0,1fr)]"
      >
        <div
          id="candidate-toolbar"
          // `contents` on phones: the rows below join the page grid and the card look appears at lg.
          className={cn(SURFACE_CLASS, "max-lg:contents lg:col-span-full lg:row-start-1 lg:mb-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:p-5")}
        >
          <CandidateSearch {...searchProps} className="col-span-2 col-start-1 row-start-1 xl:col-span-1 xl:max-w-[44rem]" />
          <ContextLine data={data} filters={filters} match={match} className="col-start-1 row-start-2 mt-2 self-center lg:col-span-1 lg:row-start-3 lg:mt-3 xl:row-start-2" />
          <SkillFilter
            className="col-span-2 row-start-3 mt-2 mb-3 lg:col-span-full lg:row-start-4 lg:mb-0 lg:mt-4 xl:row-start-3 lg:border-t lg:border-ink-100 lg:pt-4"
            active={data.effectiveSkills}
            projectSkills={data.activeProjectSkills}
            fromProject={!filters.skillsSet && filters.projectDefaults && data.activeProjectSkills.length > 0}
            hasPro={data.pro.active}
            projectControl={match === "none" ? undefined : <div className="max-lg:hidden">{projectToggle}</div>}
          />
          <ActiveFilters data={data} filters={filters} className="col-span-2 row-start-4 mb-1 lg:col-span-full lg:row-start-5 lg:mb-0 lg:mt-3 xl:row-start-4 lg:border-t lg:border-ink-100 lg:pt-3" />
          <ToolbarSort data={data} filters={filters} className="col-span-2 col-start-1 row-start-5 justify-self-end max-sm:justify-self-stretch lg:col-span-2 lg:row-start-2 lg:mt-3 lg:justify-self-start xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mt-0 xl:justify-self-auto" />
          <ToolbarEnd data={data} filters={filters} className="lg:col-start-2 lg:row-start-3 lg:mt-3 lg:justify-self-end xl:row-start-2" />
        </div>

        {/* The column sticks below the slim bar (4rem header + the bar), not just the header. */}
        <div id="candidate-filter-column" className="lg:[&>aside]:top-36 lg:[&>aside]:max-h-[calc(100dvh-10rem)] col-start-2 row-start-2 mt-2 self-center lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:self-auto lg:group-data-[filters=hidden]/fl:hidden">
          <FilterColumn
            filters={filters}
            projects={data.projects}
            activeProjectId={activeProjectId}
            includeRemote={data.includeRemote}
            plans={data.plans}
            currency={data.currency}
            region={data.region}
            compareIds={compareIds}
            total={total}
            effectiveSkills={data.effectiveSkills}
            projectCity={projectApplied?.city ?? ""}
            cityDefault={data.cityDefault}
            projectToggle={projectToggle}
            pro={data.pro}
          />
        </div>

        {/* Phones: the compare tray sits over the bottom nav, so the last row needs room to scroll clear of it. */}
        <div className={cn("col-span-2 row-start-6 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-2 lg:group-data-[filters=hidden]/fl:col-start-1", compareIds.length >= 1 && "pb-24")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : rememberQueryOf(filters)} />

          {compareIds.length >= 1 ? (
            <div
              id="compare-bar"
              data-floating-bar
              role="region"
              aria-label="Compare selection"
              className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-2xl border border-brand-800 bg-brand-950 py-2 pl-4 pr-2 text-white shadow-[0_12px_32px_-8px_rgb(0_0_0/0.35)] sm:w-max sm:gap-4 sm:py-3 sm:pl-5 sm:pr-3 lg:bottom-6 lg:left-[calc(50%+var(--console-rail,0rem)/2)]"
            >
              <KeepFocusClear of="compare-bar" />
              {/* Initials of the picks that are on this page; the rest are counted, never guessed. */}
              <span aria-hidden className="flex items-center -space-x-2 max-sm:hidden">
                {pickedHere.slice(0, 4).map((c) => (
                  <span key={c.id} className="grid size-8 place-items-center rounded-full border-2 border-brand-950 bg-white/20 text-[12px] font-bold">
                    {c.initials}
                  </span>
                ))}
                {compareIds.length > pickedHere.slice(0, 4).length ? (
                  <span className="nums grid size-8 place-items-center rounded-full border-2 border-brand-950 bg-white/10 text-[11px] font-bold">
                    +{compareIds.length - pickedHere.slice(0, 4).length}
                  </span>
                ) : null}
              </span>
              <span className="nums min-w-0 flex-1 truncate text-sm font-semibold">
                {compareIds.length} candidate{compareIds.length === 1 ? "" : "s"} selected
                <span className="font-normal text-white/70">
                  {compareIds.length === 1 ? " · pick one more" : compareFull ? ` · ${MAX_COMPARE} max` : ""}
                </span>
              </span>
              <Link
                href={withFilters(filters, { ids: [] })}
                scroll={false}
                className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-medium text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              >
                Deselect all
              </Link>
              {compareIds.length >= 2 ? (
                <Link
                  href={compareHref(filters)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
                >
                  <span className="max-sm:hidden">Compare side by side</span>
                  <span className="sm:hidden">Compare</span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : null}

          <Results data={data} filters={filters} compareIds={compareIds} />
        </div>
      </FilterCollapse>
    </div>
  );
}
