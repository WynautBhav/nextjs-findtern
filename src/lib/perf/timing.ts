import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request timing for the slow-page investigation (QA B-02..B-05, B-07, B-24, B-25, B-60).
 *
 * Off unless `PERF_LOG=1`: then every route wrapped in `perfScope` logs one JSON line (`{"perf":...}`) with its
 * query count, time spent in queries, time spent waiting for a pooled connection, how many new sockets it opened
 * and the slowest statement. Any single query or connection wait over `SLOW_MS` is also logged on its own, with or
 * without a scope, so a stall that no scope wraps still shows up. Statement text is cut to 80 characters and never
 * includes parameters.
 */

export const SLOW_MS = 1000;

export type PerfScope = {
  route: string;
  start: number;
  queries: number;
  queryMs: number;
  maxQueryMs: number;
  slowest: string;
  acquires: number;
  acquireMs: number;
  maxAcquireMs: number;
  newConns: number;
};

const store = new AsyncLocalStorage<PerfScope>();

export function perfEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PERF_LOG === "1";
}

export function newScope(route: string, now: number): PerfScope {
  return { route, start: now, queries: 0, queryMs: 0, maxQueryMs: 0, slowest: "", acquires: 0, acquireMs: 0, maxAcquireMs: 0, newConns: 0 };
}

/** The statement's first 80 characters on one line (parameters are separate in pg, so none leak). */
export function shortSql(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function recordQuery(s: PerfScope, ms: number, text: string | undefined): void {
  s.queries += 1;
  s.queryMs += ms;
  if (ms >= s.maxQueryMs) {
    s.maxQueryMs = ms;
    s.slowest = shortSql(text);
  }
}

export function recordAcquire(s: PerfScope, ms: number, openedNew: boolean): void {
  s.acquires += 1;
  s.acquireMs += ms;
  if (ms > s.maxAcquireMs) s.maxAcquireMs = ms;
  if (openedNew) s.newConns += 1;
}

/** The one line a finished scope logs. Whole milliseconds; `queryMs` sums overlapping queries, so it can exceed `totalMs`. */
export function perfLine(s: PerfScope, now: number): string {
  return JSON.stringify({
    perf: s.route,
    totalMs: Math.round(now - s.start),
    queries: s.queries,
    queryMs: Math.round(s.queryMs),
    maxQueryMs: Math.round(s.maxQueryMs),
    slowest: s.slowest,
    acquires: s.acquires,
    acquireMs: Math.round(s.acquireMs),
    maxAcquireMs: Math.round(s.maxAcquireMs),
    newConns: s.newConns,
  });
}

/** Run `fn` as one measured route. A plain pass-through unless PERF_LOG=1. */
export async function perfScope<T>(route: string, fn: () => Promise<T>): Promise<T> {
  if (!perfEnabled()) return fn();
  const scope = newScope(route, performance.now());
  try {
    return await store.run(scope, fn);
  } finally {
    console.log(perfLine(scope, performance.now()));
  }
}

type PoolLike = {
  query: (...args: unknown[]) => Promise<unknown>;
  connect: (...args: unknown[]) => Promise<unknown>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

function sqlText(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  const t = (arg as { text?: unknown } | null)?.text;
  return typeof t === "string" ? t : undefined;
}

/**
 * Time every `pool.query` and `pool.connect` (promise and callback forms). Call it last, after `withRetry`, so a
 * retried attempt counts in full. Does nothing unless PERF_LOG=1.
 */
export function instrumentPool(pool: PoolLike, env: Record<string, string | undefined> = process.env): void {
  if (!perfEnabled(env)) return;
  const query = pool.query.bind(pool);
  const connect = pool.connect.bind(pool);

  pool.query = async (...args: unknown[]) => {
    if (typeof args[args.length - 1] === "function") return query(...args); // pg-pool's own callback use
    const t0 = performance.now();
    try {
      return await query(...args);
    } finally {
      const ms = performance.now() - t0;
      const scope = store.getStore();
      if (scope) recordQuery(scope, ms, sqlText(args[0]));
      if (ms >= SLOW_MS) {
        console.log(JSON.stringify({ perfSlowQuery: Math.round(ms), sql: shortSql(sqlText(args[0])), pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } }));
      }
    }
  };

  const done = (t0: number, totalBefore: number, scope: PerfScope | undefined, failed: boolean) => {
    const ms = performance.now() - t0;
    if (scope) recordAcquire(scope, ms, pool.totalCount > totalBefore);
    if (ms >= SLOW_MS) {
      console.log(JSON.stringify({ perfSlowConnect: Math.round(ms), failed, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } }));
    }
  };

  pool.connect = (...args: unknown[]) => {
    const t0 = performance.now();
    const totalBefore = pool.totalCount;
    const scope = store.getStore();
    if (typeof args[0] === "function") {
      const cb = args[0] as (err: unknown, ...rest: unknown[]) => void;
      return connect((err: unknown, ...rest: unknown[]) => {
        done(t0, totalBefore, scope, Boolean(err));
        cb(err, ...rest);
      }) as Promise<unknown>;
    }
    return connect(...args).then(
      (client) => {
        done(t0, totalBefore, scope, false);
        return client;
      },
      (err) => {
        done(t0, totalBefore, scope, true);
        throw err;
      },
    );
  };
}
