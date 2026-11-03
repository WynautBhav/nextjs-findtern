/**
 * The "payout run" desk on /admin/payouts: pure figures derived from the
 * placement dues the page already loads (loadPlacementDues). No I/O, no money
 * rules of its own: each placement's next payout is its existing `nextDate`
 * and `min(monthlyShareMinor, remainingMinor)`, the same month the
 * "Create payout" action prefills.
 */

export type RunPlacement = {
  /** Distinct interns are counted, not placements: one intern can hold several. */
  internId: string;
  nextDate: string | null;
  monthlyShareMinor: number;
  remainingMinor: number;
  totalShareMinor: number;
  paidMinor: number;
  employer: { months: number; monthlyInrMinor: number; dueInrMinor: number } | null;
};

export type RunDay = { date: string; amountMinor: number; count: number; overdue: boolean; interns: string[] };
export type RunWeek = { start: string; end: string; amountMinor: number; count: number; days: RunDay[] };

export type PayoutRun = {
  /** Every date with something due, soonest first. */
  days: RunDay[];
  /** Earliest due date that is today or later, null when nothing is upcoming. */
  next: RunDay | null;
  /** Everything overdue (all passed dates), distinct interns. */
  overdue: { amountMinor: number; count: number; days: number };
  /** Six seven-day windows from today. */
  weeks: RunWeek[];
  /** Largest week total, for scaling the bars. */
  maxWeekMinor: number;
  /** Beyond the six weeks. */
  later: { amountMinor: number; count: number };
  flow: { receivedMinor: number; dueMinor: number; paidMinor: number };
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

/** Year-aware label: the year shows whenever the date is not in today's year. */
export function formatRunDate(iso: string, today: string, opts: { weekday?: boolean } = {}): string {
  if (!ISO.test(iso)) return iso;
  const sameYear = ISO.test(today) && iso.slice(0, 4) === today.slice(0, 4);
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    ...(opts.weekday ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
    timeZone: "UTC",
  });
}

const distinct = (days: RunDay[]) => new Set(days.flatMap((d) => d.interns)).size;

/**
 * `paidOutMinor` is the payout ledger's paid total (loadPayouts). Per-placement
 * `paidMinor` only counts payouts linked to a placement, so it undercounts
 * (QA: 0 of 47 paid payouts carry a link); when given, the ledger wins. The two
 * flow figures come from different sources and are never combined into a total
 * or a percentage.
 */
export function buildPayoutRun(rows: RunPlacement[], today: string, paidOutMinor?: number): PayoutRun {
  const byDate = new Map<string, { amountMinor: number; interns: Set<string> }>();
  let paidMinor = 0;
  let dueMinor = 0;
  let receivedMinor = 0;

  for (const r of rows) {
    paidMinor += r.paidMinor;
    if (r.employer) {
      receivedMinor += Math.max(0, r.employer.monthlyInrMinor * r.employer.months - r.employer.dueInrMinor);
    }
    if (r.remainingMinor <= 0) continue;
    dueMinor += r.remainingMinor;
    const date = r.nextDate && ISO.test(r.nextDate) ? r.nextDate : null;
    if (!date) continue;
    const amount = Math.min(r.monthlyShareMinor > 0 ? r.monthlyShareMinor : r.remainingMinor, r.remainingMinor);
    const cur = byDate.get(date) ?? { amountMinor: 0, interns: new Set<string>() };
    cur.amountMinor += amount;
    cur.interns.add(r.internId);
    byDate.set(date, cur);
  }

  const valid = ISO.test(today);
  const days: RunDay[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, amountMinor: v.amountMinor, count: v.interns.size, interns: [...v.interns], overdue: valid && date < today }));

  const overdueDays = days.filter((d) => d.overdue);
  const overdue = {
    amountMinor: overdueDays.reduce((n, d) => n + d.amountMinor, 0),
    count: distinct(overdueDays),
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
        count: distinct(inWeek),
        days: inWeek,
      });
    }
    const horizon = addDaysIso(today, RUN_WEEKS * 7);
    const beyond = days.filter((d) => d.date >= horizon);
    later = { amountMinor: beyond.reduce((n, d) => n + d.amountMinor, 0), count: distinct(beyond) };
  }

  const paidOut = paidOutMinor != null && Number.isFinite(paidOutMinor) ? Math.max(0, paidOutMinor) : paidMinor;

  return {
    days,
    next: days.find((d) => !d.overdue) ?? null,
    overdue,
    weeks,
    maxWeekMinor: weeks.reduce((m, w) => Math.max(m, w.amountMinor), 0),
    later,
    flow: { receivedMinor, dueMinor, paidMinor: paidOut },
  };
}
