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
    : a.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).replace(/\bSept\b/, "Sep");
  const right = b.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\bSept\b/, "Sep");
  return `${left} – ${right}`;
}

/** "Mon" and "12 Oct" for one `YYYY-MM-DD` day. */
export function dayParts(iso: string): { weekday: string; date: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\bSept\b/, "Sep"),
  };
}

function toDay(value: Date | string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : isoDay(value);
}
