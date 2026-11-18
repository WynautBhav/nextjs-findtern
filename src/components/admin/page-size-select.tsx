"use client";

import { useId } from "react";

import { PER_PAGE_OPTIONS } from "@/lib/admin/params";
import { cn } from "@/lib/utils";
import { FILTER_SELECT, FilterField } from "./filter-controls.tsx";
import { parsePer } from "./table-state.ts";
import { useUrlTableState } from "./use-url-table-state.ts";

/**
 * Rows-per-page control.
 *
 * Separate from the toolbar because it is a display preference rather than a
 * filter - "Clear all" deliberately preserves it, whereas it wipes every
 * chip. Changing it resets to the table's own page key, since page 9 of the
 * old size is rarely a valid page of the new one.
 */
export function PageSizeSelect({
  perKey = "per",
  pageKey = "page",
  className,
}: {
  /** Query key holding the page size. */
  perKey?: string;
  /** Query key holding the page number this control resets. */
  pageKey?: string;
  className?: string;
}) {
  const id = useId();
  const { searchParams, set } = useUrlTableState({ perKey, pageKey });
  const current = parsePer(searchParams.get(perKey), PER_PAGE_OPTIONS, 25);

  return (
    <FilterField label="Rows" htmlFor={id} className={className}>
      <select
        id={id}
        value={String(current)}
        onChange={(e) => set(perKey, e.target.value)}
        className={cn(FILTER_SELECT, "max-sm:w-auto")}
      >
        {PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </FilterField>
  );
}
