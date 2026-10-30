import { Pill } from "@/components/app/primitives";
import { formatMoney, shortDate } from "@/lib/format";
import { payoutState, readScheduledForDate, type PayoutRow } from "@/lib/journey";

import { STIPEND_CURRENCY, totalsByCurrency } from "./months";

const date = (d: Date) => shortDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const STATE = {
  paid: { label: "Paid", tone: "paid" },
  pending: { label: "Scheduled", tone: "waiting" },
  failed: { label: "Failed", tone: "closed" },
} as const;

/**
 * Every payout, newest first, as a ledger: date, bank reference, status and
 * amount in its own currency. On a phone the reference sits under the date
 * and the status under the amount, so nothing scrolls sideways.
 */
export function PaymentLedger({ payouts }: { payouts: PayoutRow[] }) {
  const paidTotals = totalsByCurrency(payouts, "paid");
  return (
    <div className="-mx-5 overflow-hidden lg:-mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-xs text-text-subtle">
            <th scope="col" className="py-2 pl-5 pr-3 font-medium lg:pl-6">
              Date
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Reference
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Status
            </th>
            <th scope="col" className="py-2 pl-3 pr-5 text-right font-medium lg:pr-6">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {payouts.map((p) => {
            const state = payoutState(p.status);
            const s = state ? STATE[state] : { label: "Recorded", tone: "neutral" as const };
            const scheduled = readScheduledForDate(p);
            const when =
              state === "paid" ? date(p.paidAt ?? p.createdAt) : state === "pending" ? (scheduled ? date(scheduled) : "Date to be set") : date(p.createdAt);
            const ref = state === "failed" ? p.notes || "The transfer did not go through" : p.referenceId ? `Ref ${p.referenceId}` : "No reference yet";
            return (
              <tr key={p.id} className="align-top">
                <td className="py-3 pl-5 pr-3 lg:pl-6">
                  <p className="nums font-medium text-ink-900">{when}</p>
                  <p className="mt-1 break-all text-xs text-text-subtle sm:hidden">{ref}</p>
                </td>
                <td className="nums hidden break-all px-3 py-3 text-ink-700 sm:table-cell">{ref}</td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <Pill tone={s.tone}>{s.label}</Pill>
                </td>
                <td className="py-3 pl-3 pr-5 text-right lg:pr-6">
                  <p className="nums whitespace-nowrap font-semibold text-ink-900">
                    {formatMoney(p.amountMinor ?? 0, p.currency ?? STIPEND_CURRENCY, { zeroLabel: false })}
                  </p>
                  <Pill tone={s.tone} className="mt-1 sm:hidden">
                    {s.label}
                  </Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
        {payouts.length > 1 && paidTotals.length > 0 ? (
          <tfoot className="border-t border-ink-200">
            {paidTotals.map((t) => (
              <tr key={t.currency}>
                {/* Two label cells: the phone shows two columns, wider screens four. */}
                {[" sm:hidden", " hidden sm:table-cell"].map((show, i) => (
                  <th key={show} scope="row" colSpan={i ? 3 : 1} className={`py-3 pl-5 pr-3 text-left font-medium text-ink-700 lg:pl-6${show}`}>
                    Paid in total{paidTotals.length > 1 ? ` (${t.currency})` : ""}
                  </th>
                ))}
                <td className="nums whitespace-nowrap py-3 pl-3 pr-5 text-right font-semibold text-ink-900 lg:pr-6">
                  {formatMoney(t.minor, t.currency, { zeroLabel: false })}
                </td>
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
