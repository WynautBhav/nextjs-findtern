import Link from "next/link";
import { Plus, RotateCcw, SlidersHorizontal } from "lucide-react";

import { RATING_META } from "@/lib/employer-candidates";
import { DEFAULT_PAGE_SIZE, cityField, sectionCounts } from "@/components/employer/candidate-view";
import { resolvePricing, type Currency } from "@/lib/employer-pricing";
import { PER_HIRE_FEE_DEFAULT } from "@/lib/per-hire-fee";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { schema } from "@/lib/db";
import { CityFilter } from "@/components/employer/city-filter";
import { RatingSlider } from "@/components/employer/candidate-filters";
import { buttonClass } from "@/components/ui/button";
import { fieldClass } from "@/components/employer/ui-tokens";
import { FilterSection } from "@/components/employer/candidates/filter-parts";
import { ProFilterSections, ProLockedCard } from "@/components/employer/candidates/pro-filters";
import { collegeSortToken } from "@/lib/candidate-sort";
import { FilterPanel } from "./_filter-form";
import { activeChips, activeFilterCount, queryOf, resetHref, type Filters, type ProData } from "@/lib/candidates-params";

const SELECT = cn(fieldClass, "mt-2");

/**
 * The left column (a sheet on phones): always-open labelled sections, every filter the
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
  cityDefault = "",
  projectToggle = null,
  pro,
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
  /** The selected project's own city: pre-fills "Preferred work city" unless the URL sets `city`. Read-only. */
  cityDefault?: string;
  /** "Ignore project skills" / "Match to project": on a phone it lives in the sheet, not on the page. */
  projectToggle?: React.ReactNode;
  /** Findtern Pro: who has the CGPA and college filters, and what they list. */
  pro: ProData;
}) {
  const city = cityField({ city: filters.city, citySet: filters.citySet, defaultCity: cityDefault });
  const count = sectionCounts(activeChips(filters).map((c) => c.key), Boolean(projectCity));
  return (
    <aside
      aria-label="Filters"
      className={cn(
        "lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-ink-200 lg:bg-white lg:p-6 lg:shadow-xs",
        // Still scrollable, but the track only shows on hover or focus, so it does not read as a nested box.
        "lg:[scrollbar-color:transparent_transparent] lg:[scrollbar-width:thin] lg:hover:[scrollbar-color:var(--color-ink-300)_transparent] lg:focus-within:[scrollbar-color:var(--color-ink-300)_transparent]",
      )}
    >
      <FilterPanel key={queryOf(filters)} cityDefault={cityDefault} activeCount={activeFilterCount(filters, effectiveSkills, projectCity)} total={total}>
        {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
        {filters.view !== "list" ? <input type="hidden" name="view" value={filters.view} /> : null}
        {filters.pageSize !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
        {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
        {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
        {filters.sorts.length > 0 || filters.collegeSort ? <input type="hidden" name="sort" value={[...filters.sorts, collegeSortToken(filters.collegeSort)].filter(Boolean).join(",")} /> : null}
        {filters.dir === "asc" ? <input type="hidden" name="dir" value="asc" /> : null}

        {/* lg: the card's own header. Phones get "Filters" from the sheet title. */}
        <div className="flex items-center justify-between pb-3 max-lg:hidden">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <SlidersHorizontal className="size-[18px] text-ink-600" aria-hidden />
            Filters
          </h2>
          <Link href={resetHref(activeProjectId)} className="inline-flex min-h-9 items-center px-1 text-[13px] font-medium text-text-subtle underline-offset-4 hover:text-ink-900 hover:underline touch:min-h-11">
            Reset
          </Link>
        </div>
        <div>
          {/* Project: the results bar picks it from lg up; the phone sheet needs it here. */}
          <div className="lg:hidden">
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

          <FilterSection title="Location & setup" count={count.location}>
            <CityFilter key={city.value} defaultValue={city.value} label="Preferred work city" autoApply />
            {city.prefilled ? <p className="mt-1.5 text-sm text-ink-700">From your project: {city.value}. Change it to narrow or widen the search.</p> : null}
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
          </FilterSection>

          <FilterSection title="Scores" count={count.scores}>
            <RatingSlider name="min" label="Findtern Score" defaultValue={filters.minScore} />
            <p className="mb-1 mt-2 text-xs text-text-subtle">AI interview scores, each out of 10.</p>
            {RATING_META.map((meta) => (
              <RatingSlider key={meta.key} name={`r_${meta.key}`} label={meta.label} defaultValue={filters.minRatings[meta.key]} />
            ))}
          </FilterSection>

          <FilterSection title="Hourly price" count={count.price}>
            <label htmlFor="filter-plan" className="sr-only">
              Hourly price
            </label>
            <select id="filter-plan" name="plan" defaultValue={filters.plan} className={SELECT}>
              <option value="">Any price</option>
              {BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {formatRate(resolvePricing(band.min, plans, currency, region, PER_HIRE_FEE_DEFAULT).hourlyRateMinor, currency)} · {PLAN_NAME[band.id]}
                </option>
              ))}
            </select>
          </FilterSection>

          <FilterSection title="Sorting" count={count.sorting}>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800">
              Most skills matched first
              {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
              <input type="hidden" name="sm" value="0" />
              <input type="checkbox" role="switch" name="sm" value="1" defaultChecked={filters.skillPriority} className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-6 w-10 shrink-0 rounded-full bg-ink-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-ink-900 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 motion-reduce:after:transition-none"
              />
            </label>
          </FilterSection>

          {pro.active ? (
            <ProFilterSections
              cgpaMin={filters.cgpaMin}
              cgpaVerified={filters.cgpaVerified}
              colleges={filters.colleges}
              options={pro.colleges}
            />
          ) : (
            <ProLockedCard offered={pro.offered} />
          )}

          {/* Filters apply as they change (QA-125): no Apply. On a phone "Show results" closes the sheet. */}
          <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4 lg:hidden">
            <Link href={resetHref(activeProjectId)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline lg:hidden">
              <RotateCcw className="size-3.5" aria-hidden />
              Reset filters
            </Link>
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm", className: "ml-auto min-h-11 lg:hidden" })}>
              Show {total} candidate{total === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </FilterPanel>
    </aside>
  );
}
