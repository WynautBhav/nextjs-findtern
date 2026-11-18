import { cn } from "@/lib/utils";

/**
 * Report visuals drawn the ledger way: every bar is a true share of a scale that is written next to it
 * (its maximum, its unit, its zero), an empty row has no bar and says "none", and the figure is always
 * printed, never left for the bar to imply. Server components, CSS only, no chart library.
 */

const num = (n: number) => new Intl.NumberFormat("en-IN").format(n);

/** Left edge of every bar track is zero; a hairline marks it. */
function Track({ value, scale, tone = "brand" }: { value: number; scale: number; tone?: "brand" | "ink" }) {
  const width = scale > 0 ? Math.min(100, (Math.max(0, value) / scale) * 100) : 0;
  return (
    <div aria-hidden className="h-2.5 border-l border-ink-500 bg-ink-100">
      {value > 0 ? <div className={cn("h-full", tone === "ink" ? "bg-ink-600" : "bg-brand-700")} style={{ width: `${Math.max(width, 1.5)}%` }} /> : null}
    </div>
  );
}

/** The scale, in words, above a visual: what the bar length means, its maximum and its unit. */
export function ScaleNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-2 text-xs text-ink-600", className)}>{children}</p>;
}

/* ---------------------------------------------------------------- funnel */

export type FunnelStep = { label: string; count: number; hint?: string };

/**
 * Steps as proportional bars in a ruled table: the count and its share of the first step. Full width is
 * the largest step (the first, unless the steps are counted on their own and a later one is bigger).
 * A step nobody reached has no bar and reads "none".
 */
export function BarFunnel({ steps, ariaLabel, unit, firstNoun, emptyText }: { steps: FunnelStep[]; ariaLabel: string; unit: string; firstNoun: string; emptyText: string }) {
  const first = steps[0]?.count ?? 0;
  if (first === 0) return <p className="border-y border-ink-200 py-4 text-sm text-ink-700">{emptyText}</p>;
  const scale = Math.max(...steps.map((s) => s.count));
  return (
    <div>
      <ScaleNote>
        Bars to scale: full width is {num(scale)} {unit}, the left edge is 0. Percentages are of the {num(first)} {firstNoun} in the first step.
      </ScaleNote>
      <div aria-hidden className="hidden grid-cols-[minmax(10rem,17rem)_minmax(0,1fr)_4.5rem_4.5rem] gap-x-4 border-b-2 border-ink-800 pb-2 text-sm font-medium text-ink-700 md:grid">
        <span>Step</span>
        <span>Share of the first step</span>
        <span className="text-right">{unit[0].toUpperCase() + unit.slice(1)}</span>
        <span className="text-right">% of first</span>
      </div>
      <ol aria-label={ariaLabel} className="border-t-2 border-ink-800 md:border-t-0">
        {steps.map((s, i) => {
          const pct = Math.round((s.count / first) * 100);
          return (
            <li key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 gap-y-2 border-b border-ink-200 py-3 md:grid-cols-[minmax(10rem,17rem)_minmax(0,1fr)_4.5rem_4.5rem]">
              <span className="min-w-0 text-ink-900">
                {s.label}
                {s.hint ? <span className="block text-xs text-ink-600">{s.hint}</span> : null}
              </span>
              <span className="nums text-right font-display text-lg font-semibold text-ink-900 md:col-start-3 md:row-start-1">{s.count === 0 ? <span className="text-sm font-normal text-ink-600">none</span> : num(s.count)}</span>
              <span className="nums w-12 text-right text-sm text-ink-700 md:col-start-4 md:row-start-1 md:w-auto">{s.count === 0 ? "" : i === 0 ? "100%" : `${pct}%`}</span>
              <div className="col-span-3 md:col-span-1 md:col-start-2 md:row-start-1">
                <Track value={s.count} scale={scale} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ----------------------------------------------------------------- trend */

export type TrendRow = { key: string; label: string; value: number; display?: string };
export type TrendExtra = { header: string; cells: React.ReactNode[] };

/**
 * A trend as a ruled table, one row per period, a bar scaled to the largest period and the value printed
 * beside it. A period with nothing in it says "none" and draws no bar. Extra columns (other series) are
 * plain figures; below `md` they sit under the bar as "Header value" pairs.
 */
export function BarTrend({
  rows,
  unit,
  bucket,
  ariaLabel,
  valueHeader,
  extras = [],
  format = num,
  emptyText,
  lastIsPartial = false,
}: {
  rows: TrendRow[];
  /** What a bar counts, e.g. "new interns" or "rupees collected". */
  unit: string;
  bucket: "day" | "week" | "month";
  ariaLabel: string;
  valueHeader: string;
  extras?: TrendExtra[];
  format?: (n: number) => string;
  emptyText: string;
  /** The last row is the period still running (it ends now), so its figure is "so far", not a drop. */
  lastIsPartial?: boolean;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const anyExtra = extras.some((e) => e.cells.some((c) => c !== "none"));
  if (rows.length === 0 || (max === 0 && !anyExtra)) return <p className="border-y border-ink-200 py-4 text-sm text-ink-700">{emptyText}</p>;
  // Runs of three or more empty periods fold into one line that still says "none": a table of eleven identical rows says nothing more.
  const isEmpty = (i: number) => rows[i].value === 0 && extras.every((e) => e.cells[i] === "none" || e.cells[i] === "–") && !(lastIsPartial && i === rows.length - 1);
  const items: ({ kind: "row"; i: number } | { kind: "gap"; from: number; to: number })[] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && isEmpty(j)) j++;
    if (j - i >= 3) {
      items.push({ kind: "gap", from: i, to: j - 1 });
      i = j;
    } else {
      items.push({ kind: "row", i });
      i++;
    }
  }
  const folded = items.some((it) => it.kind === "gap");
  const cols = `minmax(4.5rem,6.5rem) minmax(0,1fr) 8rem${extras.map(() => " 5.5rem").join("")}`;
  return (
    <div>
      <ScaleNote>
        One row per {bucket}, {rows[0].label} to {rows[rows.length - 1].label}. Bars to scale: full width is {format(max)} {unit}, the left edge is 0. A {bucket} with nothing says none.{lastIsPartial ? ` The last ${bucket} is still running.` : ""}{folded ? ` Three or more empty ${bucket}s in a row are folded into one line.` : ""}
      </ScaleNote>
      <div aria-hidden style={{ gridTemplateColumns: cols }} className="hidden gap-x-4 border-b-2 border-ink-800 pb-2 text-sm font-medium text-ink-700 md:grid">
        <span>{bucket[0].toUpperCase() + bucket.slice(1)}</span>
        <span>Against the busiest {bucket}</span>
        <span className="text-right">{valueHeader}</span>
        {extras.map((e) => (
          <span key={e.header} className="text-right">
            {e.header}
          </span>
        ))}
      </div>
      <ol aria-label={ariaLabel} className="border-t-2 border-ink-800 md:border-t-0">
        {items.map((it) => {
          if (it.kind === "gap") {
            return (
              <li key={`gap-${it.from}`} className="border-b border-ink-200 py-2.5 text-sm text-ink-600">
                <span className="nums text-ink-900">{rows[it.from].label} to {rows[it.to].label}</span>
                <span className="ml-3">none in {it.to - it.from + 1} {bucket}s</span>
              </li>
            );
          }
          const { i } = it;
          const r = rows[i];
          return (
            <li key={r.key} style={{ ["--cols" as string]: cols }} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 border-b border-ink-200 py-2.5 md:grid-cols-[var(--cols)]">
              <span className="nums text-ink-900">
                {r.label}
                {lastIsPartial && i === rows.length - 1 ? <span className="ml-2 text-xs text-ink-600">so far</span> : null}
              </span>
              <span className="nums text-right font-medium text-ink-900 md:col-start-3 md:row-start-1">{r.value === 0 ? <span className="font-normal text-ink-600">none</span> : (r.display ?? format(r.value))}</span>
              <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-1">
                <Track value={r.value} scale={max} />
              </div>
              {extras.length ? (
                <dl className="col-span-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-700 md:contents">
                  {extras.map((e, ei) => (
                    <div key={e.header} className="flex gap-1.5 md:contents">
                      <dt className="md:hidden">{e.header}</dt>
                      <dd className="nums md:text-right md:text-sm md:text-ink-900" style={{ gridColumn: 4 + ei, gridRow: 1 }}>
                        {e.cells[i]}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ rank */

export type RankRow = { label: string; value: number; display?: string; sub?: string };

/** One ranked list: label and figure on a ruled line, a thin proportional bar under it, scaled to the largest row. */
export function BarRank({ rows, unit, ariaLabel, emptyText, capitalize, maxLabel }: { rows: RankRow[]; unit: string; ariaLabel: string; emptyText: string; capitalize?: boolean; maxLabel?: string }) {
  if (rows.length === 0) return <p className="border-y border-ink-200 py-3 text-sm text-ink-700">{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div>
      <ScaleNote className="mb-1">
        Full width is {maxLabel ?? num(max)} {unit}.
      </ScaleNote>
      <ol aria-label={ariaLabel} className="border-t-2 border-ink-800">
        {rows.map((r) => (
          <li key={r.label} className="border-b border-ink-200 py-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className={cn("min-w-0 text-ink-900 [overflow-wrap:anywhere]", capitalize && "block first-letter:uppercase")}>
                {r.label}
                {r.sub ? <span className="block text-xs text-ink-600">{r.sub}</span> : null}
              </span>
              <span className="nums shrink-0 text-right font-medium text-ink-900">{r.value === 0 ? <span className="font-normal text-ink-600">none</span> : (r.display ?? num(r.value))}</span>
            </div>
            <div className="mt-1.5">
              <Track value={r.value} scale={max} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A titled ranked list (a small heading and its note above the list). */
export function RankGroup({ title, note, ...list }: { title: string; note?: string } & Parameters<typeof BarRank>[0]) {
  return (
    <div className="min-w-0">
      <h3 className="font-display text-base font-semibold text-ink-900">{title}</h3>
      {note ? <p className="mb-2 mt-0.5 text-sm text-ink-600">{note}</p> : <div className="mb-2" />}
      <BarRank {...list} />
    </div>
  );
}
