"use client";

/**
 * Client pieces of the candidates filter sidebar (legacy employer dashboard
 * layout, bug sheet 23 Oct: "all filters should be the same as the previous
 * one, also their design").
 *
 * The filters stay a GET form the server reads - every view is a URL - but
 * like the legacy sidebar they apply on change (debounced) instead of waiting
 * for a button, and navigate client-side so the page does not reload.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Range filters at zero mean "any" and are left out of the URL. */
const ZERO_IS_ANY = /^(min|r_[a-z]+)$/;

/**
 * The page re-keys this form on every applied filter, so the control in use
 * unmounts. Its name is kept here and focus is put back on the new copy, or a
 * keyboard or screen-reader user is thrown to the top of the page each time.
 */
let refocus: { selector: string; at: number } | null = null;
/** `refocus.selector` for "the Filters toggle": a phone submit folds the panel shut. */
const TOGGLE = "@toggle";

export function FilterForm({
  children,
  activeCount,
  className,
}: {
  children: React.ReactNode;
  /** Shown on the mobile toggle. */
  activeCount: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Set when the project select changed since the last apply. */
  const projectChanged = useRef(false);
  // Phones: the remount would fold the panel shut and hide the control to refocus, so it stays open.
  const [open, setOpen] = useState(() => refocus !== null && refocus.selector !== TOGGLE && Date.now() - refocus.at < 5000);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Only straight after an apply: a later visit to the page must not grab focus.
    if (refocus && Date.now() - refocus.at < 5000) {
      if (refocus.selector === TOGGLE) toggle.current?.focus();
      else form.current?.querySelector<HTMLElement>(refocus.selector)?.focus();
    }
    refocus = null;
  }, []);

  function apply() {
    const el = form.current;
    if (!el) return;
    const active = document.activeElement;
    // By name, or by id for a control with no name (the city box: its value travels in a hidden input).
    refocus =
      (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) && el.contains(active) && (active.name || active.id)
        ? { selector: active.name ? `[name="${CSS.escape(active.name)}"]:not([type="hidden"])` : `#${CSS.escape(active.id)}`, at: Date.now() }
        : null;
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
    // A new project brings its own skills (bug sheet 26 Oct: "when I change
    // the project, skills are not changing") and its own remembered filters
    // (EMB-05, as legacy kept them per project): only the project and the
    // compare picks travel, and the page restores the rest for that project.
    if (projectChanged.current) {
      projectChanged.current = false;
      const fresh = new URLSearchParams();
      for (const key of ["project", "ids", "view", "pageSize"]) {
        const value = next.get(key);
        if (value) fresh.set(key, value);
      }
      router.push(`${pathname}?${fresh.toString()}`, { scroll: false });
      return;
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function schedule(e: React.FormEvent<HTMLFormElement>) {
    // Typing in a text box applies on Enter or on leaving it, not per key.
    const target = e.target as HTMLInputElement;
    if (target.type === "text" || target.type === "search") return;
    if (target.name === "project") projectChanged.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(apply, 300);
  }

  return (
    <div className={className}>
      <button
        ref={toggle}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="candidate-filters"
        className={buttonClass({ variant: "white", size: "md", className: "mb-3 rounded-full shadow-[0_1px_2px_rgb(7_47_36/0.06),0_8px_20px_-10px_rgb(7_47_36/0.2)] lg:hidden" })}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="nums rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>
      <form
        ref={form}
        id="candidate-filters"
        method="get"
        onChange={schedule}
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
          // Phones: the panel was just closed on purpose, so the remount must not
          // reopen it, and focus goes to its toggle instead of the hidden field.
          if (!window.matchMedia("(min-width: 1024px)").matches) {
            refocus = { selector: TOGGLE, at: Date.now() };
            toggle.current?.focus();
          }
          setOpen(false);
        }}
        className={cn(open ? "block" : "hidden", "lg:block")}
      >
        {children}
      </form>
    </div>
  );
}

/** One 0-10 rating floor, as the legacy sliders (step 0.1, value shown live). */
export function RatingSlider({
  name,
  label,
  icon,
  defaultValue,
}: {
  name: string;
  label: string;
  icon?: React.ReactNode;
  defaultValue: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const id = `filter-${name}`;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm text-ink-700">
        <label htmlFor={id} className="inline-flex items-center gap-1.5">
          {icon ? (
            <span className="text-brand-600" aria-hidden>
              {icon}
            </span>
          ) : null}
          {label}
        </label>
        <span className={cn("nums rounded-full px-2 py-0.5 text-xs font-semibold", value > 0 ? "bg-brand-50 text-brand-800" : "text-text-subtle")}>
          {value > 0 ? `${value.toFixed(1)}+` : "Any"}
        </span>
      </div>
      <input
        id={id}
        name={name}
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-valuetext={value > 0 ? `${value.toFixed(1)} or more` : "Any"}
        style={{ ["--fill" as string]: `${value * 10}%` }}
        className="range-brand mt-2.5 block w-full cursor-pointer touch:h-2"
      />
    </div>
  );
}

/**
 * Compact sort control for the results toolbar. Each option is a ready-made
 * href from the server (same `sort` / `dir` params the rail uses), so the
 * filters, page and compare picks it carries stay exactly as the server built them.
 */
export function SortSelect({ options, value }: { options: { label: string; href: string }[]; value: number }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="toolbar-sort" className="sr-only">
        Sort by
      </label>
      <select
        id="toolbar-sort"
        value={value}
        onChange={(e) => router.push(options[Number(e.target.value)].href, { scroll: false })}
        className="min-h-11 min-w-0 flex-1 rounded-full bg-ink-100/80 px-4 text-sm font-medium text-ink-900 outline-none hover:bg-ink-100 focus-visible:ring-[3px] focus-visible:ring-brand-600/30 sm:w-40 sm:flex-none lg:min-h-10 touch:min-h-11"
      >
        {options.map((o, i) => (
          <option key={o.label} value={i}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
