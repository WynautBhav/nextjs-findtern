/**
 * Pure helpers behind the rail's live queue badges, kept apart from the
 * database module so they can be unit tested without a connection.
 */

/**
 * Runs one count query. A failure, or anything that is not a finite whole
 * number, is `null`: "the count is unavailable" is never shown as 0.
 */
export async function settleCount(run: () => Promise<unknown>): Promise<number | null> {
  try {
    const n = Number(await run());
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  } catch {
    return null;
  }
}

/** The rail shows a badge only for a known, non-zero count. */
export function badgeFor(n: number | null | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Badge text: counts past 99 read "99+" so a pill never grows wide. */
export function formatBadge(n: number): string {
  return n > 99 ? "99+" : String(Math.trunc(n));
}
