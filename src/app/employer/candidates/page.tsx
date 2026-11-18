import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { MAX_COMPARE, rememberedSelection } from "@/lib/employer-selection";
import { SkillFilter } from "@/components/employer/skill-filter";
import { KeepFocusClear } from "@/components/app/keep-focus-clear";
import { PageHead } from "@/components/app/primitives";
import { StageTrail } from "@/components/employer/candidates/stage-trail";
import { RememberSelection } from "@/components/employer/remember-selection";
import { hireFlowCountsFor } from "@/lib/employer-flow";
import { cn } from "@/lib/utils";
import { FILTER_PANEL_COOKIE } from "@/lib/rail";
import { FilterCollapse } from "@/components/employer/candidate-filter-collapse";
import { FilterColumn } from "./_filters";
import { ActiveFilters, CandidateSearch, ProjectSwitch, Results, StatusRow, ToolbarSort } from "./_results";
import {
  FILTER_KEYS,
  compareHref,
  loadCandidates,
  one,
  readFilters,
  rememberQueryOf,
  withFilters,
  type SearchParams,
} from "./_query";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  await requireEmployerSetup(uid);
  const params = await searchParams;
  // From lg up the filter column can be hidden; the choice is a cookie, so the server paints it with no flash.
  const filtersHidden = (await cookies()).get(FILTER_PANEL_COOKIE)?.value === "1";

  // Legacy `?ftInternId=` opened the full-time offer for a hire: the offer
  // lives on the candidate's profile now.
  const ftIntern = one(params.ftInternId);
  if (ftIntern) redirect(`/employer/intern/${encodeURIComponent(ftIntern)}`);

  const filters = readFilters(params);
  // The project and compare picks carry over from the last visit (cookie)
  // unless the URL names them. Picks belong to a project: this project's own.
  const remembered = await rememberedSelection(uid, filters.project);
  if (!filters.idsSet) filters.ids = remembered.compare;
  if (!filters.project && remembered.project) filters.project = remembered.project;

  const [data, flow] = await Promise.all([
    loadCandidates(uid, filters, {
      // A link that names the view is not a bare visit: restoring the remembered filters would drop it.
      hasFilterParams: params.view !== undefined || FILTER_KEYS.some((key) => params[key as keyof SearchParams] !== undefined),
      fresh: one(params.fresh) === "1",
    }),
    hireFlowCountsFor(uid),
  ]);
  if (data.restoreTo) redirect(data.restoreTo);

  // After the load: it drops compare picks the employer has since hired (they are not on this list).
  const compareIds = filters.ids;
  const { total, loadFailed, activeProjectId, projectApplied } = data;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const pickedHere = data.candidates.filter((c) => compareIds.includes(c.id));

  const quietLink =
    "inline-flex min-h-11 items-center px-1.5 text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900";
  // The selected project's skills on or off. lg and up: beside the skill chips; phones: inside the Filters sheet, so it is not a row of its own.
  const projectToggle = projectApplied ? (
    <Link
      href={withFilters(filters, { projectDefaults: false, page: "" })}
      className={quietLink}
      title={projectApplied.city ? `Matched to ${projectApplied.name}, open to working in ${projectApplied.city}` : `Matched to ${projectApplied.name}`}
    >
      Ignore project skills
    </Link>
  ) : !filters.projectDefaults && activeProjectId ? (
    <Link href={withFilters(filters, { projectDefaults: true, page: "" })} className={quietLink}>
      Match to project
    </Link>
  ) : null;

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
        action={<ProjectSwitch data={data} className="max-sm:w-full" />}
        className="mb-4 lg:mb-5"
      />
      {/* The funnel, one ruled line: every stage links, the busy ones carry their figure. */}
      {flow ? <StageTrail counts={flow} current="candidates" currentCount={loadFailed ? null : total} /> : null}

      {/*
        Phones: header, funnel, the count, then search and the Filters button share a line, skills, chips, Sort, the list.
        lg: the lead figure with Sort across the top, skills under it; the sticky rail and the ranked list side by side below.
      */}
      <FilterCollapse
        initialHidden={filtersHidden}
        className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-x-10 lg:data-[filters=hidden]:grid-cols-[minmax(0,1fr)]"
      >
        <StatusRow data={data} filters={filters} className="col-span-2 row-start-1 lg:col-span-full" />
        <ToolbarSort data={data} filters={filters} className="col-span-2 row-start-5 mb-3 mt-1 lg:col-span-full lg:row-start-1 lg:mb-0 lg:mt-0 lg:justify-self-end lg:self-end" />

        <CandidateSearch id="candidate-search-phone" filters={filters} className="col-start-1 row-start-2 mt-4 lg:hidden" />
        <SkillFilter
          className="col-span-2 row-start-3 mt-3 lg:col-span-full lg:mb-1 lg:mt-5"
          active={data.effectiveSkills}
          projectSkills={data.activeProjectSkills}
          fromProject={!filters.skillsSet && filters.projectDefaults && data.activeProjectSkills.length > 0}
          hasPro={data.pro.active}
        >
          {/* The selected project fills in its skills (and city); one quiet link turns that off. */}
          {projectToggle ? <span className="contents max-lg:hidden">{projectToggle}</span> : null}
        </SkillFilter>

        <ActiveFilters data={data} filters={filters} className="col-span-2 row-start-4 mb-1 lg:col-span-full" />

        {/* lg: the rail holds search and every filter and stays put while the list scrolls. Phones: just the Filters button, beside the search. */}
        <div
          id="candidate-filter-column"
          className="col-start-2 row-start-2 mt-4 lg:sticky lg:top-20 lg:col-span-1 lg:col-start-1 lg:row-start-6 lg:mt-6 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-2 lg:group-data-[filters=hidden]/fl:hidden lg:[scrollbar-color:transparent_transparent] lg:[scrollbar-width:thin] lg:hover:[scrollbar-color:var(--color-ink-300)_transparent] lg:focus-within:[scrollbar-color:var(--color-ink-300)_transparent]"
        >
          <CandidateSearch filters={filters} className="mb-5 max-lg:hidden" />
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
            projectToggle={projectToggle}
            pro={data.pro}
          />
        </div>

        {/* Phones: the compare tray sits above the bottom nav, so the last row needs room to scroll clear of it. */}
        <div className={cn("col-span-2 row-start-6 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-6 lg:mt-6 lg:group-data-[filters=hidden]/fl:col-start-1", compareIds.length >= 1 && "pb-28")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : rememberQueryOf(filters)} />

          {compareIds.length >= 1 ? (
            <div
              id="compare-bar"
              role="region"
              aria-label="Compare selection"
              className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-lg border border-brand-950 bg-brand-900 py-2 pl-4 pr-2 text-white shadow-[var(--shadow-float)] sm:w-max sm:gap-4 sm:py-2.5 sm:pl-5 sm:pr-2.5 lg:bottom-6 lg:left-[calc(50%+var(--console-rail,0rem)/2)]"
            >
              <KeepFocusClear of="compare-bar" />
              {/* Initials of the picks that are on this page; the rest are counted, never guessed. */}
              <span aria-hidden className="flex items-center -space-x-1.5 max-sm:hidden">
                {pickedHere.slice(0, 4).map((c) => (
                  <span key={c.id} className="grid size-8 place-items-center rounded-full border-2 border-brand-900 bg-white/20 text-xs font-semibold">
                    {c.initials}
                  </span>
                ))}
                {compareIds.length > pickedHere.slice(0, 4).length ? (
                  <span className="nums grid size-8 place-items-center rounded-full border-2 border-brand-900 bg-white/10 text-xs font-semibold">
                    +{compareIds.length - pickedHere.slice(0, 4).length}
                  </span>
                ) : null}
              </span>
              <span className="nums min-w-0 flex-1 truncate text-sm font-semibold">
                {compareIds.length} candidate{compareIds.length === 1 ? "" : "s"} selected
                <span className="font-normal text-white/80">
                  {compareIds.length === 1 ? " · pick one more" : compareFull ? ` · ${MAX_COMPARE} max` : ""}
                </span>
              </span>
              <Link
                href={withFilters(filters, { ids: [] })}
                scroll={false}
                className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-white/90 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              >
                Deselect all
              </Link>
              {compareIds.length >= 2 ? (
                <Link
                  href={compareHref(filters)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md bg-surface-raised px-4 text-sm font-semibold text-ink-900 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
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
