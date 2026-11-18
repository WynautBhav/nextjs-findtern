import { shortDate } from "@/lib/format";
import type { MonthHours } from "@/lib/journey";
import { cn } from "@/lib/utils";

import { niceMax } from "./hours-scale-math";

const PARTS = [
  { key: "approved", label: "Approved", swatch: "bg-brand-800" },
  { key: "sent", label: "Waiting for review", swatch: "bg-brand-400" },
  { key: "draft", label: "Not sent yet", swatch: "bg-surface-raised ring-1 ring-inset ring-brand-700" },
] as const;

const PLOT = "h-44";

/**
 * Hours per month on a real scale: rules at 0, half and the top value, bars stacked by review state. The current
 * month with nothing logged is a labelled dashed baseline ("Not logged yet"), never a bar-shaped placeholder; an
 * earlier month with nothing logged is an en dash. The legend lists only the marks on screen.
 */
export function HoursScale({ months, now }: { months: MonthHours[]; now: Date }) {
  const total = (m: MonthHours) => m.approved + m.sent + m.draft;
  const top = niceMax(Math.max(0, ...months.map(total)));
  const label = (m: MonthHours) => shortDate(m.start, { month: "short", timeZone: "Asia/Kolkata" });
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now);
  const shown = PARTS.filter((p) => months.some((m) => m[p.key] > 0));

  return (
    <div>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 pt-6">
        <ul aria-hidden className={cn("nums relative text-right text-xs text-ink-600", PLOT)}>
          {[top, top / 2, 0].map((v, i) => (
            <li key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
              {v}
            </li>
          ))}
        </ul>
        <div className="relative">
          <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between", PLOT)}>
            <span className="border-t border-ink-200" />
            <span className="border-t border-ink-200" />
            <span className="border-t border-ink-300" />
          </div>
          <ul className="relative grid gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((m) => {
              const sum = Number(total(m).toFixed(1));
              const current = m.key === thisMonth;
              return (
                <li key={m.key} className="flex flex-col items-center">
                  <span className="sr-only">
                    {`${label(m)}: ` +
                      (sum
                        ? `${sum} hours, ${Number(m.approved.toFixed(1))} approved, ${Number(m.sent.toFixed(1))} waiting for review, ${Number(m.draft.toFixed(1))} not sent yet`
                        : current
                          ? "not logged yet"
                          : "no hours")}
                  </span>
                  <span aria-hidden className={cn("relative block w-full max-w-12", PLOT)}>
                    {sum ? (
                      <>
                        <span
                          className="absolute inset-x-0 bottom-0 flex origin-bottom flex-col-reverse overflow-hidden rounded-t-md motion-safe:animate-bar-grow"
                          style={{ height: `${(sum / top) * 100}%` }}
                        >
                          {PARTS.map((p) => (m[p.key] ? <span key={p.key} className={p.swatch} style={{ flexGrow: m[p.key] }} /> : null))}
                        </span>
                        <span className="nums absolute inset-x-0 -translate-y-full pb-1 text-center text-xs font-medium text-ink-900" style={{ bottom: `${(sum / top) * 100}%` }}>
                          {sum}
                        </span>
                      </>
                    ) : current ? (
                      <span className="absolute inset-x-0 bottom-0 border-t-2 border-dashed border-ink-500" />
                    ) : null}
                  </span>
                  <span aria-hidden className={cn("mt-2 text-xs", current ? "font-semibold text-ink-900" : "text-ink-600")}>
                    {current && !sum ? "Not logged yet" : label(m)}
                  </span>
                  {current && !sum ? <span aria-hidden className="text-xs text-ink-600">{label(m)}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 pl-[2.75rem] text-xs text-ink-700" aria-label="Legend">
        {shown.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-md", p.swatch)} />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
