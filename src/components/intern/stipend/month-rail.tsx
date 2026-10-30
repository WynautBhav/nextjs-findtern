import { Check, Clock3 } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import type { PayoutRow } from "@/lib/journey";
import { formatMoney, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { STIPEND_CURRENCY, type StipendMonth } from "./months";

const IST = "Asia/Kolkata";
const day = (d: Date, tz = IST) => shortDate(d, { day: "numeric", month: "short", timeZone: tz });
const money = (n: number) => formatMoney(n, STIPEND_CURRENCY, { zeroLabel: false });

/** "Paid 7 Oct · Ref UTR…"; a payment bigger than the month says it is the one that covered it. */
function paidLine(p: PayoutRow, monthlyMinor: number): string {
  const when = day(p.paidAt ?? p.createdAt);
  const lead = (p.amountMinor ?? 0) === monthlyMinor ? `Paid ${when}` : `From the ${money(p.amountMinor ?? 0)} paid ${when}`;
  return p.referenceId ? `${lead} · Ref ${p.referenceId}` : lead;
}

/**
 * Each month of the internship on a rail: paid with its date and bank
 * reference, scheduled with its date when one is set, otherwise still to
 * come. "Scheduled" is never "due": a date can move.
 */
export function MonthRail({ months, monthlyMinor, now = new Date() }: { months: StipendMonth[]; monthlyMinor: number; now?: Date }) {
  return (
    <ol className="relative grid gap-4">
      {/* The rail itself: centred on the 28px marks. */}
      <span aria-hidden className="absolute bottom-3 left-3.5 top-3 w-px -translate-x-1/2 bg-ink-200" />
      {months.map((m, i) => {
        const label = m.from && m.to ? `${day(m.from, "UTC")} – ${day(m.to, "UTC")}` : `Month ${i + 1}`;
        const started = !m.from || m.from.getTime() <= now.getTime();
        const lines =
          m.state === "paid"
            ? m.paidBy.map((p) => paidLine(p, monthlyMinor))
            : [
                ...(m.paidMinor > 0 ? [`${money(m.paidMinor)} paid`, ...m.paidBy.map((p) => paidLine(p, monthlyMinor))] : []),
                ...(m.pendingMinor > 0 ? [m.scheduledAt ? `${money(m.pendingMinor)} scheduled for ${day(m.scheduledAt)}` : `${money(m.pendingMinor)} scheduled, date to be set`] : []),
                ...(m.state === "upcoming" ? [started ? "Not scheduled yet" : "To come"] : []),
              ];
        const stateLabel = { paid: "Paid", pending: "Scheduled", part: "Part paid", upcoming: started ? "Not scheduled yet" : "To come" }[m.state];
        return (
          <li key={i} className="relative flex gap-3">
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full",
                m.state === "paid" && "bg-brand-700 text-white",
                m.state === "pending" && "bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-300",
                m.state === "part" && "bg-brand-100 text-brand-800 ring-2 ring-inset ring-brand-700",
                // taste-skill-ignore: hatched = still to come, the same mark as the gauge.
                m.state === "upcoming" &&
                  "bg-surface bg-[repeating-linear-gradient(135deg,var(--color-brand-300)_0_2px,transparent_2px_5px)] ring-1 ring-inset ring-brand-300",
              )}
            >
              {m.state === "paid" ? <Check className="size-3.5" strokeWidth={3} /> : m.state === "upcoming" ? null : <Clock3 className="size-3.5" strokeWidth={2.5} />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="nums text-sm font-medium text-ink-900">
                  {label}
                  {m.current ? <Pill tone="live" className="ml-2 align-middle">This month</Pill> : null}
                </p>
                <p className="nums text-sm font-semibold text-ink-900">
                  {money(monthlyMinor)}
                  <span className="sr-only">, {stateLabel}</span>
                </p>
              </div>
              {lines.map((line) => (
                <p key={line} className="mt-1 break-words text-xs text-text-subtle">
                  {line}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
