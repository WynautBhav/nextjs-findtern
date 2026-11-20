import Link from "@/app/employer/candidates/_link";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";

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
import { FilterPanel, useDesktop } from "./_filter-form";
import { activeChips, activeFilterCount, resetHref, type Filters, type ProData } from "@/lib/candidates-params";

const SELECT = cn(fieldClass, "mt-2");

/**
 * The left column (a sheet on phones): always-open labelled sections, every filter the
 * page has always had. Project is not a filter but sets the defaults below it.
 * Sorting lives in the results toolbar, not here.
 */
export function FilterColumn({
  filters,
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
  sortControl = null,
  pro,
  panelEpoch = 0,
}: {
  filters: Filters;
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
  /** Changes when the filters change from outside the panel (a chip, Back): the panel then re-reads them. Its own changes never bump it. */
  panelEpoch?: number;
  /** The selected project's own city: pre-fills "Preferred work city" unless the URL sets `city`. Read-only. */
  cityDefault?: string;
  /** The "Match to project" switch: first in the panel. */
  projectToggle?: React.ReactNode;
  /** Sort and its direction (null on the shortlist tab): first on a phone, second from lg up. */
  sortControl?: React.ReactNode;
  /** Findtern Pro: who has the CGPA and college filters, and what they list. */
  pro: ProData;
}) {
  const desktop = useDesktop();
  const city = cityField({ city: filters.city, citySet: filters.citySet, defaultCity: cityDefault });
  const count = sectionCounts(activeChips(filters).map((c) => c.key), Boolean(projectCity));
  const moreActive = RATING_META.filter((m) => filters.minRatings[m.key] > 0).length + (filters.plan ? 1 : 0);
  const sort = sortControl ? (
    <section aria-labelledby="filter-sort-heading" className="max-lg:mt-1">
      <h3 id="filter-sort-heading" className="mb-2 text-sm font-semibold text-ink-900">
        Sort
      </h3>
      {sortControl}
      <label className="mt-1 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800">
        Most skills matched first
        {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
        <input type="hidden" name="sm" value="0" />
        <input type="checkbox" role="switch" name="sm" value="1" defaultChecked={filters.skillPriority} className="peer sr-only" />
        <span
          aria-hidden
          className="relative h-6 w-10 shrink-0 rounded-full bg-ink-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 motion-reduce:transition-none motion-reduce:after:transition-none"
        />
      </label>
    </section>
  ) : null;
  return (
    <aside
      aria-label="Filters"
      className={cn(
        "lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-ink-200 lg:bg-white lg:p-6 lg:shadow-xs",
        // Still scrollable, but the track only shows on hover or focus, so it does not read as a nested box.
        "lg:[scrollbar-color:transparent_transparent] lg:[scrollbar-width:thin] lg:hover:[scrollbar-color:var(--color-ink-300)_transparent] lg:focus-within:[scrollbar-color:var(--color-ink-300)_transparent]",
      )}
    >
      <FilterPanel key={panelEpoch} cityDefault={cityDefault} raised={compareIds.length > 0} activeCount={activeFilterCount(filters, effectiveSkills, projectCity)} total={total}>
        {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
        {filters.view !== "list" ? <input type="hidden" name="view" value={filters.view} /> : null}
        {filters.pageSize !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
        {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
        {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
        {filters.sorts.length > 0 || filters.collegeSort ? <input type="hidden" name="sort" value={[...filters.sorts, collegeSortToken(filters.collegeSort)].filter(Boolean).join(",")} /> : null}
        {filters.dir === "asc" ? <input type="hidden" name="dir" value="asc" /> : null}

        {/* lg: the card's own header. Phones get "Filters" from the sheet title. */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3 mb-4 max-lg:hidden">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <SlidersHorizontal className="size-[18px] text-ink-600" aria-hidden />
            Filters
          </h2>
          <Link href={resetHref(activeProjectId)} className="inline-flex min-h-9 items-center px-1 text-[13px] font-medium text-text-subtle underline-offset-4 hover:text-ink-900 hover:underline touch:min-h-11">
            Reset
          </Link>
        </div>
        <div>
          {/* Phones: Sort leads the sheet. lg: the project switch leads, then Sort. */}
          {desktop ? null : sort}
          {projectToggle ? <div className={desktop ? "" : "mt-3"}>{projectToggle}</div> : null}
          {desktop ? <div className={projectToggle ? "mt-4" : ""}>{sort}</div> : null}

          <FilterSection title="Location" count={count.location}>
            <CityFilter defaultValue={city.value} label="City" autoApply />
            {city.prefilled ? <p className="mt-1.5 text-xs text-text-subtle">From your project</p> : null}
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              {/* Unchecked sends only the hidden 0; checked adds remote=1 after it. */}
              <input type="hidden" name="remote" value="0" />
              <input type="checkbox" name="remote" value="1" defaultChecked={includeRemote} className="size-4 rounded-[4px] border-ink-300 accent-ink-900" />
              Include remote-only candidates
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-800">
              <input type="checkbox" name="laptop" value="yes" defaultChecked={filters.laptop === "yes"} className="size-4 rounded-[4px] border-ink-300 accent-ink-900" />
              Has own laptop
            </label>
          </FilterSection>

          <FilterSection title="Findtern Score" count={filters.minScore > 0 ? 1 : 0}>
            <RatingSlider name="min" label="At least" defaultValue={filters.minScore} />
          </FilterSection>

          {/* Interview scores and price: folded, and open by themselves when one of them is set. */}
          <details open={moreActive > 0} className="group/more mt-4 border-t border-ink-100 pt-2">
            <summary className="-mx-1 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-1 text-sm font-semibold text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                More filters
                {moreActive > 0 ? (
                  <span className="nums inline-grid h-5 min-w-5 place-items-center rounded-full bg-ink-900 px-1.5 text-[11px] font-semibold leading-none text-white">
                    <span aria-hidden>{moreActive}</span>
                    <span className="sr-only">{moreActive} active</span>
                  </span>
                ) : null}
              </span>
              <ChevronDown className="size-4 text-ink-500 transition-transform group-open/more:rotate-180 motion-reduce:transition-none" aria-hidden />
            </summary>
            <div className="pb-1 pt-1">
              <p className="mb-1 text-xs text-text-subtle">AI interview scores, each out of 10.</p>
              {RATING_META.map((meta) => (
                <RatingSlider key={meta.key} name={`r_${meta.key}`} label={meta.label} defaultValue={filters.minRatings[meta.key]} />
              ))}
              <label htmlFor="filter-plan" className="mt-3 block text-xs font-semibold text-ink-700">
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
            </div>
          </details>

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
