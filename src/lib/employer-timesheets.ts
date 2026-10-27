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

/**
 * The four day statuses legacy writes, submits and counts (INW-05). "Leave"
 * was a new-app addition the legacy submit rejects, so the intern editor
 * offers only these; a stored "Leave" still reads (see `editableDayStatus`).
 */
export const LEGACY_DAY_STATUSES = ["Present", "Absent", "Fixed off", "Holiday"] as const;

export type LegacyDayStatus = (typeof LEGACY_DAY_STATUSES)[number];

/** One of the four legacy statuses, matched case-insensitively as legacy submit did. */
export function legacyDayStatus(value: unknown): LegacyDayStatus | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LEGACY_DAY_STATUSES.find((s) => s.toLowerCase() === v) ?? null;
}

/**
 * The status an editable (draft / sent back) day starts with in the intern
 * editor. A stored "Leave" was time away, so it becomes "Absent", which is
 * what legacy and the employer summaries count it as; anything unknown is
 * blank so the intern picks again.
 */
export function editableDayStatus(value: unknown): LegacyDayStatus | "" {
  const known = legacyDayStatus(value);
  if (known) return known;
  return typeof value === "string" && value.trim().toLowerCase() === "leave" ? "Absent" : "";
}

/**
 * Days of a period still without a status (INW-06 / INW-24, legacy
 * routes.ts:13790). A sheet is complete, and can be sent, once every day
 * carries one of the four legacy statuses. Hours play no part, and days
 * after today count like any other: legacy let a sheet go once it was
 * filled, not once the period was over.
 */
export function unfilledDays(days: string[], entries: unknown): string[] {
  const filled = new Set<string>();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { date?: unknown; status?: unknown };
      const date = typeof record.date === "string" ? record.date.slice(0, 10) : "";
      if (date && legacyDayStatus(record.status)) filled.add(date);
    }
  }
  return days.filter((day) => !filled.has(day));
}

export type DayEntry = { date: string; status: string };

/**
 * Period bounds are calendar dates stored as UTC timestamps (the end as
 * T23:59:59.999), so they are read in UTC. Read in IST, a 1-30 Sept sheet
 * printed as "1 Sept – 1 Oct" (DB-36).
 */
export function formatPeriodDay(value: Date | null, withYear = true): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function formatPeriod(start: Date | null, end: Date | null): string {
  const sameYear = start && end && new Date(start).getUTCFullYear() === new Date(end).getUTCFullYear();
  return `${formatPeriodDay(start, !sameYear)} – ${formatPeriodDay(end)}`;
}

/** A real instant (submitted, approved), in India time. */
export function formatDay(value: Date | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** One-letter codes for the review grid. */
export const DAY_CODE: Record<string, string> = {
  Present: "P",
  Absent: "A",
  "Fixed off": "F",
  Holiday: "H",
  Leave: "L",
};

/**
 * Statuses an employer can set. No "Leave": legacy has no such day status
 * (finish tracker, INW-05); an old "Leave" row still displays as itself.
 */
export const EMPLOYER_DAY_STATUSES = DAY_STATUSES.filter((s) => s !== "Leave");

/** Billable-day hours when a row carries none (legacy 8-hour day). */
export const DEFAULT_DAY_HOURS = 8;

export type DayDetail = DayEntry & { hours: number; note: string };

/** `normaliseEntries` plus each day's hours and note, for the review grid. */
export function dayDetails(entries: unknown, periodStart: Date | null, periodEnd: Date | null): DayDetail[] {
  const extra = new Map<string, { hours: number | null; note: string }>();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const r = entry as { date?: unknown; hours?: unknown; note?: unknown };
      if (typeof r.date !== "string") continue;
      const h = typeof r.hours === "number" ? r.hours : Number(r.hours);
      extra.set(r.date.slice(0, 10), {
        hours: Number.isFinite(h) ? h : null,
        note: typeof r.note === "string" ? r.note.trim() : "",
      });
    }
  }
  return normaliseEntries(entries, periodStart, periodEnd).map((d) => {
    const x = extra.get(d.date);
    const hours = x?.hours ?? (d.status === "Present" ? DEFAULT_DAY_HOURS : 0);
    return { ...d, hours: d.status === "Present" ? hours : 0, note: x?.note ?? "" };
  });
}

export type WeekTally = {
  /** Monday of the week, YYYY-MM-DD (may fall before the period). */
  weekOf: string;
  days: DayDetail[];
  present: number;
  absent: number;
  off: number;
  unclaimed: number;
  hours: number;
};

/** The period cut into Monday-to-Sunday weeks, with counts and hours for each. */
export function weeklyTallies(days: DayDetail[]): WeekTally[] {
  const weeks = new Map<string, WeekTally>();
  for (const d of days) {
    const t = new Date(`${d.date}T00:00:00Z`);
    const back = (t.getUTCDay() + 6) % 7; // Monday = 0
    t.setUTCDate(t.getUTCDate() - back);
    const weekOf = t.toISOString().slice(0, 10);
    const w = weeks.get(weekOf) ?? { weekOf, days: [], present: 0, absent: 0, off: 0, unclaimed: 0, hours: 0 };
    w.days.push(d);
    if (d.status === "Present") w.present += 1;
    else if (d.status === "Absent") w.absent += 1;
    else if (d.status === "Fixed off" || d.status === "Holiday" || d.status === "Leave") w.off += 1;
    else w.unclaimed += 1;
    w.hours += d.hours;
    weeks.set(weekOf, w);
  }
  return [...weeks.values()].sort((a, b) => a.weekOf.localeCompare(b.weekOf));
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
 * The parts of `period` no sheet in `taken` covers, earliest first.
 *
 * INW-26: legacy opened sheets by calendar month (1 Oct to 31 Oct) while
 * new-app periods follow the joining date (18 Sep to 17 Oct). A legacy sheet
 * overlaps two new periods, and treating each overlapped period as taken
 * left 18-30 Sep and 1-17 Nov with no sheet that could ever hold them. The
 * uncovered parts are what can still be opened.
 */
export function uncoveredParts(period: Period, taken: Period[]): Period[] {
  let parts: Period[] = [period];
  for (const t of taken) {
    const next: Period[] = [];
    for (const p of parts) {
      if (t.end < p.start || t.start > p.end) {
        next.push(p);
        continue;
      }
      if (t.start > p.start) next.push({ start: p.start, end: addDaysIso(t.start, -1) });
      if (t.end < p.end) next.push({ start: addDaysIso(t.end, 1), end: p.end });
    }
    parts = next;
  }
  return parts.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The period a new timesheet covers. With `month` ("YYYY-MM"), the
 * engagement period that starts in that month, else the one running on its
 * 1st. Without, the earliest period that has started. Days already on a
 * sheet in `taken` are cut out (see `uncoveredParts`), so a period that a
 * legacy calendar-month sheet half covers opens for the other half. With no
 * joining date on the offer it falls back to the calendar month. Errors when
 * nothing can be opened.
 */
export function timesheetPeriod(
  month: string | null,
  joiningIso: string | null,
  contractMonths: number,
  todayIso: string,
  taken: Period[] = [],
): Period | { error: string } {
  const joining = joiningIso && /^\d{4}-\d{2}-\d{2}/.test(joiningIso) ? joiningIso.slice(0, 10) : null;
  const firstStarted = (parts: Period[]) => parts.find((p) => p.start <= todayIso) ?? null;
  if (!joining) {
    const m = month ?? todayIso.slice(0, 7);
    const start = `${m}-01`;
    if (start > todayIso) return { error: "You can't log a month that hasn't started yet." };
    const open = firstStarted(uncoveredParts({ start, end: addDaysIso(addMonthsIso(start, 1), -1) }, taken));
    return open ?? { error: "That month already has a timesheet." };
  }
  if (joining > todayIso) return { error: "Your internship hasn't started yet." };

  const periods = engagementPeriods(joining, contractMonths);
  if (month) {
    const pick =
      periods.find((p) => p.start.slice(0, 7) === month) ??
      periods.find((p) => p.start <= `${month}-01` && p.end >= `${month}-01`);
    if (!pick) {
      return { error: month < joining.slice(0, 7) ? "That month is before your joining date." : "Your contract had ended by that month." };
    }
    if (pick.start > todayIso) return { error: "You can't log a period that hasn't started yet." };
    return firstStarted(uncoveredParts(pick, taken)) ?? { error: "That period already has a timesheet." };
  }
  const parts = periods.flatMap((p) => uncoveredParts(p, taken));
  const open = firstStarted(parts);
  if (open) return open;
  return parts.length === 0
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
