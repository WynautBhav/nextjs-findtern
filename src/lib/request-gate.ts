import { cache } from "react";

import { poolMax } from "./db/pool-config.ts";

/**
 * Caps how many database reads one page request has in flight. The pool holds 10 connections for every request
 * on the instance, and a page that starts 15+ independent reads at once (employer dashboard: layout 3, setup 2,
 * load ~10) queues behind itself and starves everyone else, which with a fail-closed session check means
 * other users get signed out for the request. At 230 ms per round trip each extra round costs a quarter second, so
 * the gate is 8: a 11-read dashboard load is two rounds, not three, and still leaves 2 of the pool's 10 connections for the
 * session checks of other requests. The gate only wraps read-only page loaders.
 *
 * `work` is started only when a slot is free, so pass a function (a Drizzle query is lazy and runs when awaited).
 * Do not call a gated function from inside another gated one: that holds a slot while waiting for a second.
 */
export const REQUEST_DB_CONCURRENCY = 8;

/** Always leave two pool connections free: 8 of 10 on the KVM, 3 of 5 on Vercel (see db/pool-config.ts). */
export function gateLimit(env: Record<string, string | undefined> = process.env): number {
  return Math.max(2, Math.min(REQUEST_DB_CONCURRENCY, poolMax(env, env.DATABASE_URL ?? "") - 2));
}

export type Gate = <T>(work: () => PromiseLike<T>) => Promise<T>;

export function makeGate(limit: number): Gate {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(work: () => PromiseLike<T>): Promise<T> {
    // A finishing task hands its slot straight to the next waiter, so `active` never dips below the limit
    // while someone is queued and a newcomer cannot slip past them.
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** One gate per request: React's per-request cache gives the layout and the page the same one. */
const gateForRequest = cache(() => makeGate(gateLimit()));

export function gated<T>(work: () => PromiseLike<T>): Promise<T> {
  return gateForRequest()(work);
}
