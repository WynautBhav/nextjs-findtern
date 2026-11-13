import type { PlacementLedger } from "./dues.ts";

/**
 * Display rules for the checkout and Orders screens. Pure: they only decide what
 * to SHOW. Amounts, settlement and the 15-day payable window live in `dues.ts`
 * and `billing-plan.ts` and are not touched here.
 */

/** How many days before its due day a month can be paid (mirrors PAY_WINDOW_DAYS in billing-plan.ts, shown not enforced). */
const WINDOW_DAYS = 15;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-05" -> "05 Dec"; "" when it is not a YYYY-MM-DD day. */
export function dayMonth(isoDay: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay ?? ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "";
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]}`;
}

/**
 * Checkout: the one line that replaces the month-by-month list,
 * "Then ₹X/month for N more months · next due 05 Dec".
 * `schedule` is each later month's due day, month 2 first. Null when nothing
 * follows today's payment. `money` formats minor units (the caller owns currency).
 */
export function scheduleSummary(schedule: readonly string[], monthlyMinor: number | null, money: (minor: number) => string): string | null {
  const days = schedule.filter((d) => dayMonth(d));
  if (days.length === 0) return null;
  const first = [...days].sort()[0];
  const n = days.length;
  const amount = monthlyMinor != null && monthlyMinor > 0 ? ` ${money(monthlyMinor)}/month for` : "";
  return `Then${amount} ${n} more ${n === 1 ? "month" : "months"} · next due ${dayMonth(first)}`;
}

export type PayButtonState =
  | { show: false }
  | {
      show: true;
      enabled: boolean;
      /** Button text: "Pay month 2" on a monthly or post-paid hire, else "Pay". */
      label: string;
      /** YYYY-MM-DD the month opens for payment; set only when the button is disabled because that day is still ahead. */
      payableFrom: string | null;
    };

function minusDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Orders > Payment schedule: a Pay button on every row that still owes money.
 * Enabled when checkout can bill the row (the old monthly plan, or the row is in
 * `payableIds`, i.e. the server's list of lines checkout accepts); otherwise it is
 * disabled and, when a next-due day is known, names the day it opens (due - 15 days).
 */
export function payButtonState(ledger: Pick<PlacementLedger, "proposalId" | "plan" | "dueMinor" | "monthsPaid" | "nextDue">, payableIds: readonly string[], todayIst: string): PayButtonState {
  if (!(ledger.dueMinor > 0)) return { show: false };
  const label = ledger.plan === "monthly" || ledger.plan === "postpaid" ? `Pay month ${ledger.monthsPaid + 1}` : "Pay";
  const enabled = ledger.plan === "monthly" || payableIds.includes(ledger.proposalId);
  if (enabled) return { show: true, enabled: true, label, payableFrom: null };
  const from = ledger.nextDue ? minusDays(ledger.nextDue, WINDOW_DAYS) : null;
  return { show: true, enabled: false, label, payableFrom: from && todayIst < from ? from : null };
}
