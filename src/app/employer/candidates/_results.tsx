import Link from "@/app/employer/candidates/_link";
import { ChevronDown, Info, X } from "lucide-react";

import { cardCandidate } from "@/lib/candidates-wire";
import { resolvePricing } from "@/lib/employer-pricing";
import { PER_HIRE_FEE_DEFAULT } from "@/lib/per-hire-fee";
import { MAX_COMPARE } from "@/lib/compare-map";
import { SITE } from "@/lib/content/site";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { cn } from "@/lib/utils";
import { CandidateCard } from "@/components/employer/candidate-card";
import { EmptyScene } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { PAGE_SIZES, pageWindow } from "@/components/employer/candidate-view";
import { Segmented, SegmentLink } from "@/components/employer/candidates/toolbar-parts";
import { SUBSCRIPTION_HREF } from "@/components/employer/candidates/pro-filters";
import { toggle, withFilters, type CandidatesData, type Filters } from "@/lib/candidates-params";
import { ZeroResults } from "./_zero-results";
import { ViewToggle } from "./_toolbar";

/** "Per page 12 24 48": how many candidates one page holds. Changing it returns to page 1. */
function PageSizeControl({ filters, className }: { filters: Filters; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-ink-600", className)}>
      <span className="max-sm:sr-only">Per page</span>
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
  fullTimeTrack = false,
}: {
  data: CandidatesData;
  filters: Filters;
  compareIds: string[];
  fullTimeTrack?: boolean;
}) {
  const { candidates, total, pages, loadFailed } = data;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const compareLink = (id: string) =>
    compareIds.includes(id) || !compareFull ? withFilters(filters, { ids: toggle(compareIds, id) }) : null;
  const saved = filters.saved && Boolean(data.activeProjectId);
  const paged = pageWindow(total, filters.page, filters.pageSize);
  const firstShown = paged.first;
  const lastShown = paged.last;
  const currentPage = paged.page;
  const pageLink =
    "inline-flex h-10 items-center rounded-xl bg-ink-100 px-3.5 text-sm font-medium text-ink-700 outline-none hover:bg-ink-200 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 touch:h-11";

  return (
    <>
      {/* All | this project's shortlist. The count of the list is the toolbar's (and the hiring-steps strip's): one place each, so no number is repeated here. */}
      {data.activeProjectId ? (
        <div className={cn("border-b border-ink-100 pb-3 sm:pb-4 lg:border-b-0 lg:pb-5", saved ? "flex" : "flex max-sm:hidden")}>
          <nav aria-label="Show" className="flex items-center gap-5">
            <TabLink href={withFilters(filters, { saved: false, page: "" })} active={!saved}>
              All candidates
            </TabLink>
            <TabLink href={withFilters(filters, { saved: true, page: "" })} active={saved} title="Candidates you shortlisted for this project, whatever the filters say. The Shortlist step above counts every project.">
              This project&rsquo;s shortlist <span className="nums text-ink-600">({data.savedCount})</span>
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
            body="Press Shortlist on a candidate to add them to this project's shortlist."
            next={{ label: "Browse all candidates", href: withFilters(filters, { saved: false, page: "" }) }}
            who="You - save a candidate"
          />
        ) : (
          <ZeroResults data={data} filters={filters} />
        )
      ) : (
        <>
          <ScoreLegend />
          {/* Chunks, not one endless scroll: how many to a page is the employer's choice. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:mt-1">
            <p className="nums text-sm text-ink-600">
              Showing <strong className="font-semibold text-ink-900">{firstShown}&ndash;{lastShown}</strong> of <strong className="font-semibold text-ink-900">{total}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <ViewToggle filters={filters} compact={false} />
              <PageSizeControl filters={filters} />
            </div>
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
                  // The one row mapper the results endpoint uses too (lib/candidates-wire): what leaves the server is decided there.
                  candidate={cardCandidate(candidate, data.nameUnlocked.has(candidate.id), data.pro.active)}
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
                  meetingOpen={rel?.meetingOpen ?? false}
                  layout={filters.view}
                  fullTimeTrack={fullTimeTrack}
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

function TabLink({ href, active, title, children }: { href: string; active: boolean; title?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
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
