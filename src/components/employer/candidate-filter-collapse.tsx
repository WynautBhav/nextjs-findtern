"use client";

/**
 * Hide and show the Candidates filter column from lg up. The choice lives in a
 * cookie (FILTER_PANEL_COOKIE) that the server page reads, so a reload paints the
 * right layout with no flash. The grid carries `data-filters`; the column and
 * the results style themselves off it (`group-data-[filters=hidden]/fl:`).
 * Nothing animates: the columns just reflow.
 */

import { createContext, useContext, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

import { FILTER_PANEL_COOKIE } from "@/lib/rail";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ hidden: boolean; toggle: () => void } | null>(null);

export function FilterCollapse({ initialHidden, className, children }: { initialHidden: boolean; className?: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);
  function toggle() {
    const next = !hidden;
    setHidden(next);
    try {
      document.cookie = `${FILTER_PANEL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: it still works for this visit.
    }
  }
  return (
    <Ctx.Provider value={{ hidden, toggle }}>
      <div data-filters={hidden ? "hidden" : "shown"} className={cn("group/fl", className)}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/**
 * lg and up: a slim tab on the left edge of the layout that hides and shows the whole filter column. A phone has its
 * own floating Filters button. The tab sticks under the slim bar, so it stays in reach down the list.
 */
export function FiltersToggle({ controls, count, className }: { controls: string; count: number; className?: string }) {
  const state = useContext(Ctx);
  if (!state) return null;
  const Icon = state.hidden ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={state.toggle}
      aria-expanded={!state.hidden}
      aria-controls={controls}
      aria-label={state.hidden ? "Show filters" : "Hide filters"}
      title={state.hidden ? "Show filters" : "Hide filters"}
      className={cn(
        "group sticky top-36 flex w-8 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-ink-200 bg-white py-3 text-ink-700 shadow-xs outline-none transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 max-lg:hidden",
        state.hidden && "rounded-xl border-r",
        className,
      )}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      <span aria-hidden className="text-[13px] font-semibold [writing-mode:vertical-rl] rotate-180">
        Filters
      </span>
      {count > 0 ? (
        <span className="nums grid size-5 place-items-center rounded-full bg-ink-900 text-[11px] font-semibold text-white">
          {count}
          <span className="sr-only"> active</span>
        </span>
      ) : null}
      <Icon className="size-4 text-ink-500 group-hover:text-ink-900" aria-hidden />
    </button>
  );
}
