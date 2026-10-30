import { shortDate } from "@/lib/format";
import type { MonthHours } from "@/lib/journey";
import { cn } from "@/lib/utils";

// A month with no hours is a hatched pill (the reference's "no data" mark), never an empty track.
const NONE =
  "bg-[repeating-linear-gradient(135deg,var(--color-ink-300)_0_1.5px,transparent_1.5px_7px)] ring-1 ring-inset ring-ink-200"; // taste-skill-ignore

const PARTS = [
  { key: "approved", label: "Approved", swatch: "bg-brand-700" },
  { key: "sent", label: "Waiting for review", swatch: "bg-brand-300" },
  { key: "draft", label: "Not sent yet", swatch: "bg-brand-100 ring-1 ring-inset ring-brand-300" },
] as const;

/**
 * Home's hours per month as pill bars from the baseline: solid for hours,
 * stacked by state, hatched for a month with none. The legend lists only
 * the marks on screen.
 */
export function HoursPills({ months, now }: { months: MonthHours[]; now: Date }) {
  const total = (m: MonthHours) => m.approved + m.sent + m.draft;
  const max = Math.max(1, ...months.map(total));
  const label = (m: MonthHours) => shortDate(m.start, { month: "short", timeZone: "Asia/Kolkata" });
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now);
  const shown = PARTS.filter((p) => months.some((m) => m[p.key] > 0));
  const anyEmpty = months.some((m) => total(m) === 0);

  return (
    <div className="flex flex-1 flex-col">
      <ul className="grid items-end gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m) => {
          const sum = Number(total(m).toFixed(1));
          const current = m.key === thisMonth;
          return (
            <li key={m.key} className="flex flex-col items-center gap-2">
              <span className="sr-only">
                {`${label(m)}: ` +
                  (sum ? `${sum} hours, ${m.approved} approved, ${m.sent} waiting for review, ${m.draft} not sent yet` : "no hours logged")}
              </span>
              <span aria-hidden className="flex h-44 w-full max-w-14 flex-col items-center justify-end gap-2">
                <span className={cn("nums text-xs font-medium", sum ? "text-ink-900" : "text-text-subtle")}>
                  {sum ? `${sum}h` : null}
                </span>
                {sum ? (
                  // At least as tall as it is wide, so a short month is a round pill, never a sliver.
                  <span
                    className="flex min-h-18 w-full origin-bottom flex-col-reverse overflow-hidden rounded-full motion-safe:animate-bar-grow"
                    style={{ height: `${(sum / max) * 85}%` }}
                  >
                    {PARTS.map((p) => (m[p.key] ? <span key={p.key} className={p.swatch} style={{ flexGrow: m[p.key] }} /> : null))}
                  </span>
                ) : (
                  <span className={cn("h-1/2 min-h-14 w-full rounded-full", NONE)} />
                )}
              </span>
              <span aria-hidden className={cn("text-xs", current ? "font-medium text-ink-900" : "text-text-subtle")}>
                {label(m)}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-700" aria-label="Legend">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-full", p.swatch)} />
            {p.label}
          </li>
        ))}
        {anyEmpty ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-full", NONE)} />
            No hours logged
          </li>
        ) : null}
      </ul>
    </div>
  );
}
