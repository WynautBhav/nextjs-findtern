import { shortDate } from "@/lib/format";

export type HoursMonth = { key: string; start: Date; approved: number; sent: number; draft: number };

const n1 = (v: number) => Number(v.toFixed(1));

/**
 * Hours by month as horizontal bars: solid = approved, hatched = still waiting
 * (sent or draft). Widths are share of the busiest month.
 */
export function HoursBars({ months }: { months: HoursMonth[] }) {
  const totals = months.map((m) => m.approved + m.sent + m.draft);
  const max = Math.max(...totals, 1);
  return (
    <ul className="mt-3 space-y-3">
      {[...months].reverse().map((m, i) => {
        const total = totals[months.length - 1 - i];
        return (
          <li key={m.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
            <span className="truncate text-ink-700">{shortDate(m.start, { month: "short", year: "numeric", timeZone: "UTC" })}</span>
            <span className="flex h-3 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${n1(m.approved)} approved of ${n1(total)} hours`}>
              <span className="h-full bg-brand-600" style={{ width: `${(m.approved / max) * 100}%` }} />
              <span
                className="h-full bg-brand-600/25 [background-image:repeating-linear-gradient(135deg,rgba(22,107,84,0.55)_0_2px,transparent_2px_6px)]"
                style={{ width: `${((total - m.approved) / max) * 100}%` }}
              />
            </span>
            <span className="nums w-20 text-right font-semibold text-ink-900">
              {n1(total)} h
              {m.approved < total ? <span className="block text-xs font-normal text-text-subtle">{n1(m.approved)} approved</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
