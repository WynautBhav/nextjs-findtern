import Link from "next/link";

import { Arrive } from "@/components/admin/motion/arrive";
import { Count } from "@/components/admin/motion/count";
import { Reveal } from "@/components/admin/motion/reveal";
import type { Funnel as FunnelData, FunnelStage } from "@/lib/employer-dashboard";
import { cn } from "@/lib/utils";

import { ChartCard, HATCH } from "./chart-card";

/** `funnel.stages` has 4 entries in order: pipeline, offered, accepted, hired. See `FunnelStage` for each field. */
export type FunnelProps = { funnel: FunnelData };

/** Brand ramp, light to deep: the bar darkens as the candidate gets closer to a hire. Hired is the deepest. */
const FILL = ["bg-brand-300", "bg-brand-400", "bg-brand-600", "bg-brand-800"] as const;

const ROW =
  "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl px-2 py-2 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 @xl:grid-cols-[9.25rem_minmax(0,1fr)_8.5rem]";

function conversion(s: FunnelStage) {
  if (s.conversionOf === null) return null;
  return s.conversionPct === null ? "—" : `${s.conversionPct}% ${s.conversionOf}`;
}

/**
 * The hiring funnel: four stages, one bar each, widths proportional to the
 * real counts (the stages nest by construction, so the bars only ever get
 * shorter). The Offered bar ends in a hatched tail for candidates whose every
 * offer was declined, withdrawn or expired. Each row links to its tab.
 */
export function Funnel({ funnel }: FunnelProps) {
  const { stages, hasData } = funnel;
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <ChartCard
      title="Hiring funnel"
      titleId="funnel-title"
      description="All time, each candidate counted once"
    >
      <ol className="-mx-2 mt-4 flex flex-1 flex-col justify-around gap-1">
        {stages.map((s, i) => {
          const share = (s.count / max) * 100;
          const lostShare = s.count > 0 ? (s.lost / s.count) * 100 : 0;
          const conv = conversion(s);
          return (
            <Arrive as="li" key={s.key} index={i}>
              <Link href={s.href} className={ROW}>
                <span className="order-1 min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{s.label}</span>
                  {s.sub ? <span className="block text-xs text-text-subtle">{s.sub}</span> : null}
                  {s.lost > 0 ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-subtle">
                      <span aria-hidden className={cn("h-2.5 w-4 shrink-0 rounded-[3px]", HATCH)} />
                      {s.lost} declined or expired
                    </span>
                  ) : null}
                </span>
                <span className="order-2 text-right @xl:order-3">
                  <Count value={s.count} className="nums block text-2xl font-normal leading-8 tracking-[-0.02em] tabular-nums text-ink-900" />
                  {conv ? <span className="nums block text-sm text-text-subtle">{conv}</span> : null}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "order-3 col-span-2 h-10 overflow-hidden rounded-lg @xl:order-2 @xl:col-span-1",
                    hasData && s.count > 0 ? "bg-ink-100" : "border border-dashed border-ink-300",
                  )}
                >
                  {s.count > 0 ? (
                    <Reveal index={i} axis="x" className="h-full w-full">
                      <span className={cn("flex h-full overflow-hidden rounded-lg", FILL[i] ?? FILL[3])} style={{ width: `max(${share}%, 12px)` }}>
                        {lostShare > 0 ? <span className={cn("ml-auto h-full", HATCH)} style={{ width: `${lostShare}%` }} /> : null}
                      </span>
                    </Reveal>
                  ) : null}
                </span>
              </Link>
            </Arrive>
          );
        })}
      </ol>
      {hasData ? null : (
        <p className="mt-3 text-sm text-text-subtle">
          Nobody in your pipeline yet.{" "}
          <Link href="/employer/candidates" className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            Find candidates
          </Link>
        </p>
      )}
    </ChartCard>
  );
}
