import Link from "@/app/employer/candidates/_link";
import { ArrowDown, ArrowUp, LayoutGrid, List, Rows3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { showClearAll } from "@/components/employer/candidate-view";
import { Segmented, SegmentLink } from "@/components/employer/candidates/toolbar-parts";
import { activeSortDir, pickSortPatch, sortChoiceOf, sortDirPatch, type SortChoice, type SortDir } from "@/lib/candidate-sort";
import { SortSelect } from "./_sort-select";
import { SORT_OPTIONS, activeChips, resetHref, withFilters, withoutCity, type CandidatesData, type Filters } from "@/lib/candidates-params";


/**
 * Sort options: best match, each score field, and the college (Findtern Pro). Which way each runs is
 * the direction control beside the select; picking an option starts it at its natural direction
 * (scores high to low, colleges A-Z), so the list reads as it always did until the control is used.
 */
function sortOptions(filters: Filters, proActive: boolean) {
  // One choice at a time: picking a score sort drops the college order, and the reverse.
  const to = (choice: SortChoice) => withFilters(filters, { ...pickSortPatch(choice), page: "" });
  return [
    { value: "", label: "Best match", href: to("") },
    ...SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label, href: to(o.value) })),
    // Findtern Pro: shown to everyone, choosable by subscribers (the loader ignores `sort=college` for anyone else).
    { value: "college", label: proActive ? "College" : "College (Pro)", href: to("college"), disabled: !proActive },
  ];
}

/**
 * Ascending / descending for the sort chosen beside it. A pair of links: the current one is `aria-current`.
 */
function SortDirection({ filters, choice, collegeSort }: { filters: Filters; choice: SortChoice; collegeSort: Filters["collegeSort"] }) {
  const current = activeSortDir(choice, filters.dir, collegeSort);
  const options: { dir: SortDir; label: string; Icon: typeof ArrowUp }[] = [
    { dir: "asc", label: "Sort ascending", Icon: ArrowUp },
    { dir: "desc", label: "Sort descending", Icon: ArrowDown },
  ];
  const cell = "grid size-8 place-items-center rounded-lg touch:size-10";
  // Best match is a ranking that always lists the best first: it has no direction, so none is shown.
  if (current === null) return null;
  return (
      <nav aria-label="Sort direction" className="flex shrink-0 items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5">
        {options.map(({ dir, label, Icon }) => {
          const active = current === dir;
          return (
            <Link
              key={dir}
              href={withFilters(filters, { ...sortDirPatch(choice, dir), page: "" })}
              scroll={false}
              aria-label={label}
              aria-current={active ? "true" : undefined}
              title={label}
              className={cn(
                cell,
                "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500",
                active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </Link>
          );
        })}
      </nav>
  );
}

/**
 * What narrows the list besides the skill tokens: each chip drops its filter, "Clear all" resets to the
 * project's defaults. The typed keyword is not a chip: the search box above already shows it, with its own clear.
 * Rendered once, in the toolbar card, so the Filters sheet, the card and this row say the same thing.
 */
export function ActiveFilters({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  const projectCity = data.projectApplied?.city ?? "";
  const chips = filters.saved
    ? []
    : [
        ...activeChips(filters).filter((chip) => chip.key !== "q"),
        // The project's own city narrows the list too: say so, and let it be dropped like the others.
        ...(projectCity ? [{ key: "project-city", label: `City: ${projectCity} (from project)`, href: withoutCity(filters) }] : []),
      ];
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      <span aria-hidden className="mr-1 text-[13px] font-medium text-ink-600 max-sm:hidden">
        Active filters:
      </span>
      <ul aria-label="Active filters" className="contents">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link href={chip.href} scroll={false} aria-label={`Remove filter: ${chip.label}`} className="group inline-flex min-h-9 items-center outline-none touch:min-h-11">
              <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-ink-200 bg-ink-100 pl-2.5 pr-2 text-[13px] font-medium text-ink-800 transition-colors group-hover:bg-ink-200 group-focus-visible:ring-2 group-focus-visible:ring-brand-500">
                {chip.label}
                <X className="size-3.5 text-ink-500" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {showClearAll(chips.map((chip) => chip.key)) ? (
        <Link href={resetHref(data.activeProjectId)} className={buttonClass({ variant: "ghost", size: "sm", className: "text-ink-700 hover:bg-ink-100" })}>
          Clear all
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Sort and its direction, first in the filter panel. Not a form field: the select and the direction links each go
 * to their own URL, so its change events are kept from the panel form (which would re-apply the old sort).
 * Hidden on the shortlist tab, as before.
 */
export function SortControl({ data, filters, id = "candidate-sort", className }: { data: CandidatesData; filters: Filters; id?: string; className?: string }) {
  if (filters.saved && Boolean(data.activeProjectId)) return null;
  const choice = sortChoiceOf(filters.sorts, filters.collegeSort);
  return (
    <div role="group" aria-label="Sort" onChange={(e) => e.stopPropagation()} className={cn("flex min-w-0 items-center gap-2", className)}>
      <SortSelect id={id} prefix="" className="h-11 min-w-0 flex-1 rounded-apple-sm border-ink-200 bg-white pl-3.5" value={choice} options={sortOptions(filters, data.pro.active)} />
      <SortDirection filters={filters} choice={choice} collegeSort={filters.collegeSort} />
    </div>
  );
}

/** The project picker (only with more than one project), beside the search on every width. */
export function ProjectPicker({ data, className }: { data: CandidatesData; className?: string }) {
  if (data.projects.length < 2 || !data.activeProjectId) return null;
  return (
    <SortSelect
      id="results-project"
      label="Project"
      prefix="Project: "
      value={data.activeProjectId}
      // No `ids`: each project keeps its own compare picks, so the new project shows its own.
      options={data.projects.map((p) => ({ value: p.id, label: p.projectName, href: `/employer/candidates?${new URLSearchParams({ project: p.id }).toString()}` }))}
      className={cn("h-11 min-w-0 rounded-apple-sm border-ink-200 bg-white pl-3.5 sm:[field-sizing:content] sm:max-w-[16rem]", className)}
    />
  );
}

/**
 * Cards (the full-width cards), Grid (compact cards, two across, three on wide screens) or List (one dense line
 * per candidate). All three carry the same actions. The choice rides in the URL (`view=grid`, `view=rows`; Cards
 * is the default and needs none), so every link on the page keeps it; it is a display choice, not a filter.
 * Text labels from xl up; below that (and in the slim bar) icons, with the label in the accessible name.
 */
export function ViewToggle({ filters, compact }: { filters: Filters; compact: boolean }) {
  const options = [
    { view: "list" as const, text: "Cards", Icon: Rows3 },
    { view: "grid" as const, text: "Grid", Icon: LayoutGrid },
    { view: "rows" as const, text: "List", Icon: List },
  ];
  return (
    <Segmented label="View" className="shrink-0">
      {options.map(({ view, text, Icon }) => (
        <SegmentLink key={view} href={withFilters(filters, { view, page: "" })} active={filters.view === view} label={`${text} view`}>
          <span className="inline-flex items-center gap-1.5">
            <Icon className="size-4" aria-hidden />
            <span className={compact ? "sr-only" : "max-xl:sr-only"}>{text}</span>
          </span>
        </SegmentLink>
      ))}
    </Segmented>
  );
}

/**
 * One short status line: "3 candidates" (or "3 shortlisted"). The project is not repeated: the picker beside the
 * search names it. The count is the page's own total (hired candidates already left out). One live region, so a
 * change after the list reloads is announced once.
 */
export function ContextLine({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  const { total, loadFailed } = data;
  if (loadFailed) return null;
  const saved = filters.saved && Boolean(data.activeProjectId);
  return (
    <p role="status" className={cn("min-w-0 text-sm leading-6 text-ink-600", className)}>
      <strong className="nums font-semibold text-ink-900">{total}</strong> {saved ? "shortlisted" : `candidate${total === 1 ? "" : "s"}`}
    </p>
  );
}

/** The slim bar's count: the number and nothing else. */
export function SlimCount({ data, filters }: { data: CandidatesData; filters: Filters }) {
  if (data.loadFailed) return null;
  const saved = filters.saved && Boolean(data.activeProjectId);
  return (
    <p className="nums shrink-0 whitespace-nowrap text-sm text-ink-600">
      <strong className="font-semibold text-ink-900">{data.total}</strong> {saved ? "shortlisted" : `candidate${data.total === 1 ? "" : "s"}`}
    </p>
  );
}
