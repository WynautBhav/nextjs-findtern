import { cn } from "@/lib/utils";

/**
 * The one set of rules for a filter bar (search, selects, dates, export, page size).
 *
 * Every control in a bar is the same shape (the pill the admin look already uses), the same height
 * (40 px, 44 on touch), the same fill and the same focus ring, and sits in a `FilterField`: a small
 * label above the control. `FilterBar` is one wrapping row with `items-end`, so each field's box shares
 * a bottom and, being the same height, a top - labelled or not (an unlabelled control, like the export
 * button, reserves the label row with a hidden spacer). Page code never styles a raw `<select>` or date
 * input for a filter: it uses these classes (a source-scan test enforces that).
 */

/** Text fields and selects: a pill on the quiet panel fill. */
export const FILTER_CONTROL =
  "h-10 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

/** A native select: the control plus the pointer and the width cap (the chevron comes from globals.css). */
export const FILTER_SELECT = cn(FILTER_CONTROL, "apple-spring max-w-56 cursor-pointer truncate max-sm:w-full max-sm:max-w-full");

/** An action in the bar (export, "More filters", Search): the same pill, a hover tone step. */
export const FILTER_BUTTON =
  "apple-spring apple-pressable inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11";

export const FILTER_LABEL = "text-xs font-medium leading-4 text-text-subtle";

/** One wrapping row; `items-end` plus equal control heights gives every box one top and one baseline. */
export function FilterBar({ className, children, name }: { className?: string; children: React.ReactNode; name?: string }) {
  return (
    <div data-filter-bar={name ?? ""} className={cn("flex flex-wrap items-end gap-x-2.5 gap-y-3", className)}>
      {children}
    </div>
  );
}

/**
 * A control with its label above. `htmlFor` names the control; with no `label` the label row is
 * still reserved (hidden spacer) so the control keeps the same top as its labelled neighbours.
 */
export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-filter-field="" className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label ? (
        <label htmlFor={htmlFor} className={FILTER_LABEL}>
          {label}
        </label>
      ) : (
        <span aria-hidden className={FILTER_LABEL}>
          &nbsp;
        </span>
      )}
      {children}
    </div>
  );
}
