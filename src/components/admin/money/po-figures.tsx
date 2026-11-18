import { cn } from "@/lib/utils";

export type PoFigure = { label: string; hint?: React.ReactNode; value: React.ReactNode; tone?: "ink" | "signal" };

/**
 * A short ruled list of figures: label and its one-line definition on the left, the amount on the right.
 * Used for "where the money stands" and the totals above each list, so every figure says which
 * population it covers. `cols` 2 lays the rows out in two columns from `lg`.
 */
export function PoFigures({ items, cols = 1, className }: { items: PoFigure[]; cols?: 1 | 2; className?: string }) {
  return (
    <dl className={cn("grid gap-x-12 border-t border-ink-200", cols === 2 && "lg:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-6 border-b border-ink-200 py-3">
          <dt className="min-w-0 text-sm font-medium text-ink-900">
            {it.label}
            {it.hint ? <span className="mt-0.5 block max-w-md text-pretty text-xs font-normal text-ink-600">{it.hint}</span> : null}
          </dt>
          <dd className={cn("money shrink-0 font-display text-lg font-semibold", it.tone === "signal" ? "text-signal" : "text-ink-900")}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
