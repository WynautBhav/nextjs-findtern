import { funnelRows } from "@/lib/admin/reports-shape";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A hiring funnel: one bar per step sized against the first, the count and
 * share on the right, and between steps how many were lost. The step with the
 * biggest loss is tagged so "where to look first" is read, not computed.
 */
export function Funnel({ steps, ariaLabel }: { steps: { label: string; count: number }[]; ariaLabel: string }) {
  const rows = funnelRows(steps);
  if (rows.length === 0 || rows[0].count === 0) {
    return <p className="py-10 text-center text-sm text-text-subtle">Nobody reached the first step in this period.</p>;
  }
  return (
    <ol aria-label={ariaLabel} data-rp="funnel" className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.label}>
          {i > 0 ? (
            <p className="flex items-center gap-2 py-1.5 pl-1 text-xs text-text-subtle">
              <span aria-hidden className="h-3 w-px bg-[color:var(--admin-rule)]" />
              {r.lost > 0 ? (
                <>
                  <span className="nums">{"\u2212"}{formatNumber(r.lost)}</span> from the step above
                  {r.ofPrevious !== null ? <span className="nums"> · {r.ofPrevious}% carried on</span> : null}
                  {r.biggestDrop ? (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2 py-0.5 font-semibold text-foreground">
                      <span aria-hidden className="size-1.5 rounded-full bg-accent-500" />
                      Biggest drop
                    </span>
                  ) : null}
                </>
              ) : (
                <span>Nobody lost</span>
              )}
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
            <span className="text-sm font-medium text-foreground">{r.label}</span>
            <span className="nums text-sm text-text-subtle">
              <b className="font-semibold text-foreground">{formatNumber(r.count)}</b> · {r.ofFirst}%
            </span>
            <div aria-hidden className="col-span-2 h-3 overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]">
              <div
                className={cn("h-full rounded-full bg-[color:var(--admin-tile)]", r.count > 0 && "min-w-1.5")}
                style={{ width: `${r.ofFirst}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
