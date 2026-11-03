/**
 * The "payout run" desk on /admin/payouts: pure figures derived from the
 * placement dues the page already loads (loadPlacementDues). No I/O, no money
 * rules of its own: each placement's next payout is its existing `nextDate`
 * and `min(monthlyShareMinor, remainingMinor)`, the same month the
 * "Create payout" action prefills.
 */

export type RunPlacement = {
  nextDate: string | null;
  monthlyShareMinor: number;
  remainingMinor: number;
  totalShareMinor: number;
  paidMinor: number;
  employer: { months: number; monthlyInrMinor: number; dueInrMinor: number } | null;
};

export type RunDay = { date: string; amountMinor: number; count: number; overdue: boolean };
export type RunWeek = { start: string; end: string; amountMinor: number; count: number; days: RunDay[] };

export type PayoutRun = {
  /** Every date with something due, soonest first. */
  days: RunDay[];
  /** Earliest due date (overdue or not), null when nothing is owed. */
  next: RunDay | null;
  overdue: { amountMinor: number; count: number; days: number };
  /** Six seven-day windows from today. */
  weeks: RunWeek[];
  /** Largest week total, for scaling the bars. */
  maxWeekMinor: number;
  /** Beyond the six weeks. */
  later: { amountMinor: number; count: number };
  flow: { receivedMinor: number; dueMinor: number; paidMinor: number };
  /** paid / total stipend across all placements, 0..1. */
  paidFraction: number;
  totalMinor: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for the Indian calendar day containing `now`. */
export function istDayKey(now: Date): string {
  if (Number.isNaN(now.getTime())) return "";
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const RUN_WEEKS = 6;

export function buildPayoutRun(rows: RunPlacement[], today: string): PayoutRun {
  const byDate = new Map<string, { amountMinor: number; count: number }>();
  let totalMinor = 0;
  let paidMinor = 0;
  let dueMinor = 0;
  let receivedMinor = 0;

  for (const r of rows) {
    totalMinor += r.totalShareMinor;
    paidMinor += r.paidMinor;
    if (r.employer) {
      receivedMinor += Math.max(0, r.employer.monthlyInrMinor * r.employer.months - r.employer.dueInrMinor);
    }
    if (r.remainingMinor <= 0) continue;
    dueMinor += r.remainingMinor;
    const date = r.nextDate && ISO.test(r.nextDate) ? r.nextDate : null;
    if (!date) continue;
    const amount = Math.min(r.monthlyShareMinor > 0 ? r.monthlyShareMinor : r.remainingMinor, r.remainingMinor);
    const cur = byDate.get(date) ?? { amountMinor: 0, count: 0 };
    cur.amountMinor += amount;
    cur.count += 1;
    byDate.set(date, cur);
  }

  const valid = ISO.test(today);
  const days: RunDay[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, ...v, overdue: valid && date < today }));

  const overdueDays = days.filter((d) => d.overdue);
  const overdue = {
    amountMinor: overdueDays.reduce((n, d) => n + d.amountMinor, 0),
    count: overdueDays.reduce((n, d) => n + d.count, 0),
    days: overdueDays.length,
  };

  const weeks: RunWeek[] = [];
  let later = { amountMinor: 0, count: 0 };
  if (valid) {
    for (let i = 0; i < RUN_WEEKS; i++) {
      const start = addDaysIso(today, i * 7);
      const end = addDaysIso(today, i * 7 + 6);
      const inWeek = days.filter((d) => d.date >= start && d.date <= end);
      weeks.push({
        start,
        end,
        amountMinor: inWeek.reduce((n, d) => n + d.amountMinor, 0),
        count: inWeek.reduce((n, d) => n + d.count, 0),
        days: inWeek,
      });
    }
    const horizon = addDaysIso(today, RUN_WEEKS * 7);
    const beyond = days.filter((d) => d.date >= horizon);
    later = { amountMinor: beyond.reduce((n, d) => n + d.amountMinor, 0), count: beyond.reduce((n, d) => n + d.count, 0) };
  }

  return {
    days,
    next: days[0] ?? null,
    overdue,
    weeks,
    maxWeekMinor: weeks.reduce((m, w) => Math.max(m, w.amountMinor), 0),
    later,
    flow: { receivedMinor, dueMinor, paidMinor },
    paidFraction: totalMinor > 0 ? Math.min(1, Math.max(0, paidMinor / totalMinor)) : 0,
    totalMinor,
  };
}
