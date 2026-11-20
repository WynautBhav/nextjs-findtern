import Link from "next/link";
import { ArrowDown, ArrowUp, LayoutGrid, List, Rows3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { showClearAll } from "@/components/employer/candidate-view";
import { Segmented, SegmentLink } from "@/components/employer/candidates/toolbar-parts";
import { FiltersToggle } from "@/components/employer/candidate-filter-collapse";
import { activeSortDir, pickSortPatch, sortChoiceOf, sortDirPatch, type SortChoice, type SortDir } from "@/lib/candidate-sort";
import { matchedOnText, projectMatchState, type ProjectMatchState } from "@/lib/project-match";
import { SortSelect } from "./_sort-select";
import { SORT_OPTIONS, activeChips, activeFilterCount, resetHref, titleCase, withFilters, withoutCity, type CandidatesData, type Filters } from "./_query";

/** How the selected project relates to this list (see `projectMatchState`), read off the loaded data. */
export function matchStateOf(data: CandidatesData, filters: Filters): ProjectMatchState {
  return projectMatchState({
    hasProject: Boolean(data.activeProjectId),
    projectDefaults: filters.projectDefaults,
    skillsSet: filters.skillsSet,
    skills: filters.skills,
    projectSkills: data.activeProjectSkills,
    projectCity: data.cityDefault,
  });
}

export function projectNameOf(data: CandidatesData): string {
  return data.projects.find((p) => p.id === data.activeProjectId)?.projectName ?? "";
}

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
 * Ascending / descending for the sort chosen beside it. A pair of links (the server page builds every
 * URL, as for the layout toggle): the current one is `aria-current`. Direction applies to every sort but
 * Best match, which is a ranking with one fixed order: there the pair is shown disabled, with the reason.
 */
function SortDirection({ filters, choice, collegeSort, compact }: { filters: Filters; choice: SortChoice; collegeSort: Filters["collegeSort"]; compact: boolean }) {
  const current = activeSortDir(choice, filters.dir, collegeSort);
  const options: { dir: SortDir; label: string; Icon: typeof ArrowUp }[] = [
    { dir: "asc", label: "Sort ascending", Icon: ArrowUp },
    { dir: "desc", label: "Sort descending", Icon: ArrowDown },
  ];
  const cell = "grid size-10 place-items-center rounded-[10px] sm:size-9 sm:touch:size-11";
  if (current === null) {
    return (
      <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
        <div role="group" aria-label="Sort direction" aria-describedby="sort-dir-reason" title="Best match has a fixed order" className="flex items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5 opacity-50">
          {options.map(({ dir, label, Icon }) => (
            <span key={dir} role="img" aria-label={`${label} (not available)`} className={cn(cell, "text-ink-500")}>
              <Icon className="size-4" aria-hidden />
            </span>
          ))}
        </div>
        <span id="sort-dir-reason" className={cn("text-xs text-text-subtle", compact ? "sr-only" : "max-xl:sr-only")}>
          Best match has a fixed order
        </span>
      </div>
    );
  }
  const [other] = options.filter((o) => o.dir !== current);
  const Now = current === "asc" ? ArrowUp : ArrowDown;
  return (
    <>
      {/* A phone has no room for two buttons beside Sort and the layout toggle: one button shows the direction and flips it. */}
      <Link
        href={withFilters(filters, { ...sortDirPatch(choice, other.dir), page: "" })}
        scroll={false}
        aria-label={`${current === "asc" ? "Sort ascending" : "Sort descending"}, switch to ${other.dir === "asc" ? "ascending" : "descending"}`}
        title={`${current === "asc" ? "Ascending" : "Descending"}: tap for ${other.dir === "asc" ? "ascending" : "descending"}`}
        className="grid size-11 shrink-0 place-items-center rounded-apple-sm border border-ink-200 bg-white text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:hidden"
      >
        <Now className="size-4" aria-hidden />
      </Link>
      <nav aria-label="Sort direction" className="flex shrink-0 items-center gap-0.5 rounded-apple-sm border border-ink-200 bg-white p-0.5 max-sm:hidden">
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
    </>
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
    <div className={cn("flex flex-wrap items-center gap-x-1", className)}>
      <span aria-hidden className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle max-lg:hidden">
        Active filters
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
        <Link href={resetHref(data.activeProjectId)} className={buttonClass({ variant: "ghost", size: "sm", className: "text-ink-700 hover:bg-ink-100 lg:ml-auto" })}>
          Clear all
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Sort and the layout toggle, in the toolbar card (beside the search at lg; its own row on a phone, where the
 * project lives in the Filters sheet). Sort is hidden on the shortlist tab, as before. `compact` is the slim
 * sticky bar's copy: ids are suffixed so the page keeps unique ids, and the view shows icons only.
 */
export function ToolbarSort({ data, filters, compact = false, className }: { data: CandidatesData; filters: Filters; compact?: boolean; className?: string }) {
  const saved = filters.saved && Boolean(data.activeProjectId);
  // A college order is only real for a subscriber (the loader empties it for anyone else).
  const choice = sortChoiceOf(filters.sorts, filters.collegeSort);
  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-2 sm:flex-wrap", className)}>
      {saved ? null : (
        <div role="group" aria-label="Sort" className="flex min-w-0 items-center gap-2 max-sm:flex-1">
          <SortSelect
            id={compact ? "candidate-sort-slim" : "candidate-sort"}
            className="h-11 min-w-0 rounded-apple-sm border-ink-200 bg-white pl-3.5 [field-sizing:content] max-sm:w-full max-sm:flex-1 max-sm:[field-sizing:fixed]"
            value={choice}
            options={sortOptions(filters, data.pro.active)}
          />
          <SortDirection filters={filters} choice={choice} collegeSort={filters.collegeSort} compact={compact} />
        </div>
      )}
      <ViewToggle filters={filters} compact={compact} />
    </div>
  );
}

/** The project picker (only with more than one project): lg and up, beside the Filters button. A phone has it in the sheet. */
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
      className={cn("h-11 min-w-0 max-w-[11rem] rounded-apple-sm border-ink-200 bg-white pl-3.5 [field-sizing:content] xl:max-w-[16rem]", className)}
    />
  );
}

/**
 * Cards (the full-width cards), Grid (compact cards, two across, three on wide screens) or List (one dense line
 * per candidate). All three carry the same actions. The choice rides in the URL (`view=grid`, `view=rows`; Cards
 * is the default and needs none), so every link on the page keeps it; it is a display choice, not a filter.
 * Text labels from xl up; below that (and in the slim bar) icons, with the label in the accessible name.
 */
function ViewToggle({ filters, compact }: { filters: Filters; compact: boolean }) {
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
 * The real count and what it is for: "24 candidates for Web Development · matched on 5 skills + Pune". The
 * count is the page's own total (hired candidates already left out), never a made-up figure. One live region,
 * so a change after the list reloads is announced once.
 */
export function ContextLine({ data, filters, match, className }: { data: CandidatesData; filters: Filters; match: ProjectMatchState; className?: string }) {
  const { total, loadFailed } = data;
  if (loadFailed) return null;
  const saved = filters.saved && Boolean(data.activeProjectId);
  const name = projectNameOf(data);
  const matchedOn = match === "matched" || match === "edited" ? matchedOnText(data.effectiveSkills.length, data.cityList.map(titleCase)) : "";
  return (
    <p role="status" className={cn("min-w-0 text-sm leading-6 text-ink-600", className)}>
      <strong className="nums font-semibold text-ink-900">{total}</strong> {saved ? "shortlisted for this project" : `candidate${total === 1 ? "" : "s"}`}
      {!saved && name && (match === "matched" || match === "edited") ? (
        <>
          {" "}
          for <strong className="font-semibold text-ink-900">{name}</strong>
        </>
      ) : null}
      {!saved && match === "off" ? " · not matched to a project" : null}
      {!saved && matchedOn ? ` · ${matchedOn}` : null}
      {!saved && match === "none" && activeFilterCount(filters, data.effectiveSkills, data.projectApplied?.city ?? "") > 0 ? " matching your filters" : null}
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

/** lg and up: project picker and the button that hides the filter column. Last in the DOM, after sort and view. */
export function ToolbarEnd({ data, filters, className }: { data: CandidatesData; filters: Filters; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 max-lg:hidden", className)}>
      <ProjectPicker data={data} />
      <FiltersToggle controls="candidate-filter-column" count={activeFilterCount(filters, data.effectiveSkills, data.projectApplied?.city ?? "")} />
    </div>
  );
}
