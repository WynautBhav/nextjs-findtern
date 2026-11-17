import { addDays, isRealDay, todayIst } from "./offer.ts";

/**
 * Business-day rules for hiring start dates. Pure; every day is an India (IST) calendar day "YYYY-MM-DD".
 *
 * An offer's start date must be a weekday (Monday to Friday) and at least HIRING_LEAD_DAYS calendar days after the
 * day it is sent, measured in India: a send at 23:30 IST on a Friday is Friday even though it is already Saturday
 * in UTC terms for part of that window. If that day is a weekend it rolls forward to Monday. Holidays are ignored
 * (no list exists).
 *
 *   sent Mon -> Wed   Tue -> Thu   Wed -> Fri   Thu -> Mon   Fri -> Mon   Sat -> Mon   Sun -> Tue
 */

export const HIRING_LEAD_DAYS = 2;

/** 0 Sunday .. 6 Saturday for an IST calendar day; NaN for anything that is not a real day. */
export function istWeekday(day: string): number {
  return isRealDay(day) ? new Date(`${day}T00:00:00Z`).getUTCDay() : Number.NaN;
}

/** Monday to Friday. */
export function isBusinessDay(day: string): boolean {
  const wd = istWeekday(day);
  return wd >= 1 && wd <= 5;
}

/** The first weekday that is at least HIRING_LEAD_DAYS after the India day of `sentAt`. */
export function earliestStartDate(sentAt: Date): string {
  let day = addDays(todayIst(sentAt), HIRING_LEAD_DAYS);
  while (!isBusinessDay(day)) day = addDays(day, 1);
  return day;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-23" -> "Mon 23 Nov", for the inline hint and the error copy. */
export function formatStartDay(day: string): string {
  if (!isRealDay(day)) return day;
  return `${WEEKDAYS[istWeekday(day)]} ${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** Why `startDate` cannot be used for an offer sent at `sentAt`, in the words shown to the employer; null when it can. */
export function startDateProblem(startDate: string, sentAt: Date): string | null {
  const day = String(startDate ?? "").slice(0, 10);
  if (!isRealDay(day)) return "Pick a start date.";
  const earliest = earliestStartDate(sentAt);
  if (day < earliest) return `The earliest start date is ${formatStartDay(earliest)} (${HIRING_LEAD_DAYS} days after sending, weekdays only).`;
  if (!isBusinessDay(day)) return "The start date must be a weekday (Monday to Friday).";
  return null;
}

/** The first `count` allowed start dates, earliest first. */
export function validStartDates(sentAt: Date, count: number): string[] {
  const out: string[] = [];
  let day = earliestStartDate(sentAt);
  while (out.length < count) {
    if (isBusinessDay(day)) out.push(day);
    day = addDays(day, 1);
  }
  return out;
}
