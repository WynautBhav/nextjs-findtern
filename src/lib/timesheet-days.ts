import { shortDate } from "./format.ts";

/**
 * Calendar days of a timesheet period, as `YYYY-MM-DD` strings.
 *
 * One helper for the API, the editor and sheet creation. Periods are stored
 * as `start T00:00Z` .. `end T23:59:59.999Z` in a `timestamp` column, so the
 * UTC date part of each bound is the real calendar day. Walking them with
 * local-time methods (`setHours`, `getDate`) in IST pushed the end bound past
 * midnight and produced a phantom extra day that could never be filled.
 * Everything here is UTC date arithmetic on date-only strings.
 */

/** The calendar day of a stored bound (Date or ISO string). */
export function isoDay(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

/** Every day from `start` to `end`, inclusive. Bounded to ~13 months. */
export function periodDays(start: Date | string | null, end: Date | string | null): string[] {
  if (!start || !end) return [];
  const first = typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : isoDay(start);
  const last = typeof end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : isoDay(end);
  if (Number.isNaN(Date.parse(`${first}T00:00:00Z`)) || Number.isNaN(Date.parse(`${last}T00:00:00Z`))) return [];
  const out: string[] = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  for (let i = 0; i < 400; i += 1) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso > last) break;
    out.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` day. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * Today in India. Timesheets are an Indian payroll concept and the "no
 * future days" rule must not flip at 05:30 IST because a server runs in UTC.
 */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * A day after today (IST) can carry nothing. Rather than refuse the whole save,
 * blank status, hours and note on such days: a tab opened before this rule
 * (which pre-set future weekends to "Fixed off") would otherwise fail every
 * autosave until reloaded. Days up to and including today are untouched.
 */
export function clearFutureDays<T extends { date: string; status: string; hours: number; note: string }>(
  entries: T[],
  today: string,
): T[] {
  return entries.map((e) => (e.date > today ? { ...e, status: "", hours: 0, note: "" } : e));
}

/** The first day a period's timesheet can be sent: its last day. */
export function periodSendableFrom(periodEnd: Date | string): string {
  return toDay(periodEnd);
}

/** Month-end rule: sendable from the period's last day (IST), not before. */
export function canSendOn(today: string, periodEnd: Date | string): boolean {
  return today >= periodSendableFrom(periodEnd);
}

/**
 * A period by its calendar days: "18 Oct – 17 Nov 2026", "1 – 31 Oct 2026",
 * "18 Dec 2026 – 17 Jan 2027". Read in UTC, like `periodDays`, so the
 * stored end (23:59:59.999Z) never shows as the next day.
 */
export function formatPeriodDays(start: Date | string | null, end: Date | string | null): string {
  if (!start || !end) return "";
  const a = new Date(`${toDay(start)}T12:00:00Z`);
  const b = new Date(`${toDay(end)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  const left = sameMonth
    ? String(a.getUTCDate())
    : shortDate(a, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
  const right = shortDate(b, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  // A one-day period is one date, not "18 – 18 Oct 2026" (QA-152).
  if (toDay(start) === toDay(end)) return right;
  return `${left} – ${right}`;
}

/** "Mon" and "12 Oct" for one `YYYY-MM-DD` day. */
export function dayParts(iso: string): { weekday: string; date: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    date: shortDate(d, { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}

function toDay(value: Date | string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : isoDay(value);
}

/** The first date that appears twice in a save, or null. One day can carry one entry (two 8 h rows made a 16 h day). */
export function duplicateDay(entries: readonly { date: string }[]): string | null {
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.date)) return e.date;
    seen.add(e.date);
  }
  return null;
}

/**
 * A save replaces only the days it sends: days already on the sheet that the payload leaves out are kept, so a short or
 * stale payload can't wipe the month. The editor sends a blank row to clear a day. Result is sorted by date.
 */
export function mergeEntriesByDate<T extends { date: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const sent = new Set(incoming.map((e) => e.date));
  return [...existing.filter((e) => !sent.has(e.date)), ...incoming].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
