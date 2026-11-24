// The pure half of "one drive at a time" (drive-overlap.ts), so node:test runs it without the database.

export type Window = { startsAt: Date; endsAt: Date; revokedAt?: Date | null };

/** A drive's real end: closed early, or its end date. */
export const windowEnd = (w: Window): Date => (w.revokedAt && w.revokedAt < w.endsAt ? w.revokedAt : w.endsAt);

/** Both drives are (or will be) open at the same moment, from `now` on. */
export function concurrent(a: Window, b: Window, now: number): boolean {
  const from = Math.max(a.startsAt.getTime(), b.startsAt.getTime(), now);
  const to = Math.min(windowEnd(a).getTime(), windowEnd(b).getTime());
  return from < to;
}
