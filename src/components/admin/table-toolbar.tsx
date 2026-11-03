"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { SortSelect, type SortOption } from "./sort-select.tsx";
import { useUrlTableState } from "./use-url-table-state.ts";

/**
 * Table toolbar: search, facet filters, page size, and the active-filter chips.
 *
 * All state lives in the URL, never in React state that a refresh discards. An
 * admin who filters to "live interns in Pune", copies the link to a colleague,
 * and both of them see the same rows - which is also what makes the CSV export
 * honest, since the download reads the same query string the table does.
 *
 * Search is debounced at 300ms and always resets to page 1 (the table's own
 * `pageKey`, so a second table on the page keeps its page). Paging to page 6
 * and then typing a narrower query used to leave you on an empty page 6.
 * "Clear all" removes only the search and filters: sort, rows per page and
 * custom keys survive.
 */

export type ToolbarFilter = {
  /** Query-string key, e.g. "status". */
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Shown as the control's resting text when no value is set. */
  allLabel?: string;
};

export function TableToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  exportHref,
  extra,
  searchKey = "q",
  pageKey = "page",
  sortOptions,
}: {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  /** When present, renders a CSV button pointing at this URL. */
  exportHref?: string;
  /** Extra controls rendered after the filters. */
  extra?: React.ReactNode;
  searchKey?: string;
  /** Query key holding this table's page number (reset on every filter change). */
  pageKey?: string;
  /** Sortable columns, offered as a select below `lg` where the header row is hidden. */
  sortOptions?: SortOption[];
}) {
  const { searchParams, set: setParam, clear, keys } = useUrlTableState({ searchKey, pageKey });

  const [term, setTerm] = useState(searchParams.get(searchKey) ?? "");
  const filtersId = useId();
  const foldable = filters.length > 3;
  const shown = foldable ? filters.slice(0, 3) : filters;
  const folded = foldable ? filters.slice(3) : [];
  const foldedActive = folded.filter((f) => searchParams.get(f.key)).length;
  // Open from the start when a folded filter is already applied.
  const [filtersOpen, setFiltersOpen] = useState(foldedActive > 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // The search box is the one piece of state that has to follow an external
  // change (a chip removal, "clear all", the back button). Adjusting it during
  // render - the documented React pattern for "state derived from props" -
  // avoids a `useEffect` + `setState`, which cascades a second render pass on
  // every keystroke and is what `react-hooks/set-state-in-effect` rejects.
  const urlTerm = searchParams.get(searchKey) ?? "";
  const [lastUrlTerm, setLastUrlTerm] = useState(urlTerm);
  if (urlTerm !== lastUrlTerm) {
    setLastUrlTerm(urlTerm);
    setTerm(urlTerm);
  }

  // Debounce the search box. The first render is skipped so that simply landing
  // on a filtered URL does not immediately fire a redundant navigation.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const current = searchParams.get(searchKey) ?? "";
    if (term === current) return;

    const timer = setTimeout(() => setParam(searchKey, term.trim() || null), 300);
    return () => clearTimeout(timer);
  }, [term, searchKey, searchParams, setParam]);

  const activeChips = filters
    .map((f) => {
      const value = searchParams.get(f.key);
      if (!value) return null;
      const option = f.options.find((o) => o.value === value);
      return { key: f.key, label: f.label, value: option?.label ?? value };
    })
    .filter(Boolean) as { key: string; label: string; value: string }[];

  const hasFilters = activeChips.length > 0;

  function clearAll() {
    setTerm("");
    clear(filters.map((f) => f.key));
  }

  const renderFilter = (filter: ToolbarFilter) => {
    const value = searchParams.get(filter.key) ?? "";
    const id = `filter-${filter.key}`;
    return (
      <div key={filter.key} className="flex min-w-0 items-center gap-1.5 max-sm:w-full">
        <label
          htmlFor={id}
          className="sr-only"
        >
          {filter.label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => setParam(filter.key, e.target.value || null)}
          className={cn(
            "apple-spring h-10 max-w-56 cursor-pointer truncate rounded-full pr-9 pl-4 text-base sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11 max-sm:w-full max-sm:max-w-full",
            value
              ? "bg-[color:var(--admin-bar-tint)] font-medium text-foreground"
              : "bg-[color:var(--admin-panel-2)] text-foreground",
          )}
        >
          <option value="">{filter.allLabel ?? `All ${lowerFirst(filter.label)}`}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search -------------------------------------------------------- */}
        {/* `min-w-[12rem]` keeps the box a real search field when the row is
            tight; it wraps to its own line instead of collapsing to the icon. */}
        <div className="relative w-full min-w-[12rem] flex-1 sm:w-auto sm:max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-subtle"
          />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && term) {
                e.preventDefault();
                setTerm("");
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full rounded-full bg-[color:var(--admin-panel-2)] pr-11 pl-10 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="apple-spring absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full p-1 text-text-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring touch:size-11"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Facet filters ------------------------------------------------ */}
        {/* Three filters show; the rest fold behind "More filters" at every
            width (eleven selects in three rows pushed the list a screen down). */}
        {shown.map(renderFilter)}
        {sortOptions?.length ? <SortSelect options={sortOptions} keys={keys} /> : null}
        {foldable ? (
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            className="apple-spring inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {filtersOpen ? "Fewer filters" : "More filters"}
            {foldedActive ? <span className="nums rounded-full bg-[color:var(--admin-bar-tint)] px-1.5 text-xs text-foreground">{foldedActive}</span> : null}
          </button>
        ) : null}
        {foldable && filtersOpen ? (
          <div id={filtersId} className="flex w-full flex-wrap items-center gap-2.5">
            {folded.map(renderFilter)}
          </div>
        ) : null}

        {extra}

        {exportHref ? (
          <a
            href={exportHref}
            className="apple-spring apple-pressable ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            CSV
          </a>
        ) : null}
      </div>

      {/* Active filter chips ------------------------------------------- */}
      {hasFilters ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-subtle">Filtered by</span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setParam(chip.key, null)}
              className="apple-spring group inline-flex min-h-11 items-center gap-1 rounded-full bg-[color:var(--admin-bar-tint)] py-0.5 pr-2.5 pl-3 text-xs font-medium text-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="text-text-subtle">{chip.label}:</span>
              {chip.value}
              <X
                aria-hidden
                className="size-3 text-text-subtle apple-spring group-hover:text-foreground"
              />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="apple-spring ml-1 inline-flex min-h-11 items-center rounded-full px-2 text-xs font-medium text-text-subtle underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </>
  );
}

/** "Offer type" → "offer type", but "AI interview" stays "AI interview". */
function lowerFirst(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}
