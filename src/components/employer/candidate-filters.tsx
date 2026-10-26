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

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/** Range filters at zero mean "any" and are left out of the URL. */
const ZERO_IS_ANY = /^(min|r_[a-z]+)$/;

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
  const [open, setOpen] = useState(false);

  function apply() {
    const el = form.current;
    if (!el) return;
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
    // the project, skills are not changing") - and picking one means "match
    // to it", so an earlier "Show everyone" is dropped too.
    if (projectChanged.current) {
      next.delete("skills");
      next.delete("pf");
    }
    projectChanged.current = false;
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="candidate-filters"
        className="apple-spring apple-pressable mb-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-ink-50 lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-700">
            {activeCount}
          </span>
        ) : null}
      </button>
      <form
        ref={form}
        id="candidate-filters"
        method="get"
        onChange={schedule}
        onSubmit={(e) => {
          e.preventDefault();
          window.clearTimeout(timer.current);
          apply();
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
  icon: React.ReactNode;
  defaultValue: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const id = `filter-${name}`;
  return (
    <div className="rounded-[12px] border border-ink-200/80 bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-700">
        <label htmlFor={id} className="inline-flex items-center gap-1.5">
          <span className="text-brand-600" aria-hidden>
            {icon}
          </span>
          {label}
        </label>
        <span className="font-semibold tabular-nums text-brand-700">{value > 0 ? `${value.toFixed(1)}+` : "Any"}</span>
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
        className="mt-2.5 h-6 w-full cursor-pointer accent-brand-700"
      />
    </div>
  );
}
