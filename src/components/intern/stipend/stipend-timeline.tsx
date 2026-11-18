import { Check, Clock3 } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { formatMoney, shortDate } from "@/lib/format";
import type { PayoutRow } from "@/lib/journey";
import { cn } from "@/lib/utils";

import { STIPEND_CURRENCY, type StipendMonth } from "./months";

const IST = "Asia/Kolkata";
const day = (d: Date, tz = IST) => shortDate(d, { day: "numeric", month: "short", timeZone: tz });
const money = (n: number) => formatMoney(n, STIPEND_CURRENCY, { zeroLabel: false });

const WORD = { paid: "Paid", pending: "Scheduled", part: "Part paid", upcoming: "To come" } as const;

/** "Paid 7 Oct"; a payment bigger than the month says it is the one that covered it. */
function paidLine(p: PayoutRow, monthlyMinor: number): string {
  const when = day(p.paidAt ?? p.createdAt);
  return (p.amountMinor ?? 0) === monthlyMinor ? `Paid ${when}` : `Paid ${when}, part of a ${money(p.amountMinor ?? 0)} transfer`;
}

/**
 * The stipend as a timeline: one strip with a segment per month (solid = paid, ringed = scheduled, dashed = to
 * come) and under it each month as a row on a spine, its dates as the title and the amount right-aligned.
 * "Scheduled" is never "due": a date can move.
 */
export function StipendTimeline({ months, monthlyMinor, now = new Date() }: { months: StipendMonth[]; monthlyMinor: number; now?: Date }) {
  const count = (s: StipendMonth["state"]) => months.filter((m) => m.state === s).length;
  const summary = [
    count("paid") ? `${count("paid")} paid` : "",
    count("part") + count("pending") ? `${count("part") + count("pending")} scheduled` : "",
    count("upcoming") ? `${count("upcoming")} to come` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div>
      {/* The strip: decorative, the sentence beside it and the rows below say the same in words. */}
      <div className="flex items-center gap-3">
        <div aria-hidden className="flex flex-1 gap-1">
          {months.map((m, i) => (
            <span
              key={i}
              className={cn(
                "h-2 min-w-0 flex-1 rounded-sm",
                m.state === "paid" && "bg-brand-800",
                (m.state === "pending" || m.state === "part") && "bg-brand-100 ring-1 ring-inset ring-brand-700",
                m.state === "upcoming" && "border border-dashed border-ink-300",
              )}
            />
          ))}
        </div>
        <p className="nums shrink-0 text-sm text-ink-700">{summary}</p>
      </div>

      <ol className="mt-5">
        {months.map((m, i) => {
          const title = m.from && m.to ? `${day(m.from, "UTC")} to ${day(m.to, "UTC")}` : `Month ${i + 1}`;
          const started = !m.from || m.from.getTime() <= now.getTime();
          const when =
            m.state === "paid"
              ? m.paidBy.map((p) => paidLine(p, monthlyMinor)).join(", ")
              : m.state === "upcoming"
                ? started
                  ? "Not scheduled yet"
                  : m.from
                    ? `Starts ${day(m.from, "UTC")}`
                    : "To come"
                : [
                    m.paidMinor > 0 ? `${money(m.paidMinor)} paid` : "",
                    m.scheduledAt ? `${money(m.pendingMinor)} scheduled for ${day(m.scheduledAt)}` : `${money(m.pendingMinor)} scheduled, date to be set`,
                  ]
                    .filter(Boolean)
                    .join(", ");
          const last = i === months.length - 1;
          return (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              {/* Spine: runs from this mark to the next one. */}
              {last ? null : <span aria-hidden className={cn("absolute left-[0.6875rem] top-6 bottom-0 w-px", m.state === "paid" ? "bg-brand-700" : "bg-ink-300")} />}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  m.state === "paid" && "bg-brand-800 text-white",
                  (m.state === "pending" || m.state === "part") && "bg-surface-raised text-brand-800 ring-2 ring-inset ring-brand-700",
                  m.state === "upcoming" && "border border-dashed border-ink-400 bg-surface-raised",
                )}
              >
                {m.state === "paid" ? <Check className="size-3.5" strokeWidth={3} /> : m.state === "upcoming" ? null : <Clock3 className="size-3.5" strokeWidth={2.5} />}
              </span>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="nums text-base font-medium text-ink-900">
                    {title}
                    {m.current ? (
                      <Pill tone="live" className="ml-2 align-middle">
                        This month
                      </Pill>
                    ) : null}
                  </p>
                  <p className="nums mt-0.5 break-words text-sm text-ink-600">{when}</p>
                </div>
                <p className={cn("nums shrink-0 text-base font-semibold", m.state === "upcoming" ? "text-ink-600" : "text-ink-900")}>
                  {money(monthlyMinor)}
                  <span className="sr-only">, {WORD[m.state]}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
