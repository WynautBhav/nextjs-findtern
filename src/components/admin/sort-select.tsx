"use client";

import { useId } from "react";

import { FILTER_SELECT, FilterField } from "./filter-controls.tsx";
import { parseSortSelectValue, sortSelectValue, type TableKeys } from "./table-state.ts";
import { useUrlTableState } from "./use-url-table-state.ts";

/**
 * Sort control for the stacked layout. Below `lg` the table header row is
 * hidden (globals.css `[data-stack] thead`), so its sort links cannot be
 * reached there; this select carries the same `sort` / `dir` params.
 */
export type SortOption = { value: string; label: string };

export function SortSelect({
  options,
  keys: keyOverrides,
  className,
}: {
  options: SortOption[];
  keys?: Partial<TableKeys>;
  className?: string;
}) {
  const id = useId();
  const { keys, searchParams, setSort } = useUrlTableState(keyOverrides);
  if (options.length === 0) return null;

  const value = sortSelectValue(
    { [keys.sortKey]: searchParams.get(keys.sortKey) ?? undefined, [keys.dirKey]: searchParams.get(keys.dirKey) ?? undefined },
    options.map((o) => o.value),
    keys,
  );

  return (
    <FilterField label="Sort by" htmlFor={id} className={className ?? "lg:hidden max-sm:w-full"}>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const parsed = parseSortSelectValue(e.target.value);
          if (parsed) setSort(parsed.sort, parsed.dir);
          else setSort(null);
        }}
        className={FILTER_SELECT}
      >
        <option value="">Default order</option>
        {options.map((option) => (
          <optgroup key={option.value} label={option.label}>
            <option value={`${option.value}:asc`}>{option.label}, ascending</option>
            <option value={`${option.value}:desc`}>{option.label}, descending</option>
          </optgroup>
        ))}
      </select>
    </FilterField>
  );
}
