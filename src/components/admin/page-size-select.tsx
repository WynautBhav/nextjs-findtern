"use client";

import { useId } from "react";

import { PER_PAGE_OPTIONS } from "@/lib/admin/params";
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
}: {
  /** Query key holding the page size. */
  perKey?: string;
  /** Query key holding the page number this control resets. */
  pageKey?: string;
}) {
  const id = useId();
  const { searchParams, set } = useUrlTableState({ perKey, pageKey });
  const current = parsePer(searchParams.get(perKey), PER_PAGE_OPTIONS, 25);

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="whitespace-nowrap text-[0.8125rem] text-text-subtle">
        Rows
      </label>
      <select
        id={id}
        value={String(current)}
        onChange={(e) => set(perKey, e.target.value)}
        className="apple-spring h-10 cursor-pointer rounded-full bg-[color:var(--admin-panel-2)] pr-9 pl-4 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm touch:min-h-11"
      >
        {PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={String(option)}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
