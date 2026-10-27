"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Table toolbar: search, facet filters, page size, and the active-filter chips.
 *
 * All state lives in the URL, never in React state that a refresh discards. An
 * admin who filters to "live interns in Pune", copies the link to a colleague,
 * and both of them see the same rows - which is also what makes the CSV export
 * honest, since the download reads the same query string the table does.
 *
 * Search is debounced at 300ms and always resets to page 1. Paging to page 6
 * and then typing a narrower query used to leave you on an empty page 6.
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
}: {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  /** When present, renders a CSV button pointing at this URL. */
  exportHref?: string;
  /** Extra controls rendered after the filters. */
  extra?: React.ReactNode;
  searchKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [term, setTerm] = useState(searchParams.get(searchKey) ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const foldable = filters.length > 3;
  const activeFilterCount = filters.filter((f) => searchParams.get(f.key)).length;
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

  /**
   * Merge one key into the URL. `null` removes it. Page resets to 1 unless the
   * caller is explicitly changing the page number.
   */
  const setParam = useCallback(
    (key: string, value: string | null, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      if (!opts.keepPage) next.delete("page");

      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

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
    const next = new URLSearchParams();
    // Per-page is a display preference, not a filter - keep it.
    const per = searchParams.get("per");
    if (per) next.set("per", per);
    const qs = next.toString();
    setTerm("");
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search -------------------------------------------------------- */}
        {/* `min-w-[12rem]` keeps the box a real search field when the row is
            tight; it wraps to its own line instead of collapsing to the icon. */}
        <div className="relative w-full min-w-[12rem] flex-1 sm:w-auto sm:max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
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
            className="h-9 w-full rounded-apple-sm border border-ink-200 bg-white pr-8 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none max-lg:min-h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {term ? (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="apple-spring absolute top-1/2 right-2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-apple-sm p-1 text-ink-600 hover:text-ink-700"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Facet filters ------------------------------------------------ */}
        {/* Below lg, more than three filters fold behind one toggle so the
            table is not pushed a screen down by a column of selects. */}
        {foldable ? (
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            className="apple-spring inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-ink-50 lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
            {activeFilterCount ? <span className="nums rounded-full bg-brand-50 px-1.5 text-xs text-brand-800">{activeFilterCount}</span> : null}
          </button>
        ) : null}
        <div
          id={filtersId}
          className={cn("contents", foldable && !filtersOpen && "max-lg:hidden", foldable && filtersOpen && "max-lg:flex max-lg:w-full max-lg:flex-wrap max-lg:gap-2.5")}
        >
        {filters.map((filter) => {
          const value = searchParams.get(filter.key) ?? "";
          const id = `filter-${filter.key}`;
          return (
            <div key={filter.key} className="flex items-center gap-1.5">
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
                  "apple-spring h-9 cursor-pointer rounded-apple-sm border bg-white px-2.5 pr-7 text-sm focus:ring-2 focus:ring-brand-500/20 focus:outline-none max-lg:min-h-11",
                  value
                    ? "border-brand-300 font-medium text-brand-800"
                    : "border-ink-200 text-ink-700",
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
        })}
        </div>

        {extra}

        {exportHref ? (
          <a
            href={exportHref}
            className="apple-spring apple-pressable ml-auto inline-flex h-9 items-center gap-1.5 rounded-apple-sm border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-ink-50 max-lg:min-h-11"
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
              className="apple-spring group inline-flex min-h-11 items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-brand-800 hover:border-brand-300 hover:bg-brand-100"
            >
              <span className="text-brand-600">{chip.label}:</span>
              {chip.value}
              <X
                aria-hidden
                className="size-3 text-brand-500 apple-spring group-hover:text-brand-800"
              />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="apple-spring ml-1 inline-flex min-h-11 items-center text-xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink-800"
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
