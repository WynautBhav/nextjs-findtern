import { AlertCircle, Check, Clock3 } from "lucide-react";

import { Pill } from "@/components/app/primitives";
import { formatMoney, shortDate } from "@/lib/format";
import { payoutState, readScheduledForDate, type PayoutRow } from "@/lib/journey";

import { STIPEND_CURRENCY } from "./months";

const date = (d: Date) => shortDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const STATE = {
  paid: { label: "Paid", tone: "paid", icon: <Check strokeWidth={3} /> },
  pending: { label: "Scheduled", tone: "waiting", icon: <Clock3 /> },
  failed: { label: "Failed", tone: "closed", icon: <AlertCircle /> },
} as const;

/**
 * Every payout, newest first, the way a bank statement reads: the date as the title, the bank reference under it
 * (the thing you match against your statement), the amount right-aligned in its own currency and the status beside
 * it with an icon. One row layout for every width, so a phone never scrolls sideways.
 */
export function PaymentLedger({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <ul className="divide-y divide-ink-200 border-b border-ink-200">
      {payouts.map((p) => {
        const state = payoutState(p.status);
        const s = state ? STATE[state] : null;
        const scheduled = readScheduledForDate(p);
        const when = state === "paid" ? date(p.paidAt ?? p.createdAt) : state === "pending" ? (scheduled ? date(scheduled) : "Date to be set") : date(p.createdAt);
        const ref = state === "failed" ? p.notes || "The transfer did not go through" : p.referenceId ? p.referenceId : "No bank reference yet";
        return (
          <li key={p.id} className="flex items-start justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <p className="nums text-base font-medium text-ink-900">
                {when}
                {p.kind === "completion_bonus" ? <span className="ml-2 text-sm font-normal text-ink-600">Completion bonus</span> : null}
              </p>
              <p className="nums mt-0.5 break-all text-sm text-ink-600">
                <span className="sr-only">Bank reference </span>
                {ref}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row-reverse sm:items-baseline sm:gap-6">
              <p className="nums whitespace-nowrap text-base font-semibold text-ink-900">{formatMoney(p.amountMinor ?? 0, p.currency ?? STIPEND_CURRENCY, { zeroLabel: false })}</p>
              {s ? (
                <Pill tone={s.tone} icon={s.icon} className="sm:w-28">
                  {s.label}
                </Pill>
              ) : (
                <Pill>Recorded</Pill>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
