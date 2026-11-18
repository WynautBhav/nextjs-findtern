import Link from "next/link";

import { cn } from "@/lib/utils";
import type { MoneyStuck } from "@/lib/admin/dashboard-queues.types";

import { AgeDays, Money } from "./ledger";

/**
 * Money that is moving, as three ledger lines: what employers owe, what interns are owed, what came in
 * this week net of refunds. Amounts in tabular rupees; the age cell is how long the oldest item has waited
 * (null for the collected line, which is a flow, not a debt).
 */
export function MoneyLedger({ money, oldestOfferDays, oldestPayoutDays, payoutsHref }: { money: MoneyStuck; oldestOfferDays: number | null; oldestPayoutDays: number | null; payoutsHref: string | null }) {
  const lines = [
    { key: "owed", label: "Employers owe", note: `${money.employerOfferCount} accepted ${money.employerOfferCount === 1 ? "offer" : "offers"}, unpaid`, minor: money.owedByEmployersMinor, count: money.employerOfferCount, from: oldestOfferDays, signal: true },
    { key: "due", label: "Interns are owed", note: `${money.payoutCount} ${money.payoutCount === 1 ? "payout" : "payouts"} due now or within 3 days`, minor: money.dueToInternsMinor, count: money.payoutCount, from: oldestPayoutDays, signal: false, href: payoutsHref },
    { key: "in", label: "Collected this week", note: money.refundedWeekMinor > 0 ? "net of refunds, last 7 days" : "last 7 days, India time", minor: money.collectedWeekMinor, count: 1, from: null, signal: false },
  ].filter((l) => l.count > 0 || l.minor > 0);
  return (
    <section aria-labelledby="money-title">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink-800 pb-2">
        <h2 id="money-title" className="text-lg font-semibold text-ink-900">Money moving</h2>
        <span className="text-sm text-ink-700">waiting</span>
      </div>
      {lines.length === 0 ? (
        <p className="py-4 text-sm text-ink-700">No money is waiting on anyone. Payouts and unpaid offers show here as they appear.</p>
      ) : (
        <ul>
          {lines.map((l) => (
            <li key={l.key} className="grid grid-cols-[1fr_auto_3.5rem] items-baseline gap-4 border-b border-ink-200 py-3">
              <span className="min-w-0">
                {"href" in l && l.href ? <Link href={l.href} className="text-sm font-medium text-ink-900 underline-offset-4 hover:underline">{l.label}</Link> : <span className="text-sm font-medium text-ink-900">{l.label}</span>}
                <span className="block text-xs text-ink-600">{l.note}</span>
              </span>
              <Money minor={l.minor} className={cn("font-display text-lg font-semibold", l.signal ? "text-signal" : "text-ink-900")} />
              <span className="text-right text-sm">{l.from != null ? <AgeDays days={l.from} /> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
