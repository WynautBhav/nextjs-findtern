/**
 * In-memory half of the opportunistic sweep guard: at most one claim per `intervalMs` per server instance. The database half
 * (proposal-expiry-db.ts claimSweepWindow) stops a second instance inside the same window. Pure: the clock is injected.
 */
export function createSweepThrottle(intervalMs: number, nowMs: () => number = Date.now) {
  let last = Number.NEGATIVE_INFINITY;
  let before = last;
  return {
    /** True once per window; the caller that gets true runs the sweep. */
    tryClaim(): boolean {
      const t = nowMs();
      if (t - last < intervalMs) return false;
      before = last;
      last = t;
      return true;
    },
    /** Give the window back (the sweep did not run), so a later caller may try. */
    release(): void {
      last = before;
    },
  };
}
