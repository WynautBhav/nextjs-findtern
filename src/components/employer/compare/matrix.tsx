import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pieces of the comparison matrix, set like a ledger on the page canvas: hairline rows, no card, no vertical
 * rules, section names as plain headings, and one metric cell (numeral, unit, thin bar) for every 0-10 and
 * percent value. The leader of a row gets a faint green wash, a bold green numeral and the word "Best" (or
 * "Lowest" for a price), so the mark never rests on colour alone.
 */

/** Width of the pinned label column, shared by the header corner, rows and section bands. */
const LABEL_COL = "w-28 min-w-28 sm:w-40 sm:min-w-40 xl:w-44 xl:min-w-44";

export function SectionRow({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={span}
        className="border-b border-ink-300 px-0 pb-2 pt-8 text-left align-bottom font-display text-lg font-semibold text-ink-900"
      >
        {/* Pinned so the band's name stays put while the candidates scroll. */}
        <span className="sticky left-0 inline-block">{label}</span>
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
          "sticky left-0 z-10 bg-paper py-3 pr-3 text-left align-top text-sm font-semibold leading-5 text-ink-900 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-ink-200 after:content-[''] sm:py-4 sm:pr-4",
          LABEL_COL,
          !last && "border-b border-ink-200",
        )}
      >
        <span className="[overflow-wrap:normal] hyphens-none">{label}</span>
        {hint ? <span className="mt-0.5 block break-words text-xs font-normal leading-4 text-ink-600">{hint}</span> : null}
        {level ? <span className="mt-0.5 block text-xs font-normal leading-4 text-ink-600">All level</span> : null}
      </th>
      {children}
    </tr>
  );
}

export function Cell({ leader, last, children }: { leader?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        "min-w-0 px-3 py-3 align-top text-sm text-ink-800 sm:px-4 sm:py-4 xl:px-5",
        !last && "border-b border-ink-200",
        leader && "bg-brand-50",
      )}
    >
      {children}
    </td>
  );
}

/** "Best" (or "Lowest" for price) as a word and a check, never colour alone. */
export function BestBadge({ label = "Best" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-800">
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
          <span className={cn("nums font-display text-2xl font-semibold leading-none", leader ? "text-brand-800" : "text-ink-900")}>
            {unit === "%" ? Math.round(value) : value.toFixed(1)}
          </span>
          <span className="text-xs text-ink-600">{unit === "%" ? "%" : "/ 10"}</span>
        </span>
        {leader ? <BestBadge /> : null}
      </div>
      <div className="h-1 overflow-hidden rounded-sm bg-ink-200" aria-hidden>
        <div className={cn("h-full rounded-sm", leader ? "bg-brand-800" : "bg-brand-600")} style={{ width: `${pct}%` }} />
      </div>
      {note ? <p className="nums text-xs leading-4 text-ink-600">{note}</p> : null}
    </div>
  );
}
