import type { Metadata } from "next";
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
import { cn } from "@/lib/utils";
import { FilterColumn } from "./_filters";
import { CandidateSearch, Results } from "./_results";
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
  const compareIds = filters.ids;

  const data = await loadCandidates(uid, filters, {
    hasFilterParams: FILTER_KEYS.some((key) => params[key as keyof SearchParams] !== undefined),
    fresh: one(params.fresh) === "1",
  });
  if (data.restoreTo) redirect(data.restoreTo);

  const { total, loadFailed, activeProjectId, projectApplied } = data;
  const compareFull = compareIds.length >= MAX_COMPARE;

  const quietLink =
    "inline-flex min-h-9 items-center px-1.5 text-[13px] font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900 touch:min-h-11";

  return (
    <div>
      <PageHead title="Candidates" className="mb-4 lg:mb-6" />

      {/*
        Phones: search and the Filters button share the top line, the skill tokens sit under them, then the list.
        lg: search and skills span the top; the filter column and the results sit side by side under them.
      */}
      {/* DOM order is the tab order: search, skills, then the filter column (row 3 at lg), then results. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-x-12">
        <CandidateSearch filters={filters} className="col-start-1 row-start-1 lg:col-span-2 lg:max-w-[44rem]" />
        <SkillFilter
          className="col-span-2 row-start-2 mt-2 mb-3 lg:mb-6"
          active={data.effectiveSkills}
          projectSkills={data.activeProjectSkills}
          fromProject={!filters.skillsSet && filters.projectDefaults && data.activeProjectSkills.length > 0}
        >
          {/* The selected project fills in its skills (and city); one quiet link turns that off. */}
          {projectApplied ? (
            <Link
              href={withFilters(filters, { projectDefaults: false, page: "" })}
              className={quietLink}
              title={projectApplied.city ? `Matched to ${projectApplied.name}, open to working in ${projectApplied.city}` : `Matched to ${projectApplied.name}`}
            >
              Show everyone
            </Link>
          ) : !filters.projectDefaults && activeProjectId ? (
            <Link href={withFilters(filters, { projectDefaults: true, page: "" })} className={quietLink}>
              Match to project
            </Link>
          ) : null}
        </SkillFilter>

        <div className="col-start-2 row-start-1 lg:col-span-1 lg:col-start-1 lg:row-start-3">
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
          />
        </div>

        {/* Phones: the compare tray sits over the bottom nav, so the last row needs room to scroll clear of it. */}
        <div className={cn("col-span-2 row-start-3 min-w-0 lg:col-span-1 lg:col-start-2", compareIds.length >= 1 && "pb-24")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : rememberQueryOf(filters)} />

          {compareIds.length >= 1 ? (
            <div
              id="compare-bar"
              role="region"
              aria-label="Compare selection"
              className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900 py-1.5 pl-5 pr-1.5 text-white shadow-[0_12px_32px_-8px_rgb(0_0_0/0.35)] sm:w-max lg:bottom-6 lg:left-[calc(50%+var(--console-rail,0rem)/2)]"
            >
              <KeepFocusClear of="compare-bar" />
              <span className="nums min-w-0 flex-1 truncate text-sm font-medium">
                {compareIds.length} selected
                <span className="text-white/60">
                  {compareIds.length === 1 ? " · pick one more" : compareFull ? ` · ${MAX_COMPARE} max` : ""}
                </span>
              </span>
              <Link
                href={withFilters(filters, { ids: [] })}
                scroll={false}
                className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              >
                Clear
              </Link>
              {compareIds.length >= 2 ? (
                <Link
                  href={compareHref(filters)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-ink-900 outline-none hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900"
                >
                  Compare
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : null}

          <Results data={data} filters={filters} compareIds={compareIds} />
        </div>
      </div>
    </div>
  );
}
