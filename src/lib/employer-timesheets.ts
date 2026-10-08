/**
 * Timesheet entry normalisation.
 *
 * `timesheets.entries` is a jsonb bag the intern form writes, and the legacy
 * shapes in the wild are inconsistent: dates arrive as a full ISO timestamp in
 * some rows and a bare `YYYY-MM-DD` in others, and `status` is free text that
 * the form constrains to four values but a migration never did.
 *
 * Pure functions, no React and no database, so `node --test src/lib/**` can
 * cover them (see the `test` script in package.json).
 */

/** The four values the intern form writes into each `entries` row. */
export const DAY_STATUSES = ["Present", "Absent", "Fixed off", "Holiday"] as const;

export type DayStatus = (typeof DAY_STATUSES)[number];

export type DayEntry = { date: string; status: string };

export function formatPeriod(start: Date | null, end: Date | null): string {
  const fmt = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatDay(value: Date | null): string {
  if (!value) return "—";
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
 * `status` is passed through verbatim — `countStatuses` is what tallies it, so
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
