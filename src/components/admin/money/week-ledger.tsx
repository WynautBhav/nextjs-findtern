import { cn } from "@/lib/utils";
import type { WeekBar } from "@/lib/admin/dashboard-overview-pure";
import type { PlacementSummary } from "@/lib/admin/dashboard-overview-pure";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * This week and the placements in two proportional strips. Bars are scaled to the busiest day (a quiet
 * day is a short bar, an empty day a hairline), and the placements bar is paid against awaiting at true share.
 * The count is proposals SENT since Monday (a draft was never sent, so it is out; one the intern rejected or the employer withdrew was sent, so it is in, and the label says so).
 */
export function WeekLedger({ week, placements }: { week: { bars: WeekBar[]; total: number } | null; placements: PlacementSummary | null }) {
  const max = week ? Math.max(1, ...week.bars.map((b) => b.value)) : 1;
  return (
    <section aria-labelledby="week-title" className="grid gap-8 sm:grid-cols-2">
      <div>
        <div className="border-b-2 border-ink-800 pb-2">
          <h2 id="week-title" className="text-lg font-semibold text-ink-900">Proposals this week</h2>
        </div>
        {!week ? (
          <p role="alert" className="py-4 text-sm text-ink-900">Couldn&apos;t load this week&apos;s proposals. Reload to try again.</p>
        ) : week.total === 0 ? (
          <p className="py-4 text-sm text-ink-700">No proposals sent since Monday.</p>
        ) : (
          <>
            <p className="mt-3 flex items-baseline gap-2"><span className="nums font-display text-2xl font-semibold text-ink-900">{week.total.toLocaleString("en-IN")}</span><span className="text-sm text-ink-700">sent since Monday, rejected and withdrawn included</span></p>
            <ol aria-label="Proposals sent per day" className="mt-3 flex h-24 items-end gap-2">
              {week.bars.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <span className="nums mb-1 text-xs text-ink-700">{b.value > 0 ? b.value : ""}</span>
                  <span aria-hidden className={cn("block w-full rounded-t-md", b.value > 0 ? "bg-brand-700" : b.state === "future" ? "border-t border-dashed border-ink-300" : "border-t border-ink-300")} style={{ height: b.value > 0 ? `${Math.max(6, (b.value / max) * 100)}%` : 1 }} />
                  <span className={cn("mt-1 block text-xs", b.state === "today" ? "font-semibold text-ink-900" : "text-ink-600")}>{b.label}</span>
                  <span className="sr-only">{DAYS[i]}: {b.value}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <div>
        <div className="border-b-2 border-ink-800 pb-2">
          <h2 className="text-lg font-semibold text-ink-900">Placements</h2>
        </div>
        {!placements || placements.total === 0 ? (
          <p className="py-4 text-sm text-ink-700">No placements yet. An accepted offer shows here until the employer pays.</p>
        ) : (
          <>
            <p className="mt-3 flex items-baseline gap-2"><span className="nums font-display text-2xl font-semibold text-ink-900">{placements.total}</span><span className="text-sm text-ink-700">accepted or hired</span></p>
            <div role="img" aria-label={`${placements.paid} hired and paid, ${placements.awaiting} awaiting payment`} className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-md">
              {placements.paid > 0 ? <span className="block bg-brand-800" style={{ flexGrow: placements.paid, flexBasis: 0 }} /> : null}
              {placements.awaiting > 0 ? <span className="block bg-signal" style={{ flexGrow: placements.awaiting, flexBasis: 0 }} /> : null}
            </div>
            <dl className="mt-3 text-sm">
              <div className="flex justify-between border-b border-ink-200 py-2"><dt className="text-ink-700">Hired and paid</dt><dd className="nums font-semibold text-ink-900">{placements.paid}</dd></div>
              {placements.awaiting > 0 ? <div className="flex justify-between border-b border-ink-200 py-2"><dt className="text-ink-700">Accepted, awaiting payment</dt><dd className="nums font-semibold text-signal">{placements.awaiting}</dd></div> : null}
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
