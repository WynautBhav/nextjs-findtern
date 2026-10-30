import { payoutState, readScheduledForDate, type PayoutRow } from "../../../lib/journey.ts";

/**
 * The stipend month by month, for the Stipend page's gauge and rail.
 *
 * Payouts carry no month, so each month is filled from the payouts in the
 * order they landed (paid first, then pending by scheduled date), the same
 * cumulative reading the old month strip used. A month records which
 * payouts filled it, so one ₹25,000 transfer that covers two ₹12,500 months
 * reads as one payment for both, not two payments on the same day.
 *
 * The intern's stipend is always INR (offer.ts `internStipendInrMinor`), so
 * only INR payouts are placed against it; any other currency is left to the
 * ledger rather than added to rupees.
 */
export const STIPEND_CURRENCY = "INR";

export type MonthState = "paid" | "pending" | "part" | "upcoming";

export type StipendMonth = {
  /** First and last day of this month of the internship (UTC midnight), or null without a start date. */
  from: Date | null;
  to: Date | null;
  state: MonthState;
  paidMinor: number;
  pendingMinor: number;
  /** Payouts that put money into this month, oldest first. */
  paidBy: PayoutRow[];
  pendingBy: PayoutRow[];
  /** Earliest scheduled date among `pendingBy`, when one is set. */
  scheduledAt: Date | null;
  /** Today (IST) falls inside this month. */
  current: boolean;
};

export type StipendPlan = {
  months: StipendMonth[];
  totalMinor: number;
  paidMinor: number;
  pendingMinor: number;
  toComeMinor: number;
};

const DAY_MS = 86_400_000;

/** Same day of month `i` months on, clamped to the month's length (31 Jan + 1 → 28/29 Feb). */
function addMonths(start: Date, i: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + i;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), last)));
}

function isInr(p: PayoutRow): boolean {
  return (p.currency ?? STIPEND_CURRENCY).toUpperCase() === STIPEND_CURRENCY;
}

export function stipendPlan(input: {
  months: number;
  monthlyMinor: number;
  /** Offer start date, YYYY-MM-DD. */
  startDate: string | null;
  /** This internship's payouts, any currency. */
  payouts: PayoutRow[];
  now?: Date;
}): StipendPlan {
  const { months, monthlyMinor } = input;
  const inr = input.payouts.filter(isInr);
  const paid = inr
    .filter((p) => payoutState(p.status) === "paid")
    .sort((a, b) => (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime());
  const pending = inr
    .filter((p) => payoutState(p.status) === "pending")
    .sort((a, b) => (readScheduledForDate(a) ?? a.createdAt).getTime() - (readScheduledForDate(b) ?? b.createdAt).getTime());
  const sum = (rows: PayoutRow[]) => rows.reduce((n, p) => n + Math.max(0, p.amountMinor ?? 0), 0);

  const day = /^\d{4}-\d{2}-\d{2}/.test(input.startDate ?? "") ? new Date(`${input.startDate!.slice(0, 10)}T00:00:00Z`) : null;
  const istToday = new Date(`${new Date((input.now ?? new Date()).getTime() + 330 * 60_000).toISOString().slice(0, 10)}T00:00:00Z`);

  // Two queues of what is left of each payout, drained month by month.
  const queue = (rows: PayoutRow[]) => rows.map((p) => ({ p, left: Math.max(0, p.amountMinor ?? 0) }));
  const paidQ = queue(paid);
  const pendingQ = queue(pending);
  const take = (q: ReturnType<typeof queue>, need: number) => {
    const by: PayoutRow[] = [];
    let got = 0;
    for (const item of q) {
      if (got >= need) break;
      if (item.left <= 0) continue;
      const n = Math.min(item.left, need - got);
      item.left -= n;
      got += n;
      by.push(item.p);
    }
    return { got, by };
  };

  const out: StipendMonth[] = [];
  for (let i = 0; i < Math.max(0, months); i++) {
    const p = take(paidQ, monthlyMinor);
    const q = take(pendingQ, monthlyMinor - p.got);
    const from = day ? addMonths(day, i) : null;
    const to = day ? new Date(addMonths(day, i + 1).getTime() - DAY_MS) : null;
    const scheduled = q.by.map(readScheduledForDate).filter((d): d is Date => d !== null);
    out.push({
      from,
      to,
      state: p.got >= monthlyMinor ? "paid" : p.got + q.got >= monthlyMinor ? "pending" : p.got + q.got > 0 ? "part" : "upcoming",
      paidMinor: p.got,
      pendingMinor: q.got,
      paidBy: p.by,
      pendingBy: q.by,
      scheduledAt: scheduled.length ? new Date(Math.min(...scheduled.map((d) => d.getTime()))) : null,
      current: Boolean(from && to && istToday >= from && istToday <= to),
    });
  }

  const totalMinor = Math.max(0, months) * monthlyMinor;
  const paidMinor = sum(paid);
  const pendingMinor = sum(pending);
  return { months: out, totalMinor, paidMinor, pendingMinor, toComeMinor: Math.max(0, totalMinor - paidMinor - pendingMinor) };
}

/** Totals of one payout state, one entry per currency: amounts in different currencies are never added. */
export function totalsByCurrency(payouts: PayoutRow[], state: "paid" | "pending" | "failed"): { currency: string; minor: number }[] {
  const by = new Map<string, number>();
  for (const p of payouts) {
    if (payoutState(p.status) !== state) continue;
    const c = (p.currency ?? STIPEND_CURRENCY).toUpperCase();
    by.set(c, (by.get(c) ?? 0) + Math.max(0, p.amountMinor ?? 0));
  }
  return [...by].filter(([, minor]) => minor > 0).map(([currency, minor]) => ({ currency, minor }));
}
