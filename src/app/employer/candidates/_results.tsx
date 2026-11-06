import Link from "next/link";
import { ArrowUpDown, LayoutGrid, List, Scale, Search, X } from "lucide-react";

import {
  displayNameOf,
  redactForEmployer,
} from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { PLAN_NAME, bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { MAX_COMPARE } from "@/lib/employer-selection";
import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";
import { CandidateCard } from "@/components/employer/candidate-card";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { candidateStatusPill, proposalActionLabel } from "@/components/employer/candidate-status";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { PresenceDot } from "@/components/app/presence-dot";
import { EmptyScene, Pill, Surface } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { fieldClass } from "@/components/employer/ui-tokens";
import { SortSelect } from "./_sort-select";
import {
  SORT_OPTIONS,
  activeChips,
  queryOf,
  resetHref,
  titleCase,
  toggle,
  withFilters,
  withoutCity,
  type CandidatesData,
  type Filters,
} from "./_query";

/** Compact view: score + actions beside the name; the skills sit under the identity. */
const COMPACT_GRID =
  "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_6.5rem_10rem] 2xl:grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_10rem]";

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
  const firstShown = (Math.min(filters.page, pages) - 1) * filters.pageSize + 1;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const compareLink = (id: string) =>
    compareIds.includes(id) || !compareFull ? withFilters(filters, { ids: toggle(compareIds, id) }) : null;
  const chips = activeChips(filters);
  const reset = resetHref(data.activeProjectId);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Keyword search: skills or city - never a name or bio (the pool is redacted). */}
        <form method="get" role="search" className="relative min-w-0 flex-1 basis-56">
          {Array.from(new URLSearchParams(queryOf({ ...filters, q: "", page: 1 }).slice(1)).entries()).map(([k, v], i) => (
            <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
          ))}
          <label htmlFor="candidate-search" className="sr-only">
            Search by skill or city
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            id="candidate-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search by skill or city"
            className={cn(fieldClass, "rounded-full pl-10")}
          />
        </form>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* A live count: filters apply on change, so this is how a screen reader hears the result. */}
          {loadFailed ? null : (
            <p role="status" className="nums text-base font-semibold text-ink-900">
              {total} candidate{total === 1 ? "" : "s"}
              {candidates.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-ink-600">
                  Showing {firstShown}–{firstShown + candidates.length - 1}
                </span>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <SortSelect
              value={filters.sorts[0] ?? ""}
              options={[
                { value: "", label: "Best match", href: withFilters(filters, { sorts: [], page: "" }) },
                ...SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label, href: withFilters(filters, { sorts: [o.value], page: "" }) })),
              ]}
            />
            <Link
              href={withFilters(filters, { dir: filters.dir === "asc" ? "desc" : "asc", page: "" })}
              scroll={false}
              aria-label={filters.dir === "asc" ? "Order: low to high. Switch to high to low" : "Order: high to low. Switch to low to high"}
              title={filters.dir === "asc" ? "Low to high" : "High to low"}
              className={buttonClass({ variant: "outline", size: "icon", className: "size-11 sm:size-10" })}
            >
              <ArrowUpDown className="size-4" aria-hidden />
            </Link>
          </div>
          <Segmented label="View">
            <SegmentLink href={withFilters(filters, { view: "grid" })} active={filters.view === "grid"} label="Detailed rows">
              <LayoutGrid className="size-4" aria-hidden />
            </SegmentLink>
            <SegmentLink href={withFilters(filters, { view: "table" })} active={filters.view === "table"} label="Compact rows">
              <List className="size-4" aria-hidden />
            </SegmentLink>
          </Segmented>
          <Segmented label="Per page">
            {[12, 24, 48].map((size) => (
              <SegmentLink key={size} href={withFilters(filters, { pageSize: size, page: 1 })} active={filters.pageSize === size} label={`${size} per page`}>
                <span className="nums">{size}</span>
              </SegmentLink>
            ))}
          </Segmented>
        </div>
      </div>

      {chips.length > 0 ? (
        <ul aria-label="Active filters" className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link
                href={chip.href}
                scroll={false}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-2 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-100 touch:min-h-11"
              >
                {chip.label}
                <X className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={reset}
              className="inline-flex min-h-8 items-center rounded-full px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline touch:min-h-11"
            >
              Clear all
            </Link>
          </li>
        </ul>
      ) : null}

      {loadFailed ? (
        <LoadError what="the candidate pool" retryHref={withFilters(filters)} email={SITE.adminEmail} />
      ) : candidates.length === 0 ? (
        data.cityList.length > 0 ? (
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
          {filters.view === "table" ? (
            <CompactRows data={data} compareIds={compareIds} compareLink={compareLink} />
          ) : (
            // Thin dividers, no card per row: one surface, one list.
            <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
              {candidates.map((candidate) => {
                const rel = data.relations.get(candidate.id);
                return (
                  <CandidateCard
                    key={candidate.id}
                    // The AI interview recording stays hidden until hire; only the
                    // written report is shown before (legacy detail:1578).
                    candidate={redactForEmployer(candidate, data.nameUnlocked.has(candidate.id))}
                    currency={data.currency}
                    region={data.region}
                    selected={compareIds.includes(candidate.id)}
                    compareHref={compareLink(candidate.id)}
                    comparable={!rel?.hired}
                    projectId={data.activeProjectId}
                    shortlisted={data.shortlisted.has(candidate.id)}
                    nameUnlocked={data.nameUnlocked.has(candidate.id)}
                    pricing={resolvePricing(candidate.score, data.plans, data.currency, data.region)}
                    proposal={rel?.proposal ?? null}
                    fullTimeFrom={rel?.fullTimeFrom ?? null}
                    fullTime={data.fullTime}
                    wantedSkills={data.effectiveSkills}
                    presence={data.presence[candidate.id] ?? null}
                    interested={data.saved.has(candidate.id)}
                  />
                );
              })}
            </Surface>
          )}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((page) => page === 1 || page === pages || Math.abs(page - filters.page) <= 1)
                .map((page, i, visible) => (
                  <span key={page} className="flex items-center gap-2">
                    {i > 0 && visible[i - 1] !== page - 1 ? <span className="px-1 text-ink-400">…</span> : null}
                    <Link
                      href={withFilters(filters, { page: page === 1 ? "" : page })}
                      aria-current={page === filters.page ? "page" : undefined}
                      aria-label={`Page ${page}`}
                      className={buttonClass({
                        variant: page === filters.page ? "primary" : "outline",
                        size: "icon",
                        className: "nums text-sm",
                      })}
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

/** The dense ranked rows (the old "Rows" view), kept for scanning many at once. */
function CompactRows({
  data,
  compareIds,
  compareLink,
}: {
  data: CandidatesData;
  compareIds: string[];
  compareLink: (id: string) => string | null;
}) {
  const projectId = data.activeProjectId;
  return (
    <Surface className="overflow-hidden">
      {/* Column labels for scanning; each row also names its figures. */}
      <div aria-hidden className={cn(COMPACT_GRID, "hidden gap-x-6 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle lg:grid")}>
        <span>Candidate</span>
        <span className="text-right">Findtern Score</span>
        <span className="hidden text-right 2xl:block">AI interview</span>
        <span />
      </div>
      <ul className="divide-y divide-ink-100">
        {data.candidates.map((c) => {
          const rel = data.relations.get(c.id);
          const status = candidateStatusPill(rel?.proposal ?? null);
          const selected = compareIds.includes(c.id);
          const link = compareLink(c.id);
          const rate = resolvePricing(c.score, data.plans, data.currency, data.region);
          const name = displayNameOf(c, data.nameUnlocked.has(c.id));
          const wanted = new Set(data.effectiveSkills.map((k) => k.toLowerCase()));
          // The project's skills first, so the match is what you read.
          const skills = [...c.skills].sort((a, b) => Number(wanted.has(b.toLowerCase())) - Number(wanted.has(a.toLowerCase())));
          const meta = [c.city, c.workModes.join(" / "), c.hasLaptop === false ? "Needs a laptop" : c.hasLaptop ? "Own laptop" : ""].filter(Boolean).join(" · ");
          const presence = data.presence[c.id] ?? null;
          const skillLine =
            skills.length === 0 ? (
              "No skills listed"
            ) : (
              <>
                {skills.map((k, i) => (
                  <span key={k}>
                    {i > 0 ? " · " : ""}
                    <span className={wanted.has(k.toLowerCase()) ? "font-semibold text-ink-900" : undefined}>{k}</span>
                  </span>
                ))}
              </>
            );
          return (
            <li key={c.id} className={cn(COMPACT_GRID, "relative grid items-center gap-x-6 gap-y-2 px-5 py-3.5 transition-colors hover:bg-ink-50/70")}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0">
                  <CandidateAvatar photoUrl={c.photoUrl} initials={c.initials} className="size-10 rounded-full text-xs" />
                  {presence ? (
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-white">
                      <PresenceDot label={presence} />
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    {/* The row opens the profile; the link is stretched over it. */}
                    <Link
                      href={`/employer/intern/${c.id}${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`}
                      className="break-words text-base font-medium text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
                    >
                      {name}
                      {presence ? <span className="sr-only">, {presence}</span> : null}
                    </Link>
                    {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
                    {data.saved.has(c.id) ? (
                      <Pill tone="live" className="shrink-0 whitespace-nowrap">
                        Interested in this role
                      </Pill>
                    ) : null}
                  </div>
                  <p className="text-sm text-ink-600">{meta || "Location not stated"}</p>
                  <p className="mt-0.5 hidden text-pretty text-sm text-ink-600 lg:block">{skillLine}</p>
                </div>
              </div>
              <p className="min-w-0 text-pretty text-sm text-ink-600 max-lg:col-span-2 max-lg:pl-[3.25rem] lg:hidden">{skillLine}</p>
              <div className="text-right max-lg:col-start-2 max-lg:row-start-1">
                <p className="nums text-xl font-semibold text-ink-900">
                  {c.scored ? c.score.toFixed(1) : "-"}
                  <span className="sr-only"> Findtern Score</span>
                </p>
                <p className="nums whitespace-nowrap text-xs text-ink-600">
                  {PLAN_NAME[bandFor(c.score).id]} · {formatRate(rate.hourlyRateMinor, data.currency)}
                </p>
              </div>
              <p className="nums hidden text-right text-sm font-medium text-ink-900 2xl:block">
                {c.ratings.interview > 0 ? c.ratings.interview.toFixed(1) : <span className="text-text-subtle">-</span>}
                <span className="sr-only"> AI interview rating</span>
              </p>
              <div className="relative z-10 flex items-center justify-end gap-1.5 max-lg:col-span-2 max-lg:justify-start max-lg:pl-[3.25rem]">
                {rel?.proposal ? (
                  <ButtonLink
                    href={`/employer/proposal/${encodeURIComponent(rel.proposal.id)}`}
                    variant="outline"
                    size="sm"
                    // Starts with the visible word so voice control can say it (WCAG 2.5.3).
                    aria-label={`${rel.proposal.status === "hired" ? "Placement" : "Proposal"}: ${proposalActionLabel(rel.proposal)}`}
                  >
                    {rel.proposal.status === "hired" ? "Placement" : "Proposal"}
                  </ButtonLink>
                ) : projectId ? (
                  <ShortlistToggle internId={c.id} projectId={projectId} shortlisted={data.shortlisted.has(c.id)} size="sm" emphasis="primary" />
                ) : null}
                {rel?.hired ? null : link ? (
                  <Link
                    href={link}
                    scroll={false}
                    // Starts with the phone label ("In compare" / "Compare") so voice control can say it (2.5.3).
                    aria-label={selected ? `In compare: remove ${name}` : `Compare ${name}`}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: cn("min-h-11", selected && "bg-brand-50 text-brand-800"),
                    })}
                  >
                    <Scale className="size-4" aria-hidden />
                    {/* Icon-only beside the row's main action at desktop; named on phones. */}
                    <span className="lg:sr-only">{selected ? "In compare" : "Compare"}</span>
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-apple-md border border-ink-200/80 bg-white p-1">
      {children}
    </div>
  );
}

function SegmentLink({ href, active, label, children }: { href: string; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      title={label}
      className={cn(
        "apple-spring inline-flex min-h-9 min-w-9 items-center justify-center rounded-apple-sm px-2 text-sm font-medium touch:min-h-11 touch:min-w-11",
        active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
      )}
    >
      {children}
    </Link>
  );
}
