"use client";

/**
 * Hide and show the Candidates filter column from lg up. The choice lives in a
 * cookie (FILTER_PANEL_COOKIE) that the server page reads, so a reload paints the
 * right layout with no flash. The grid carries `data-filters`; the column and
 * the results style themselves off it (`group-data-[filters=hidden]/fl:`).
 * Nothing animates: the columns just reflow.
 */

import { createContext, useContext, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

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

/** The results-toolbar button, lg and up (a phone has its own Filters sheet button). */
export function FiltersToggle({ controls, count, className }: { controls: string; count: number; className?: string }) {
  const state = useContext(Ctx);
  if (!state) return null;
  return (
    <button
      type="button"
      onClick={state.toggle}
      aria-expanded={!state.hidden}
      aria-controls={controls}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border border-ink-200 px-3.5 text-sm font-medium text-ink-900 outline-none hover:border-ink-300 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 touch:h-11 max-lg:hidden",
        state.hidden ? "bg-white" : "bg-ink-100",
        className,
      )}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      Filters
      {count > 0 ? (
        <span className="nums grid min-w-5 place-items-center rounded-full bg-ink-900 px-1.5 text-xs font-semibold leading-5 text-white">
          {count}
          <span className="sr-only"> active</span>
        </span>
      ) : null}
    </button>
  );
}
