import Link from "next/link";
import { ChevronDown, Laptop, MapPin, Plus, RotateCcw, Star, Wallet } from "lucide-react";

import { RATING_META } from "@/lib/employer-candidates";
import { resolvePricing, type Currency } from "@/lib/employer-pricing";
import { BANDS } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { schema } from "@/lib/db";
import { CityFilter } from "@/components/employer/city-filter";
import { RatingSlider } from "@/components/employer/candidate-filters";
import { Surface } from "@/components/app/primitives";
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
}) {
  return (
    <aside
      aria-label="Filters"
      className={cn(
        "mb-2 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-2",
        // Still scrollable, but the track only shows on hover or focus, so it does not read as a nested box.
        "lg:[scrollbar-color:transparent_transparent] lg:[scrollbar-width:thin] lg:hover:[scrollbar-color:var(--color-ink-300)_transparent] lg:focus-within:[scrollbar-color:var(--color-ink-300)_transparent]",
      )}
    >
      <FilterPanel key={queryOf(filters)} activeCount={activeFilterCount(filters)} total={total}>
        {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
        {filters.view !== "grid" ? <input type="hidden" name="view" value={filters.view} /> : null}
        {filters.pageSize !== 24 ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
        {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
        {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
        {filters.mode ? <input type="hidden" name="mode" value={filters.mode} /> : null}
        {filters.sorts.length > 0 ? <input type="hidden" name="sort" value={filters.sorts.join(",")} /> : null}
        {filters.dir === "asc" ? <input type="hidden" name="dir" value="asc" /> : null}

        <Surface className="p-5 max-lg:border-0 max-lg:p-0 max-lg:shadow-none">
          <div className="pb-4">
            <div className="flex items-center justify-between">
              <label htmlFor="filter-project" className="text-sm font-semibold text-ink-900">
                Project
              </label>
              <Link href="/employer/projects" className={buttonClass({ variant: "ghost", size: "sm", className: "-mr-2 min-h-11" })}>
                <Plus className="size-4" aria-hidden />
                New
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
              <p className="mt-2 text-sm text-ink-600">No open projects. Create one to shortlist and match candidates.</p>
            )}
          </div>

          <Group title="Location" icon={<MapPin className="size-4" />} open>
            <CityFilter key={filters.city} defaultValue={filters.city} label="Preferred work city" autoApply />
            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-ink-700">
              {/* Unchecked sends only the hidden 0; checked adds remote=1 after it. */}
              <input type="hidden" name="remote" value="0" />
              <input
                type="checkbox"
                name="remote"
                value="1"
                defaultChecked={includeRemote}
                className="mt-0.5 size-4 rounded-apple-sm border-ink-300 accent-brand-700"
              />
              <span>
                <span className="font-medium text-ink-900">Include remote candidates</span>
                <span className="mt-0.5 block text-xs text-ink-600">Also show interns who only work remotely.</span>
              </span>
            </label>
          </Group>

          <Group title="Laptop" icon={<Laptop className="size-4" />} open={filters.laptop === "yes"}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-800">
              <input
                type="checkbox"
                name="laptop"
                value="yes"
                defaultChecked={filters.laptop === "yes"}
                className="size-4 rounded-apple-sm border-ink-300 accent-brand-700"
              />
              Has a laptop
            </label>
          </Group>

          <Group title="Hourly price" icon={<Wallet className="size-4" />} open={Boolean(filters.plan)}>
            <label htmlFor="filter-plan" className="sr-only">
              Hourly price
            </label>
            <select id="filter-plan" name="plan" defaultValue={filters.plan} className={SELECT}>
              <option value="">Any price</option>
              {BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {formatRate(resolvePricing(band.min, plans, currency, region).hourlyRateMinor, currency)} · {band.name}
                </option>
              ))}
            </select>
          </Group>

          <Group title="Ratings" icon={<Star className="size-4" />} open>
            <RatingSlider name="min" label="Findtern Score" defaultValue={filters.minScore} />
            {RATING_META.map((meta) => (
              <RatingSlider key={meta.key} name={`r_${meta.key}`} label={meta.label} defaultValue={filters.minRatings[meta.key]} />
            ))}
          </Group>

          <div className="border-t border-ink-100 py-1">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800">
              Most skills matched first
              {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
              <input type="hidden" name="sm" value="0" />
              <input type="checkbox" role="switch" name="sm" value="1" defaultChecked={filters.skillPriority} className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-6 w-10 shrink-0 rounded-full bg-ink-500 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 motion-reduce:after:transition-none"
              />
            </label>
          </div>

          {/* Filters apply as they change (QA-125): no Apply. On a phone "Show results" closes the sheet. */}
          <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-4">
            <Link href={resetHref(activeProjectId)} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>
              <RotateCcw className="size-4" aria-hidden />
              Reset filters
            </Link>
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm", className: "ml-auto min-h-11 lg:hidden" })}>
              Show {total} result{total === 1 ? "" : "s"}
            </button>
          </div>
        </Surface>
      </FilterPanel>
    </aside>
  );
}

function Group({ title, icon, open, children }: { title: string; icon: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open || undefined} className="group border-t border-ink-100">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-apple-sm text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
        <span className="text-brand-700" aria-hidden>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-ink-400 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
