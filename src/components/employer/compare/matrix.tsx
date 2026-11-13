import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pieces of the comparison matrix. One visual language for every row:
 * a white card, ink-200 rules, section bands in the same small caps as the
 * Candidates stat strip, and one metric cell (number, unit, bar) for every
 * 0-10 and percent value. The leader of a row gets a green top edge, a tint and a "Best" badge.
 */

/** Width of the pinned label column, shared by the header corner, rows and section bands. */
const LABEL_COL = "w-24 min-w-24 sm:w-36 sm:min-w-36 xl:w-44 xl:min-w-44";

export function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={span}
        className="border-b border-ink-200 bg-ink-50 px-4 py-2 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-ink-700 sm:px-5"
      >
        {/* Pinned so the band's name stays put while the candidates scroll. */}
        <span className="sticky left-4 inline-block sm:left-5">{label}</span>
      </th>
    </tr>
  );
}

export function MatrixRow({
  label,
  hint,
  level,
  last,
  children,
}: {
  label: string;
  hint?: string;
  /** Everyone with a value is level: no leader, and the label says so. */
  level?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 border-r border-ink-200 bg-white p-3 text-left align-top text-[13px] font-semibold leading-5 text-ink-900 sm:p-4 sm:text-sm xl:p-5",
          LABEL_COL,
          !last && "border-b",
        )}
      >
        <span className="break-words">{label}</span>
        {hint ? <span className="mt-0.5 block break-words text-xs font-normal leading-4 text-text-subtle">{hint}</span> : null}
        {level ? <span className="mt-0.5 block text-xs font-normal leading-4 text-text-subtle">All level</span> : null}
      </th>
      {children}
    </tr>
  );
}

export function Cell({ leader, last, children }: { leader?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        "min-w-0 border-r border-ink-200 p-3 align-top text-sm text-ink-800 last:border-r-0 sm:p-4 xl:p-5",
        !last && "border-b",
        leader && "bg-brand-50 shadow-[inset_0_3px_0_0_var(--color-brand-600)]",
      )}
    >
      {children}
    </td>
  );
}

/** "Best" (or "Lowest" for price) as words and a check, never colour alone. */
export function BestBadge({ label = "Best" }: { label?: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-700 px-2 text-xs font-semibold text-white">
      <Check className="size-3.5" strokeWidth={3} aria-hidden />
      {label}
      <span className="sr-only"> in this row</span>
    </span>
  );
}

/**
 * The one numeric cell: "7.0 / 10" or "60%" with the same bar under it, for
 * Project fit, the Findtern Score and every rating. Unrated shows words, no bar.
 */
export function MetricCell({
  value,
  max,
  unit,
  note,
  leader,
  empty,
}: {
  /** Already-rounded display value, e.g. "7.0" or "60". */
  value: number | null;
  max: number;
  /** "/ 10" or "%". */
  unit: "/ 10" | "%";
  /** Small line under the bar: the tier, or "3 of 5". */
  note?: React.ReactNode;
  leader?: boolean;
  empty: string;
}) {
  if (value === null) return <span className="text-sm text-ink-600">{empty}</span>;
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex items-baseline gap-1">
          <span className={cn("nums text-[22px] font-semibold leading-none sm:text-2xl", leader ? "text-brand-800" : "text-ink-900")}>
            {unit === "%" ? Math.round(value) : value.toFixed(1)}
          </span>
          <span className="text-xs text-text-subtle">{unit === "%" ? "%" : "/ 10"}</span>
        </span>
        {leader ? <BestBadge /> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-200" aria-hidden>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      {note ? <p className="nums text-xs leading-4 text-text-subtle">{note}</p> : null}
    </div>
  );
}
