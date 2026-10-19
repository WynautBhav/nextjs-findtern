/**
 * Hiding a profile from employers is capped at 30 days at a time - the
 * guarantee only runs while employers can see you (Guaranteed Internship
 * Program terms). `extra_data.hiddenAt` is stamped when the intern switches
 * "open to work" off; the scheduler reminds them `HIDE_REMINDER_DAYS` before
 * the limit and then turns the profile back on.
 */
export const HIDE_LIMIT_DAYS = 30;
export const HIDE_REMINDER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a profile hidden at `hiddenAt` becomes visible again, or null. */
export function visibleAgainAt(hiddenAt: unknown): Date | null {
  if (typeof hiddenAt !== "string") return null;
  const t = Date.parse(hiddenAt);
  if (Number.isNaN(t)) return null;
  return new Date(t + HIDE_LIMIT_DAYS * DAY_MS);
}
