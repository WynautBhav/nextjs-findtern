/**
 * What the start-date pickers show and enforce, on the same rule the server holds them to (lib/business-days.ts):
 * a weekday, at least two days after the India day the offer is sent. Pure and free of the `@/` alias so the node
 * tests run it directly.
 */
import { earliestStartDate, formatStartDay, HIRING_LEAD_DAYS, isBusinessDay, startDateProblem } from "../../lib/business-days.ts";
import { addDays } from "../../lib/offer.ts";

/** The line under the field: "Earliest start: Mon 23 Nov (2 days after sending, weekdays only)". */
export function startDateHint(now: Date): string {
  return `Earliest start: ${formatStartDay(earliestStartDate(now))} (${HIRING_LEAD_DAYS} days after sending, weekdays only)`;
}

/** Whether the picker greys out `day`: a weekend, or before the earliest start. */
export function startDayDisabled(now: Date): (day: string) => boolean {
  const earliest = earliestStartDate(now);
  return (day) => day < earliest || !isBusinessDay(day);
}

/**
 * A chosen date the rule refuses, moved to the nearest allowed one, with the sentence that says so. A date that is
 * fine, empty, or equal to `keep` (the date an edit started with: valid when sent, never judged again) is returned
 * untouched.
 */
export function fixStartDate(value: string, now: Date, keep = ""): { value: string; notice: string | null } {
  if (!value || value === keep || startDateProblem(value, now) === null) return { value, notice: null };
  const earliest = earliestStartDate(now);
  if (value < earliest) {
    return { value: earliest, notice: `${formatStartDay(value)} is too soon, so the start date moved to ${formatStartDay(earliest)} (${HIRING_LEAD_DAYS} days after sending, weekdays only).` };
  }
  let next = value;
  while (!isBusinessDay(next)) next = addDays(next, 1);
  return { value: next, notice: `${formatStartDay(value)} is a weekend, so the start date moved to ${formatStartDay(next)}.` };
}

/** The error a form shows for the start date at submit, or null; the same words as the server's 400. */
export function startDateIssue(value: string, now: Date, keep = ""): string | null {
  if (!value) return "Pick a start date, as DD/MM/YYYY.";
  if (value === keep) return null;
  return startDateProblem(value, now);
}
