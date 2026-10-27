import { addMonthsIso, type StipendDue } from "./stipend-dues.ts";
import { toInrMinor } from "./money.ts";

/**
 * Money and offer facts for one row of the admin candidate list (ADP-02,
 * legacy GET /api/admin/interns, routes.ts:7530-7950).
 *
 * Computed in JS from the stipend dues, because the "next payment" rule
 * (start date + paid months + 1) is the one the payouts screen uses and must
 * not be re-derived differently in SQL. Only hired interns have dues, so the
 * set is small enough to load whole for filtering and sorting.
 */

export type InternMoney = {
  /** Sum of pending payout rows, INR paise (legacy "Pending payout"). */
  pendingPayoutMinor: number;
  /** Every unpaid month across placements at the intern's share (legacy "Left to pay"). */
  owedMinor: number;
  /** YYYY-MM-DD of the earliest unpaid month, null when nothing is scheduled. */
  nextDate: string | null;
};

type PayoutLike = { status: string; amountMinor: number; currency: string | null };

export function internMoney(dues: StipendDue[], payouts: PayoutLike[]): InternMoney {
  const pendingPayoutMinor = payouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + toInrMinor(p.amountMinor, p.currency), 0);
  const owedMinor = dues.reduce((sum, d) => sum + d.remainingMinor, 0);
  const nextDate =
    dues
      .map((d) => d.nextDate)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;
  return { pendingPayoutMinor, owedMinor, nextDate };
}

export type DueFilter = "overdue" | "week" | "month" | "has" | "none";

/**
 * Legacy filter windows: overdue is before today; "this week" is today to
 * seven days out; "this month" is today to one calendar month out.
 */
export function matchesDue(nextDate: string | null, filter: DueFilter, todayIso: string): boolean {
  if (filter === "none") return !nextDate;
  if (!nextDate) return false;
  if (filter === "has") return true;
  if (filter === "overdue") return nextDate < todayIso;
  if (nextDate < todayIso) return false;
  const end = filter === "week" ? addDaysIso(todayIso, 7) : addMonthsIso(todayIso, 1);
  return end !== null && nextDate <= end;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today in IST as YYYY-MM-DD (admins work in IST). */
export function todayIstIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
