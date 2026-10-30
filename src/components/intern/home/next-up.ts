import { engagementPeriods, uncoveredParts, type Period } from "../../../lib/employer-timesheets.ts";
import { todayIst } from "../../../lib/timesheet-days.ts";

/**
 * Home's "Next up": the one dated thing coming, picked from rows only. Each
 * candidate carries a real date; with none, there is no tile (PRODUCT.md: no
 * invented urgency).
 */
export type NextUp = {
  kind: "interview" | "timesheet" | "payout";
  /** India-time calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Exact moment when the row has one (interview slot, payout date). */
  at: Date | null;
  /** A timesheet period's last day. */
  end?: string;
};

export function pickNextUp(input: {
  now: Date;
  /** Booked company interview slot, already filtered to ones still joinable. */
  interview: Date | null;
  /** Earliest pending payout's scheduled date. */
  payoutDue: Date | null;
  /** The live internship's offer, for when its next timesheet period opens. */
  sheet: { startDate: string | null; months: number; taken: Period[] } | null;
}): NextUp | null {
  const today = todayIst(input.now);
  const options: NextUp[] = [];
  if (input.interview) options.push({ kind: "interview", day: todayIst(input.interview), at: input.interview });
  // A payout date that has passed is overdue, not "next"; Stipend shows it.
  if (input.payoutDue && todayIst(input.payoutDue) >= today) {
    options.push({ kind: "payout", day: todayIst(input.payoutDue), at: input.payoutDue });
  }
  if (input.sheet?.startDate) {
    // Same rule as the Timesheets page head: the first uncovered part that has not started.
    const opens = engagementPeriods(input.sheet.startDate, input.sheet.months)
      .flatMap((p) => uncoveredParts(p, input.sheet!.taken))
      .find((p) => p.start > today);
    if (opens) options.push({ kind: "timesheet", day: opens.start, end: opens.end, at: null });
  }
  return options.sort((a, b) => a.day.localeCompare(b.day) || (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))[0] ?? null;
}

/** "Today", "Tomorrow", "In 3 days": whole India-time days from `today`. */
export function daysAway(today: string, day: string): string {
  const n = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}
