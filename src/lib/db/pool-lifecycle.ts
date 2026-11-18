/**
 * Pool lifecycle rules, kept apart from `pg` so tests run them without a database.
 *
 * Two serverless failure modes this covers:
 *  1. A frozen instance. Between requests Vercel freezes the process: timers stop, sockets sit idle, and the pooler closes
 *     them. On thaw the next query goes down a dead socket ("Connection terminated unexpectedly") or a new connect hangs
 *     ("Connection terminated due to connection timeout"). `holdUntilIdle` keeps the function alive (via the platform's
 *     waitUntil) for one idle period after the pool's last release, so the pool closes its own idle sockets before the freeze.
 *     This is what `attachDatabasePool` from @vercel/functions does; it is ~20 lines, so it is inlined rather than adding a package.
 *  2. A connect that never finishes. A failed attempt is cheap to repeat, so it is retried once (`withRetry`).
 */

/** Idle sockets are closed after this long. Short on Vercel so the hold in `holdUntilIdle` stays brief; 15 s on a long-lived server. */
export function idleTimeoutMs(env: Record<string, string | undefined>): number {
  return env.VERCEL ? 5_000 : 15_000;
}

/** Waiting for a connection (new socket or a free pooled one) longer than this is treated as hung, then retried once. */
export const CONNECT_TIMEOUT_MS = 5_000;

/** Client-side cap on one query: a dead socket fails the request instead of holding it until the platform timeout. */
export const QUERY_TIMEOUT_MS = 25_000;

const NEVER_SENT = /Connection terminated due to connection timeout|timeout exceeded when trying to connect/i;
const SOCKET_LOST = /Connection terminated unexpectedly|ECONNRESET|EPIPE|Client has encountered a connection error/i;

/** True for a plain read: its repeat cannot change anything. `select ... for update` and `with` (may hold an insert) are not. */
export function isPlainSelect(sql: string): boolean {
  return /^\s*select\b/i.test(sql) && !/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(sql);
}

/**
 * Safe to run the statement again on a fresh connection? A connect timeout means nothing was sent, so any statement is safe.
 * A lost socket may have died after the server ran the statement, so only a plain SELECT is repeated.
 */
export function retryable(err: unknown, sql: string | undefined): boolean {
  const e = err as { message?: string; code?: string } | null;
  const msg = `${e?.message ?? ""} ${e?.code ?? ""}`;
  if (NEVER_SENT.test(msg)) return true;
  return SOCKET_LOST.test(msg) && isPlainSelect(sql ?? "");
}

export const RETRY_DELAY_MS = 150;

type QueryFn = (...args: unknown[]) => Promise<unknown>;
type ConnectFn = (...args: unknown[]) => Promise<unknown>;
export type RetryablePool = { query: QueryFn; connect: ConnectFn };

function sqlOf(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  const t = (arg as { text?: unknown } | null)?.text;
  return typeof t === "string" ? t : undefined;
}

/**
 * Wraps `pool.query` (promise form) and `pool.connect` (promise form) so one failed attempt is repeated once when `retryable`.
 * Callback forms are left alone: pg-pool's own `query` calls `connect` with a callback, so it is not retried twice.
 * Transactions (`connect` then BEGIN ... COMMIT) retry only the connect, never a statement inside the transaction.
 */
export function withRetry<P extends RetryablePool>(pool: P, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): P {
  const query = pool.query.bind(pool);
  const connect = pool.connect.bind(pool);
  pool.query = async (...args: unknown[]) => {
    if (typeof args[args.length - 1] === "function") return query(...args);
    try {
      return await query(...args);
    } catch (err) {
      if (!retryable(err, sqlOf(args[0]))) throw err;
      await wait(RETRY_DELAY_MS);
      return query(...args);
    }
  };
  pool.connect = async (...args: unknown[]) => {
    if (typeof args[0] === "function") return connect(...args);
    try {
      return await connect(...args);
    } catch (err) {
      if (!NEVER_SENT.test(`${(err as Error)?.message ?? ""}`)) throw err;
      await wait(RETRY_DELAY_MS);
      return connect(...args);
    }
  };
  return pool;
}

export type WaitUntil = (p: Promise<unknown>) => void;

/** The platform's request-scoped waitUntil, if this code runs inside a Vercel request (what @vercel/functions reads). */
export function vercelWaitUntil(g: Record<symbol, unknown> = globalThis as unknown as Record<symbol, unknown>): WaitUntil | undefined {
  const ctx = (g[Symbol.for("@vercel/request-context")] as { get?: () => { waitUntil?: WaitUntil } | undefined } | undefined)?.get?.();
  return ctx?.waitUntil ? ctx.waitUntil.bind(ctx) : undefined;
}

type Releasing = { on(event: "release", fn: () => void): unknown };

/**
 * After the pool's last release, keep the function alive for `idleMs + 100` so idle sockets are closed before a freeze.
 * One pending hold per pool: a later release replaces the earlier one. A no-op off Vercel (no waitUntil).
 */
export function holdUntilIdle(
  pool: Releasing,
  idleMs: number,
  getWaitUntil: () => WaitUntil | undefined = vercelWaitUntil,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): void {
  let pending: { timer: ReturnType<typeof setTimeout>; done: () => void } | null = null;
  pool.on("release", () => {
    const waitUntil = getWaitUntil();
    if (!waitUntil) return;
    if (pending) {
      timers.clear(pending.timer);
      pending.done();
    }
    let done!: () => void;
    const p = new Promise<void>((resolve) => (done = resolve));
    const timer = timers.set(() => {
      pending = null;
      done();
    }, idleMs + 100);
    pending = { timer, done };
    waitUntil(p);
  });
}
