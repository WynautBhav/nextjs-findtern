import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Scale } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { MAX_COMPARE, rememberedSelection } from "@/lib/employer-selection";
import { SkillFilter } from "@/components/employer/skill-filter";
import { KeepFocusClear } from "@/components/app/keep-focus-clear";
import { PageHead } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { RememberSelection } from "@/components/employer/remember-selection";
import { cn } from "@/lib/utils";
import { FilterColumn } from "./_filters";
import { Results } from "./_results";
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

  return (
    <div>
      <PageHead
        title="Candidates"
        lede={
          loadFailed
            ? "Ranked by Findtern Score."
            : `${total === 0 ? "No" : total} intern${total === 1 ? "" : "s"} match, ranked by Findtern Score.`
        }
      />

      <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
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

        {/* Phones: the compare bar sits ~13rem up (over the bottom nav, wrapping at 320px), so the last row needs room to scroll clear of it. */}
        <div className={cn("min-w-0", compareIds.length >= 1 && "max-lg:pb-32")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : rememberQueryOf(filters)} />
          <SkillFilter
            active={data.effectiveSkills}
            projectSkills={data.activeProjectSkills}
            fromProject={!filters.skillsSet && filters.projectDefaults && data.activeProjectSkills.length > 0}
          />

          {projectApplied ? (
            <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-lg border border-brand-200/80 bg-brand-50/70 px-4 py-3 text-sm text-ink-700">
              <span>
                {/* The skills are the chips just above; not listed again (QA-125). */}
                Matched to <span className="font-semibold text-ink-900">{projectApplied.name}</span>
                {projectApplied.city ? `, open to working in ${projectApplied.city}` : ""}. Best matches first.
              </span>
              <Link href={withFilters(filters, { projectDefaults: false, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                Show everyone
              </Link>
            </p>
          ) : !filters.projectDefaults && activeProjectId ? (
            <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-lg border border-ink-200/80 bg-white px-4 py-3 text-sm text-ink-700">
              Showing the whole pool.
              <Link href={withFilters(filters, { projectDefaults: true, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                Match to the selected project
              </Link>
            </p>
          ) : null}

          {compareIds.length >= 1 ? (
            <div
              id="compare-bar"
              role="region"
              aria-label="Compare selection"
              className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-apple-xl border border-brand-200/80 bg-white/95 px-5 py-3 shadow-lg backdrop-blur-md sm:w-max sm:max-w-[calc(100%-2rem)] lg:bottom-6 lg:left-[calc(50%+var(--console-rail,0rem)/2)] lg:max-w-[calc(100%-var(--console-rail,0rem)-4rem)]"
            >
              <KeepFocusClear of="compare-bar" />
              <span className="text-sm font-medium text-ink-900">
                {compareIds.length === 1
                  ? "1 selected · pick one more to compare"
                  : `${compareIds.length} of ${MAX_COMPARE} selected${compareFull ? " · limit reached" : ""}`}
              </span>
              <Link href={withFilters(filters, { ids: [] })} scroll={false} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
                Clear
              </Link>
              {compareIds.length >= 2 ? (
                <ButtonLink href={compareHref(filters)} variant="primary" size="sm" className="min-h-11">
                  <Scale className="size-4" aria-hidden />
                  Compare side by side
                </ButtonLink>
              ) : null}
            </div>
          ) : null}

          <Results data={data} filters={filters} compareIds={compareIds} />
        </div>
      </div>
    </div>
  );
}
