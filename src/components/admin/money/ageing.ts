/** Age of a money item, for the ledger's age column. Pure, so the rules are tested. */

const DAY = 86_400_000;

export type Age = {
  /** Whole days between `from` and `now` (never negative). */
  days: number;
  /** "today", "1 d", "12 d", "3 mo". */
  label: string;
  /** ok under 3 d, aging 3 to 7 d, late beyond 7 d. */
  band: "ok" | "aging" | "late";
};

export function ageOf(from: Date | string | number | null | undefined, now: Date = new Date()): Age | null {
  if (from === null || from === undefined) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return ageFromDays(Math.floor((now.getTime() - t) / DAY));
}

/** The same age from a whole-day count (what the dashboard queues already carry). */
export function ageFromDays(rawDays: number | null | undefined): Age | null {
  if (rawDays === null || rawDays === undefined || !Number.isFinite(rawDays)) return null;
  const days = Math.max(0, Math.floor(rawDays));
  const label = days === 0 ? "today" : days < 60 ? `${days} d` : `${Math.floor(days / 30)} mo`;
  return { days, label, band: days > 7 ? "late" : days >= 3 ? "aging" : "ok" };
}
