/**
 * Form and table class strings for the employer screens that aren't
 * components (a native input has no primitive). One copy, so every field in
 * the console has the same height, radius, focus ring and type size.
 */

export const fieldClass =
  "min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-text-subtle hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-text-subtle";

export const labelClass = "block text-sm font-medium text-ink-800";

/** Table header cell: sentence case, quiet, sticky-ready. */
export const thClass = "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold tracking-[0.02em] text-ink-600";
/** Body cell. */
export const tdClass = "px-4 py-3.5 align-top text-sm text-ink-800";

/** Segmented tab button (role="tab"); pass `active`. */
export function tabClass(active: boolean): string {
  return [
    // The same look as FilterTabs (primitives.tsx); these switch panels, so
    // they keep real tab semantics where they're used.
    "apple-spring inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium touch:min-h-11",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/30",
    active ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  ].join(" ");
}
