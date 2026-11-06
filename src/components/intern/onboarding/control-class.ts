import { cn } from "@/lib/utils";

// The one text-control look on the intern side. Kept out of fields.tsx (a client module) so a server page can use it too.

/** One control size: 44px tall everywhere (touch-first), radius token, 16px text so iOS never zooms. */
export const CONTROL =
  "apple-spring block h-11 w-full min-w-0 rounded-apple-sm border bg-white px-3.5 text-base text-ink-900 shadow-xs outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-600";
export const CONTROL_OK = "border-ink-200 hover:border-ink-300 focus-visible:border-brand-600 focus-visible:ring-ring";
export const CONTROL_BAD = "border-danger focus-visible:border-danger focus-visible:ring-danger";
export const controlClass = (error?: string, extra?: string) => cn(CONTROL, error ? CONTROL_BAD : CONTROL_OK, extra);
