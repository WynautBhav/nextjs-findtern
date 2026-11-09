import Link from "next/link";
import { ChevronDown, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import { RATING_META } from "@/lib/employer-candidates";
import { resolvePricing, type Currency } from "@/lib/employer-pricing";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { schema } from "@/lib/db";
import { CityFilter } from "@/components/employer/city-filter";
import { RatingSlider } from "@/components/employer/candidate-filters";
import { buttonClass } from "@/components/ui/button";
import { fieldClass } from "@/components/employer/ui-tokens";
import { FilterPanel } from "./_filter-form";
import { activeFilterCount, queryOf, resetHref, type Filters } from "./_query";

const SELECT = cn(fieldClass, "mt-2");

/**
 * The left column (a sheet on phones): collapsible groups, every filter the
 * page has always had. Project is not a filter but sets the defaults below it.
 * Sorting lives in the results toolbar, not here.
 */
export function FilterColumn({
  filters,
  projects,
  activeProjectId,
  includeRemote,
  plans,
  currency,
  region,
  compareIds,
  total,
  effectiveSkills,
  projectCity = "",
  projectToggle = null,
}: {
  filters: Filters;
  projects: { id: string; projectName: string }[];
  activeProjectId: string | null;
  includeRemote: boolean;
  plans: (typeof schema.pricingPlans.$inferSelect)[];
  currency: Currency;
  region: "IN" | null;
  compareIds: string[];
  total: number;
  /** The skill chips under the search box: each one counts as an active filter. */
  effectiveSkills: string[];
  /** A city the selected project brings (not typed by hand): shown as its own chip and counted. */
  projectCity?: string;
  /** "Ignore project skills" / "Match to project": on a phone it lives in the sheet, not on the page. */
  projectToggle?: React.ReactNode;
}) {
  // Sub-score floors and the skill-match switch live behind "More filters".
  const moreSet = RATING_META.some((meta) => filters.minRatings[meta.key] > 0) || !filters.skillPriority;
  return (
    <aside
      aria-label="Filters"
      className={cn(
        "lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-ink-200 lg:bg-white lg:p-6 lg:shadow-xs",
        // Still scrollable, but the track only shows on hover or focus, so it does not read as a nested box.
        "lg:[scrollbar-color:transparent_transparent] lg:[scrollbar-width:thin] lg:hover:[scrollbar-color:var(--color-ink-300)_transparent] lg:focus-within:[scrollbar-color:var(--color-ink-300)_transparent]",
      )}
    >
      <FilterPanel key={queryOf(filters)} activeCount={activeFilterCount(filters, effectiveSkills, projectCity)} total={total}>
        {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
        {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
        {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
        {filters.sorts.length > 0 ? <input type="hidden" name="sort" value={filters.sorts.join(",")} /> : null}
        {filters.dir === "asc" ? <input type="hidden" name="dir" value="asc" /> : null}

        {/* lg: the card's own header. Phones get "Filters" from the sheet title. */}
        <div className="mb-1 flex items-center justify-between border-b border-ink-100 pb-3 max-lg:hidden">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <SlidersHorizontal className="size-[18px] text-ink-600" aria-hidden />
            Filters
          </h2>
          <Link href={resetHref(activeProjectId)} className="inline-flex min-h-9 items-center px-1 text-[13px] font-medium text-text-subtle underline-offset-4 hover:text-ink-900 hover:underline touch:min-h-11">
            Reset
          </Link>
        </div>
        <div className="divide-y divide-ink-100">
          {/* Project: the results bar picks it from lg up; the phone sheet needs it here. */}
          <div className="pb-4 lg:hidden">
            <div className="flex items-center justify-between">
              <label htmlFor="filter-project" className="text-sm font-semibold text-ink-900">
                Project
              </label>
              <Link href="/employer/projects" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-900">
                <Plus className="size-4" aria-hidden />
                New project
              </Link>
            </div>
            {projects.length > 0 ? (
              <select id="filter-project" name="project" defaultValue={activeProjectId ?? ""} className={SELECT}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-ink-600">No open projects. Create one to save and match candidates.</p>
            )}
            {projectToggle ? <div className="mt-1">{projectToggle}</div> : null}
          </div>

          <Group title="Location" open>
            <CityFilter key={filters.city} defaultValue={filters.city} label="Preferred work city" autoApply />
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              {/* Unchecked sends only the hidden 0; checked adds remote=1 after it. */}
              <input type="hidden" name="remote" value="0" />
              <input
                type="checkbox"
                name="remote"
                value="1"
                defaultChecked={includeRemote}
                className="size-4 rounded-[4px] border-ink-300 accent-ink-900"
              />
              Include remote-only candidates
            </label>
          </Group>

          <Group title="Findtern Score" open>
            <RatingSlider name="min" label="Minimum score" defaultValue={filters.minScore} />
          </Group>

          <Group title="Hourly price" open>
            <label htmlFor="filter-plan" className="sr-only">
              Hourly price
            </label>
            <select id="filter-plan" name="plan" defaultValue={filters.plan} className={SELECT}>
              <option value="">Any price</option>
              {BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {formatRate(resolvePricing(band.min, plans, currency, region).hourlyRateMinor, currency)} · {PLAN_NAME[band.id]}
                </option>
              ))}
            </select>
          </Group>

          <Group title="Availability" open>
            <label htmlFor="filter-mode" className="text-sm text-ink-700">
              Work mode
            </label>
            <select id="filter-mode" name="mode" defaultValue={filters.mode} className={SELECT}>
              <option value="">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              <input
                type="checkbox"
                name="laptop"
                value="yes"
                defaultChecked={filters.laptop === "yes"}
                className="size-4 rounded-[4px] border-ink-300 accent-ink-900"
              />
              Has own laptop
            </label>
          </Group>

          <Group title="More filters" open={moreSet}>
            <p className="mb-1 text-xs text-text-subtle">AI interview scores, each out of 10.</p>
            {RATING_META.map((meta) => (
              <RatingSlider key={meta.key} name={`r_${meta.key}`} label={meta.label} defaultValue={filters.minRatings[meta.key]} />
            ))}
            <label className="mt-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800">
              Most skills matched first
              {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
              <input type="hidden" name="sm" value="0" />
              <input type="checkbox" role="switch" name="sm" value="1" defaultChecked={filters.skillPriority} className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-6 w-10 shrink-0 rounded-full bg-ink-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-ink-900 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 motion-reduce:after:transition-none"
              />
            </label>
          </Group>

          {/* Filters apply as they change (QA-125): no Apply. On a phone "Show results" closes the sheet. */}
          <div className="flex items-center gap-2 pt-3 lg:hidden">
            <Link href={resetHref(activeProjectId)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline lg:hidden">
              <RotateCcw className="size-3.5" aria-hidden />
              Reset filters
            </Link>
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm", className: "ml-auto min-h-11 lg:hidden" })}>
              Show {total} result{total === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </FilterPanel>
    </aside>
  );
}

function Group({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open || undefined} className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-semibold text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-ink-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
