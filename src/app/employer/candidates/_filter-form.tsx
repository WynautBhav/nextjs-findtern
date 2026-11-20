"use client";

/**
 * The candidates filter panel. Same contract as the legacy sidebar: the
 * filters are a GET form (every view is a URL; with no script it submits as a plain GET), applied on
 * change (debounced) in place by the results region. From lg up it is the left
 * column; on a phone the one form moves into a sheet (focus trapped, Esc
 * closes, focus returns to the Filters button), so it is never rendered twice.
 *
 * The panel is NOT remounted when it applies its own change, so the control in use keeps focus and an open
 * phone sheet stays open. It is re-keyed only when the filters change from somewhere else (a chip, Back).
 */

import { useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useCandidatesGo } from "./_nav";
import { SlidersHorizontal } from "lucide-react";

import { cityParam } from "@/components/employer/candidate-view";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Range filters at zero mean "any" and are left out of the URL. */
const ZERO_IS_ANY = /^(min|cgpaMin|r_[a-z]+)$/;
const DESKTOP = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** lg and up. Server and first client paint assume desktop. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

export function FilterPanel({
  children,
  activeCount,
  total,
  cityDefault = "",
  raised = false,
}: {
  children: React.ReactNode;
  /** The compare bar is showing at the bottom: the phone Filters button sits above it. */
  raised?: boolean;
  /** The selected project's own city (pre-filled in the city field): it applies by default, so it is not sent. */
  cityDefault?: string;
  /** Shown on the phone button. */
  activeCount: number;
  /** The live result count, for the sheet's "Show" button. */
  total: number;
}) {
  const go = useCandidatesGo();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const projectChanged = useRef(false);
  // Server and first client paint assume desktop; `max-lg:hidden` hides the column on a phone until hydration.
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  function apply() {
    const el = form.current;
    if (!el) return;
    const next = new URLSearchParams();
    for (const [key, raw] of new FormData(el).entries()) {
      const value = String(raw).trim();
      if (key === "city") {
        // Cleared with a project city on offer is the choice "no city" (`city=`); the project's own city is the default.
        const city = cityParam(value, cityDefault);
        if (city !== null) next.append(key, city);
        continue;
      }
      // An empty `skills` is a choice ("no skills"), not a missing value.
      if (!value && key !== "skills") continue;
      if (ZERO_IS_ANY.test(key) && Number(value) === 0) continue;
      next.append(key, value);
    }
    // The skill-match switch is on by default: only its "off" goes in the URL.
    if (next.getAll("sm").includes("1")) next.delete("sm");
    // A new project brings its own skills and its own remembered filters
    // (EMB-05) and its own compare picks (12 Nov row 8): only the project, the view and the page size travel.
    if (projectChanged.current) {
      projectChanged.current = false;
      const clean = new URLSearchParams();
      for (const key of ["project", "view", "pageSize"]) {
        const value = next.get(key);
        if (value) clean.set(key, value);
      }
      go(`${pathname}?${clean.toString()}`); // a project switch brings its own skills, city and remembered filters: the panel re-reads them
      return;
    }
    const qs = next.toString();
    go(qs ? `${pathname}?${qs}` : pathname, { source: "panel" });
  }

  const formEl = (
    <form
      ref={form}
      id="candidate-filters"
      method="get"
      onChange={(e: React.FormEvent<HTMLFormElement>) => {
        // Typing in a text box applies on Enter or on leaving it, not per key.
        const target = e.target as HTMLInputElement;
        if (target.type === "text" || target.type === "search") return;
        if (target.name === "project") projectChanged.current = true;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(apply, 300);
      }}
      onBlur={(e) => {
        // Text applies on leaving the field too, not only on Enter (QA-125).
        const t = e.target;
        if (t instanceof HTMLInputElement && (t.type === "text" || t.type === "search") && t.value !== t.defaultValue) {
          window.clearTimeout(timer.current);
          apply();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        window.clearTimeout(timer.current);
        apply();
        setOpen(false);
      }}
    >
      {children}
    </form>
  );

  if (desktop) return <div className="max-lg:hidden">{formEl}</div>;

  return (
    <>
      {/* Phones: a floating button at the bottom left, in thumb reach wherever the list is scrolled. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-floating-bar
        className={cn(
          "fixed left-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-ink-900 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)] outline-none hover:bg-ink-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          // Above the phone tab bar (and above the compare tray when it shows), like the Ask Findy launcher.
          raised ? "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+5rem)]" : "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)]",
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="nums rounded-full bg-white px-2 text-xs font-semibold leading-5 text-ink-900">{activeCount}<span className="sr-only"> active</span></span>
        ) : null}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full max-w-sm gap-0 overflow-y-auto p-0 sm:max-w-sm">
          <div className="border-b border-ink-100 px-5 py-4 pr-14">
            <SheetTitle className="text-base text-ink-900">Filters</SheetTitle>
            <SheetDescription className="mt-0.5 nums">
              {total} candidate{total === 1 ? "" : "s"} match
              {activeCount > 0 ? (
                <span className="block font-normal">
                  {activeCount} active: each required skill and each filter counts once. Sorting does not.
                </span>
              ) : null}
            </SheetDescription>
          </div>
          <div className="px-5 pb-6 pt-1">{formEl}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
