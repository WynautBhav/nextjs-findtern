/**
 * Timesheet entry normalisation.
 *
 * `timesheets.entries` is a jsonb bag the intern form writes, and the legacy
 * shapes in the wild are inconsistent: dates arrive as a full ISO timestamp in
 * some rows and a bare `YYYY-MM-DD` in others, and `status` is free text that
 * the form constrains to five values but a migration never did.
 *
 * Pure functions, no React and no database, so `node --test src/lib/**` can
 * cover them (see the `test` script in package.json).
 */

/** The five values the intern form writes into each `entries` row. */
export const DAY_STATUSES = ["Present", "Leave", "Absent", "Fixed off", "Holiday"] as const;

export type DayStatus = (typeof DAY_STATUSES)[number];

export type DayEntry = { date: string; status: string };

export function formatPeriod(start: Date | null, end: Date | null): string {
  const fmt = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "-";
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatDay(value: Date | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Normalise `entries` into one row per day of the period.
 *
 * A day inside the period with no entry is carried through as `""` rather than
 * dropped. That is deliberate: a timesheet covering 1–31 May with three rows
 * means 28 days were never claimed, and hiding them would make an incomplete
 * timesheet look complete. The legacy detail page did the same
 * (employer-timesheet-detail.tsx:170).
 *
 * `status` is passed through verbatim - `countStatuses` is what tallies it, so
 * an unexpected value shows up as its own bucket instead of being silently
 * coerced into "Present".
 */
export function normaliseEntries(
  entries: unknown,
  periodStart: Date | null,
  periodEnd: Date | null,
): DayEntry[] {
  const byDate = new Map<string, string>();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { date?: unknown; status?: unknown };
      const date = typeof record.date === "string" ? record.date.slice(0, 10) : "";
      if (!date) continue;
      byDate.set(date, typeof record.status === "string" ? record.status.trim() : "");
    }
  }

  if (!periodStart || !periodEnd) {
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, status]) => ({ date, status }));
  }

  const out: DayEntry[] = [];
  const cursor = new Date(periodStart);
  const end = new Date(periodEnd);
  // Bounded walk: a period stored a decade apart would otherwise spin.
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    const date = cursor.toISOString().slice(0, 10);
    out.push({ date, status: byDate.get(date) ?? "" });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Tallies by status, with unclaimed days collected under `""`. */
export function countStatuses(rows: DayEntry[]): Record<string, number> {
  const counts: Record<string, number> = { "": 0 };
  for (const row of rows) {
    const key = row.status || "Not claimed";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Days that actually carry one of the four known statuses. */
export function countClaimed(rows: DayEntry[]): number {
  const known = new Set<string>(DAY_STATUSES);
  return rows.filter((row) => known.has(row.status)).length;
}

export type Period = { start: string; end: string };

/**
 * Every timesheet period of an engagement: one per engagement month,
 * anchored to the joining date (18 Sep -> 17 Oct, 18 Oct -> 17 Nov, ...)
 * and never past the contract end. Anchoring to calendar months, as legacy
 * did (timesheets.tsx:309), made the first sheet and the next calendar
 * month overlap, so the days between them could never be logged or billed.
 * Dates are ISO `YYYY-MM-DD`, compared as strings.
 */
export function engagementPeriods(joiningIso: string, contractMonths: number): Period[] {
  const joining = joiningIso.slice(0, 10);
  const months = Math.max(1, Math.round(contractMonths));
  const contractEnd = addDaysIso(addMonthsIso(joining, months), -1);
  const out: Period[] = [];
  for (let k = 0; k < months; k += 1) {
    const start = addMonthsIso(joining, k);
    if (start > contractEnd) break;
    const end = addDaysIso(addMonthsIso(joining, k + 1), -1);
    out.push({ start, end: end > contractEnd ? contractEnd : end });
  }
  return out;
}

/**
 * The period a new timesheet covers. With `month` ("YYYY-MM"), the
 * engagement period that starts in that month, else the one running on its
 * 1st. Without, the earliest period that has started and is not in `taken`
 * (periods already holding a sheet). With no joining date on the offer it
 * falls back to the calendar month. Errors when nothing can be opened.
 */
export function timesheetPeriod(
  month: string | null,
  joiningIso: string | null,
  contractMonths: number,
  todayIso: string,
  taken: Period[] = [],
): Period | { error: string } {
  const joining = joiningIso && /^\d{4}-\d{2}-\d{2}/.test(joiningIso) ? joiningIso.slice(0, 10) : null;
  if (!joining) {
    const m = month ?? todayIso.slice(0, 7);
    const start = `${m}-01`;
    if (start > todayIso) return { error: "You can't log a month that hasn't started yet." };
    return { start, end: addDaysIso(addMonthsIso(start, 1), -1) };
  }
  if (joining > todayIso) return { error: "Your internship hasn't started yet." };

  const periods = engagementPeriods(joining, contractMonths);
  const overlaps = (p: Period) => taken.some((t) => t.start <= p.end && t.end >= p.start);
  if (month) {
    const pick =
      periods.find((p) => p.start.slice(0, 7) === month) ??
      periods.find((p) => p.start <= `${month}-01` && p.end >= `${month}-01`);
    if (!pick) {
      return { error: month < joining.slice(0, 7) ? "That month is before your joining date." : "Your contract had ended by that month." };
    }
    if (pick.start > todayIso) return { error: "You can't log a period that hasn't started yet." };
    return pick;
  }
  const open = periods.find((p) => p.start <= todayIso && !overlaps(p));
  if (open) return open;
  return periods.every((p) => overlaps(p))
    ? { error: "Every period of this internship already has a timesheet." }
    : { error: "The next period hasn't started yet." };
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp the day to the target month's length (31 Jan + 1 month = 28/29 Feb).
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
