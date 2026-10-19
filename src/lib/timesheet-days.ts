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
