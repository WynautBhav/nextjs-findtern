import { RUN_WEEKS, addDaysIso, formatRunDate, type PayoutRun } from "../../../lib/admin/payout-run.ts";

/**
 * What the payouts page says first, and the rows of its six-week schedule. Pure: no I/O, no money rules,
 * only a reading of `buildPayoutRun`. Overdue interns and next-run interns are disjoint (each placement
 * contributes one next date), so the two figures are never added or subtracted from each other.
 */

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "In 33 days", "76 days overdue". */
export function relative(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n > 1) return `In ${n} days`;
  return `${-n} ${n === -1 ? "day" : "days"} overdue`;
}

export type NextRun = { date: string; amountMinor: number; count: number };

export type Lead =
  /** Something is past its payout date: that total leads, the next run is the second line. */
  | { kind: "overdue"; amountMinor: number; count: number; oldestDate: string; next: NextRun | null }
  | { kind: "next"; date: string; amountMinor: number; count: number }
  | { kind: "none" };

export function leadOf(run: PayoutRun): Lead {
  const next = run.next ? { date: run.next.date, amountMinor: run.next.amountMinor, count: run.next.count } : null;
  if (run.overdue.count > 0) {
    const oldest = run.days.find((d) => d.overdue);
    return { kind: "overdue", amountMinor: run.overdue.amountMinor, count: run.overdue.count, oldestDate: oldest?.date ?? "", next };
  }
  return next ? { kind: "next", ...next } : { kind: "none" };
}

export type ScheduleRow = {
  key: string;
  kind: "overdue" | "week" | "later";
  label: string;
  /** Second line: the date span of a week row. */
  sub?: string;
  amountMinor: number;
  count: number;
  /** Bar width as a share (0..1) of the busiest week. Null for the overdue and later rows: they span many dates and have no bar. */
  share: number | null;
  /** What the bar cell says instead of a bar. */
  note?: string;
};

export function scheduleRows(run: PayoutRun, today: string): { rows: ScheduleRow[]; maxMinor: number; horizon: string } {
  const max = run.maxWeekMinor;
  const horizon = formatRunDate(addDaysIso(today, RUN_WEEKS * 7 - 1), today);
  const rows: ScheduleRow[] = [];
  if (run.overdue.count > 0) {
    rows.push({
      key: "overdue",
      kind: "overdue",
      label: "Overdue",
      amountMinor: run.overdue.amountMinor,
      count: run.overdue.count,
      share: null,
      note: `${run.overdue.days} ${run.overdue.days === 1 ? "date" : "dates"} already passed`,
    });
  }
  run.weeks.forEach((w, i) => {
    rows.push({
      key: w.start,
      kind: "week",
      label: i === 0 ? "This week" : `${formatRunDate(w.start, today)} to ${formatRunDate(w.end, today)}`,
      sub: i === 0 ? `${formatRunDate(w.start, today)} to ${formatRunDate(w.end, today)}` : undefined,
      amountMinor: w.amountMinor,
      count: w.count,
      share: w.count > 0 && max > 0 ? Math.min(1, w.amountMinor / max) : 0,
    });
  });
  if (run.later.count > 0) {
    rows.push({ key: "later", kind: "later", label: "Later", amountMinor: run.later.amountMinor, count: run.later.count, share: null, note: `every date after ${horizon}` });
  }
  return { rows, maxMinor: max, horizon };
}
