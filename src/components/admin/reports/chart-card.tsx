"use client";

import { useState } from "react";

import { LineDuo, type LineDuoSeries } from "@/components/admin/charts/line-duo";
import { Panel } from "@/components/admin/panel";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChartView = {
  key: string;
  /** Short tab label. */
  tab: string;
  /** The question this chart answers, used as the card title. */
  title: string;
  /** One sentence on what a point is and the time zone. */
  note: string;
  /** What the vertical axis measures, written above it. */
  unit: string;
  format: "inr" | "count";
  series: LineDuoSeries[];
};

const FORMAT = {
  inr: (n: number) => formatMoney(n, "INR", { short: true, zeroLabel: false }),
  count: (n: number) => String(Math.round(n)),
};

/**
 * The report's one primary chart: a titled card with an optional tab switch
 * between views of the same page (e.g. money, then proposals), the unit above
 * the vertical axis and the legend under the title. Hover, touch or arrow
 * keys read values (LineDuo).
 */
export function ChartCard({ views, className }: { views: ChartView[]; className?: string }) {
  const [key, setKey] = useState(views[0]?.key);
  const view = views.find((v) => v.key === key) ?? views[0];
  if (!view) return null;
  const empty = view.series.every((s) => s.points.length < 2 || s.points.every((p) => p.y === 0));
  return (
    <Panel className={className}>
      <div data-panel-header="" className="flex flex-wrap items-start justify-between gap-3 px-[var(--admin-pad-panel)] pt-[var(--admin-pad-panel)]">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">{view.title}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-text-subtle">{view.note}</p>
        </div>
        {views.length > 1 ? (
          <div role="group" aria-label="Chart view" className="flex gap-1 rounded-full bg-[color:var(--admin-panel-2)] p-1">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={v.key === view.key}
                onClick={() => setKey(v.key)}
                className={cn(
                  "apple-spring h-9 rounded-full px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11",
                  v.key === view.key ? "bg-[color:var(--admin-tile)] text-[color:var(--admin-tile-ink)]" : "text-text-subtle hover:text-foreground",
                )}
              >
                {v.tab}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div data-panel-body="" className="p-[var(--admin-pad-panel)] pt-3">
        {empty ? (
          <p className="py-14 text-center text-sm text-text-subtle">Nothing to chart yet: {view.unit.toLowerCase()} is zero for every month shown.</p>
        ) : (
          <>
            <p className="mb-1 text-xs font-medium text-text-subtle">{view.unit}</p>
            <LineDuo
              key={view.key}
              ariaLabel={view.title}
              format={FORMAT[view.format]}
              series={view.series}
              height={260}
              className={view.series.length < 2 ? "[&>figcaption]:sr-only" : undefined}
            />
          </>
        )}
      </div>
    </Panel>
  );
}
