import { cn } from "@/lib/utils";

export type FunnelStage = { label: string; count: number; hint?: string };

/**
 * Where this employer's offers got to, as proportional bars on one scale (the widest stage is 100%).
 * A ruled list, not a chart widget: the bars are the data, the number is the label. Stages with a
 * zero count keep their row (the funnel's shape is the point) and read "none yet".
 */
export function StageFunnel({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <dl className={cn("divide-y divide-ink-200 border-y border-ink-200", className)}>
      {stages.map((s) => (
        <div key={s.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-4 py-3">
          <dt className="text-sm text-ink-700">{s.label}</dt>
          <dd className="contents">
            <span aria-hidden className="block h-2 rounded-sm bg-ink-200">
              <span className="block h-full rounded-sm bg-brand-700 transition-[width] duration-[var(--motion-slow)]" style={{ width: `${s.count === 0 ? 0 : Math.max(4, Math.round((s.count / max) * 100))}%` }} />
            </span>
            <span className="nums text-right font-display text-lg font-semibold text-ink-900">
              {s.count}
              {s.hint ? <span className="sr-only"> {s.hint}</span> : null}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
