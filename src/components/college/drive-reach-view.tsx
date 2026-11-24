import type { DriveReach, ReachBucketId } from "@/lib/college/drive-reach";
import { cn } from "@/lib/utils";

/**
 * A drive's strength and who did not make it, one reason each (lib/college/drive-reach.ts). No hooks, so the drives list
 * (server), the drive form and the past-drive card (client) all draw the same thing. `onOpen` makes each reason a
 * button that lists its students.
 */

const n = (v: number) => v.toLocaleString("en-IN");

export function DriveReachView({ reach, compact = false, note, onOpen, className }: { reach: DriveReach; compact?: boolean; note?: string; onOpen?: (id: ReachBucketId) => void; className?: string }) {
  const seenPct = reach.strength ? (reach.seen / reach.strength) * 100 : 0;
  return (
    <div className={className}>
      <dl className={cn("grid grid-cols-3 gap-3", compact ? "text-xs" : "text-sm")}>
        {[
          { label: "Strength", value: reach.strength, hint: "match the drive" },
          { label: "Employers can see", value: reach.seen, hint: null },
          { label: "Left out", value: reach.out, hint: null },
        ].map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-text-subtle">{f.label}</dt>
            <dd className={cn("nums mt-0.5 font-medium tracking-[-0.02em]", compact ? "text-lg" : "text-2xl", f.value === 0 ? "text-ink-400" : "text-ink-900")}>{n(f.value)}</dd>
          </div>
        ))}
      </dl>
      <span aria-hidden className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-ink-200">
        <span className="h-full rounded-full bg-brand-600" style={{ width: `${seenPct}%` }} />
      </span>
      {reach.out > 0 || !compact ? (
        <ul aria-label="Why students were left out" className={cn("mt-3 grid gap-x-6", compact ? "grid-cols-1 text-xs sm:grid-cols-2" : "text-sm sm:grid-cols-2")}>
          {reach.buckets.map((b) => {
            const body = (
              <>
                <span className="min-w-0 truncate text-ink-700">{b.label}</span>
                <span className={cn("nums shrink-0 text-right", b.ids.length ? "font-medium text-ink-900" : "text-ink-400")}>{n(b.ids.length)}</span>
              </>
            );
            return (
              <li key={b.id} className="border-b border-ink-100 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                {onOpen && b.ids.length ? (
                  <button type="button" aria-haspopup="dialog" onClick={() => onOpen(b.id)} className="-mx-2 flex min-h-9 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 text-left outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-500">
                    {body}
                  </button>
                ) : (
                  <span className={cn("flex items-center justify-between gap-3", compact ? "min-h-7" : "min-h-9")}>{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {note ? <p className="mt-2 text-xs text-text-subtle">{note}</p> : null}
    </div>
  );
}
