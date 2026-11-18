/**
 * Pure pool and scheduler timing rules, kept apart from `pg` so tests can run them without a database.
 */

/** A pooler (Supavisor / pgbouncer) hands out server connections per transaction. */
export function isPoolerUrl(url: string): boolean {
  return /pooler\.supabase\.com|pgbouncer=true|:6543\b/i.test(url);
}

/**
 * Connections one app instance may hold. Serverless runs many instances at once, each with its own pool, so on
 * Vercel (or behind a transaction pooler) it stays small: 5. A long-running server (the KVM, local dev) keeps 10.
 * DATABASE_POOL_MAX overrides either, clamped to 1..20.
 */
export function poolMax(env: Record<string, string | undefined>, url: string): number {
  const forced = Number.parseInt(env.DATABASE_POOL_MAX ?? "", 10);
  if (Number.isFinite(forced) && forced >= 1) return Math.min(forced, 20);
  return env.VERCEL === "1" || isPoolerUrl(url) ? 5 : 10;
}

export type PoolStats = { totalCount: number; idleCount: number; waitingCount: number; max: number };

/** Busy = someone is already queued for a connection, or every connection is checked out. */
export function poolIsBusy(s: PoolStats): boolean {
  return s.waitingCount > 0 || (s.totalCount >= s.max && s.idleCount === 0);
}

/** First scheduler run: 45-90 s after boot, so a cold start's own request gets the pool to itself. */
export const SCHEDULER_MIN_DELAY_MS = 45_000;
export const SCHEDULER_JITTER_MS = 45_000;
export function schedulerStartDelayMs(random: () => number = Math.random): number {
  const x = random();
  const r = Number.isFinite(x) ? Math.min(Math.max(x, 0), 0.999999) : 0;
  return SCHEDULER_MIN_DELAY_MS + Math.floor(r * SCHEDULER_JITTER_MS);
}

/** A job that finds the pool busy waits this long and tries again, up to SKIP_RETRIES times, then waits for its next interval. */
export const SCHEDULER_BUSY_RETRY_MS = 30_000;
export const SCHEDULER_BUSY_RETRIES = 4;
