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
import { RememberSelection } from "@/components/employer/remember-selection";
import { HireFlow } from "@/components/employer/hire-flow";
import { hireFlowCountsFor } from "@/lib/employer-flow";
import { cn } from "@/lib/utils";
import { FILTER_PANEL_COOKIE } from "@/lib/rail";
import { FilterCollapse } from "@/components/employer/candidate-filter-collapse";
import { FilterColumn } from "./_filters";
import { ActiveFilters, CandidateSearch, Results } from "./_results";
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
  // unless the URL names them.
  const remembered = await rememberedSelection(uid);
  if (!filters.idsSet) filters.ids = remembered.compare;
  if (!filters.project && remembered.project) filters.project = remembered.project;

  const [data, flow] = await Promise.all([
    loadCandidates(uid, filters, {
      hasFilterParams: FILTER_KEYS.some((key) => params[key as keyof SearchParams] !== undefined),
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
    "inline-flex min-h-9 items-center px-1.5 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11";
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
        className="mb-3 sm:mb-4 lg:mb-5"
      />
      {/* The hiring-steps strip already links Candidates and Shortlist with their counts; Compare opens from the selection bar once two are ticked. */}
      {flow ? <HireFlow counts={flow} current="candidates" currentCount={loadFailed ? null : total} /> : null}

      {/*
        Phones: search and the Filters button share the top line, the skill tokens sit under them, then the list.
        lg: search and skills span the top; the filter column and the results sit side by side under them.
      */}
      {/* DOM order is the tab order: search, skills, then the filter column (row 3 at lg), then results. */}
      <FilterCollapse
        initialHidden={filtersHidden}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-12 lg:data-[filters=hidden]:grid-cols-[minmax(0,1fr)]"
      >
        {/* Phones: three plain rows (search, skills, chips). lg: one card, as the page's toolbar. */}
        <div className="contents lg:col-span-full lg:row-start-1 lg:mb-6 lg:block lg:rounded-2xl lg:border lg:border-ink-200 lg:bg-white lg:p-5 lg:shadow-xs">
          <CandidateSearch filters={filters} className="col-start-1 row-start-1 lg:col-span-full lg:max-w-[44rem]" />
          <SkillFilter
            className="col-span-2 row-start-2 mt-2 mb-3 lg:col-span-full lg:mb-6"
            active={data.effectiveSkills}
            projectSkills={data.activeProjectSkills}
            fromProject={!filters.skillsSet && filters.projectDefaults && data.activeProjectSkills.length > 0}
          >
            {/* The selected project fills in its skills (and city); one quiet link turns that off. */}
            {projectToggle ? <span className="contents max-lg:hidden">{projectToggle}</span> : null}
          </SkillFilter>

          <ActiveFilters
            data={data}
            filters={filters}
            className="col-span-2 row-start-3 mb-1 lg:mt-3 lg:border-t lg:border-ink-100 lg:pt-3"
          />
        </div>

        <div id="candidate-filter-column" className="col-start-2 row-start-1 lg:col-span-1 lg:col-start-1 lg:row-start-3 lg:group-data-[filters=hidden]/fl:hidden">
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
          />
        </div>

        {/* Phones: the compare tray sits over the bottom nav, so the last row needs room to scroll clear of it. */}
        <div className={cn("col-span-2 row-start-4 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-3 lg:group-data-[filters=hidden]/fl:col-start-1", compareIds.length >= 1 && "pb-24")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : rememberQueryOf(filters)} />

          {compareIds.length >= 1 ? (
            <div
              id="compare-bar"
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
