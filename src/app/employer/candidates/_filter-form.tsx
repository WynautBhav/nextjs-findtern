"use client";

/**
 * The candidates filter panel. Same contract as the legacy sidebar: the
 * filters are a GET form the server reads (every view is a URL), applied on
 * change (debounced) with client-side navigation. From lg up it is the left
 * column; on a phone the one form moves into a sheet (focus trapped, Esc
 * closes, focus returns to the Filters button), so it is never rendered twice.
 *
 * The page re-keys this panel on every applied filter, so the control in use
 * unmounts. Its name is kept here and focus is put back on the new copy, and
 * an open phone sheet reopens, or a keyboard user would be thrown to the top.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** Range filters at zero mean "any" and are left out of the URL. */
const ZERO_IS_ANY = /^(min|r_[a-z]+)$/;
const DESKTOP = "(min-width: 1024px)";

let refocus: { selector: string; at: number; sheet: boolean } | null = null;
const fresh = (r: typeof refocus) => r !== null && Date.now() - r.at < 5000;

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function FilterPanel({
  children,
  activeCount,
  total,
}: {
  children: React.ReactNode;
  /** Shown on the phone button. */
  activeCount: number;
  /** The live result count, for the sheet's "Show" button. */
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const projectChanged = useRef(false);
  // Server and first client paint assume desktop; `max-lg:hidden` hides the column on a phone until hydration.
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
  const [open, setOpen] = useState(() => fresh(refocus) && Boolean(refocus?.sheet));
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    // Only straight after an apply: a later visit to the page must not grab focus.
    if (fresh(refocus) && refocus) {
      const selector = refocus.selector;
      // The sheet mounts its content a tick later; let it settle first.
      if (selector) window.setTimeout(() => form.current?.querySelector<HTMLElement>(selector)?.focus(), 60);
    }
    refocus = null;
  }, []);

  function apply() {
    const el = form.current;
    if (!el) return;
    const active = document.activeElement;
    const inForm = (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) && el.contains(active) && (active.name || active.id);
    // By name, or by id for a control with no name (the city box: its value travels in a hidden input).
    const selector =
      inForm && active
        ? (active as HTMLInputElement).name
          ? `[name="${CSS.escape((active as HTMLInputElement).name)}"]:not([type="hidden"])`
          : `#${CSS.escape(active.id)}`
        : "";
    refocus = selector || openRef.current ? { selector, at: Date.now(), sheet: openRef.current } : null;
    const next = new URLSearchParams();
    for (const [key, raw] of new FormData(el).entries()) {
      const value = String(raw).trim();
      // An empty `skills` is a choice ("no skills"), not a missing value.
      if (!value && key !== "skills") continue;
      if (ZERO_IS_ANY.test(key) && Number(value) === 0) continue;
      next.append(key, value);
    }
    // The skill-match switch is on by default: only its "off" goes in the URL.
    if (next.getAll("sm").includes("1")) next.delete("sm");
    // A new project brings its own skills and its own remembered filters
    // (EMB-05): only the project and the compare picks travel.
    if (projectChanged.current) {
      projectChanged.current = false;
      const clean = new URLSearchParams();
      for (const key of ["project", "ids", "view", "pageSize"]) {
        const value = next.get(key);
        if (value) clean.set(key, value);
      }
      router.push(`${pathname}?${clean.toString()}`, { scroll: false });
      return;
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
        // "Show results" closes the sheet on purpose: the remount must not reopen it.
        openRef.current = false;
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 outline-none hover:border-ink-300 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="nums rounded-full bg-ink-900 px-2 text-xs font-semibold leading-5 text-white">{activeCount} active</span>
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
