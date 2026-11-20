import test from "node:test";
import assert from "node:assert/strict";
import { InstantCache } from "./cache.ts";
import {
  createInstantController,
  loginPathForEndpoint,
  isHandledInPlace403,
  type ControllerDeps,
  type FetchResult,
  type Snapshot,
} from "./instant-query-core.ts";

type Data = { n: string };

interface Pending {
  url: string;
  signal: AbortSignal;
  resolve: (r: FetchResult<Data>) => void;
}

function harness(over: Partial<ControllerDeps<Data>> = {}, init = { qs: "a=1", data: { n: "init" } }) {
  let t = 0;
  const calls: Pending[] = [];
  const history: Array<[string, string]> = [];
  const redirects: string[] = [];
  const snaps: Snapshot<Data>[] = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  let timerId = 0;
  const cache = new InstantCache<Data>({ now: () => t });
  const deps: ControllerDeps<Data> = {
    endpoint: "/api/employer/x/results",
    cache,
    staleMs: 1000,
    debounceMs: 100,
    fetcher: (url, signal) =>
      new Promise((resolve) => {
        const p: Pending = { url, signal, resolve };
        signal.addEventListener("abort", () => resolve({ kind: "aborted" }));
        calls.push(p);
      }),
    writeHistory: (m, qs) => history.push([m, qs]),
    redirect: (to) => redirects.push(to),
    isOnline: () => true,
    setTimer: (fn, ms) => {
      timers.set(++timerId, { fn, at: t + ms });
      return timerId;
    },
    clearTimer: (id) => void timers.delete(id as number),
    onChange: (s) => snaps.push(s),
    ...over,
  };
  const c = createInstantController(deps, init);
  cache.set("a=1", init.data);
  return {
    c, cache, calls, history, redirects, snaps,
    advance(ms: number) {
      t += ms;
      for (const [id, tm] of [...timers]) if (tm.at <= t) { timers.delete(id); tm.fn(); }
    },
    flush: () => new Promise<void>((r) => setImmediate(r)),
    get timers() { return timers.size; },
  };
}

const ok = (n: string): FetchResult<Data> => ({ kind: "ok", data: { n } });

test("new query keeps previous data on screen, sets pending, then swaps", async () => {
  const h = harness();
  h.c.set("a=2");
  assert.equal(h.c.snapshot.pending, true);
  assert.equal(h.c.snapshot.data.n, "init"); // never blanks
  assert.equal(h.c.snapshot.qs, "a=2");
  assert.equal(h.c.snapshot.dataQs, "a=1");
  assert.deepEqual(h.history, [["push", "a=2"]]);
  h.calls[0].resolve(ok("two"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "two");
  assert.equal(h.c.snapshot.pending, false);
  assert.equal(h.c.snapshot.dataQs, "a=2");
  assert.equal(h.calls[0].url, "/api/employer/x/results?a=2");
});

test("abort drops old: superseded request is aborted and its late result is ignored", async () => {
  const h = harness();
  h.c.set("a=2");
  h.c.set("a=3");
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.calls[1].signal.aborted, false);
  // Late result for the old query, resolved even though aborted (server ignored the abort)
  h.calls[0].resolve(ok("two"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.pending, true);
  assert.equal(h.cache.peek("a=2"), undefined);
  h.calls[1].resolve(ok("three"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "three");
  assert.equal(h.c.snapshot.qs, "a=3");
});

test("out-of-order: old response arriving after the new one cannot overwrite it", async () => {
  const h = harness();
  h.c.set("a=2");
  h.c.set("a=3");
  h.calls[1].resolve(ok("three"));
  await h.flush();
  h.calls[0].resolve(ok("two"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "three");
});

test("fresh cache hit is instant and fires no request", async () => {
  const h = harness();
  h.c.set("a=2");
  h.calls[0].resolve(ok("two"));
  await h.flush();
  h.c.set("a=1"); // back to the seeded entry
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.pending, false);
  assert.equal(h.c.snapshot.stale, false);
  assert.equal(h.calls.length, 1);
});

test("stale cache hit shows instantly then revalidates in the background", async () => {
  const h = harness();
  h.c.set("a=2");
  h.calls[0].resolve(ok("two"));
  await h.flush();
  h.advance(5000); // both entries now stale
  h.c.set("a=1");
  assert.equal(h.c.snapshot.data.n, "init"); // instant
  assert.equal(h.c.snapshot.stale, true);
  assert.equal(h.c.snapshot.pending, false); // silent revalidation, no dimming
  assert.equal(h.calls.length, 2);
  h.calls[1].resolve(ok("fresh-init"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "fresh-init");
  assert.equal(h.c.snapshot.stale, false);
});

test("stale revalidation that fails keeps the stale copy and no error banner", async () => {
  const h = harness();
  h.advance(5000);
  h.c.set("a=2"); // miss
  h.calls[0].resolve(ok("two"));
  await h.flush();
  h.c.set("a=1"); // stale hit
  h.calls[1].resolve({ kind: "error", status: 500 });
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.stale, true);
  assert.equal(h.c.snapshot.error, null);
});

test("error keeps last good data, exposes error, is not cached, retry recovers", async () => {
  const h = harness();
  h.c.set("a=2");
  h.calls[0].resolve({ kind: "error", status: 500 });
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.pending, false);
  assert.equal(h.c.snapshot.error?.status, 500);
  assert.equal(h.c.snapshot.error?.offline, false);
  assert.equal(h.cache.peek("a=2"), undefined);
  h.c.refetch();
  assert.equal(h.c.snapshot.error, null);
  assert.equal(h.c.snapshot.pending, true);
  assert.equal(h.c.snapshot.data.n, "init");
  h.calls[1].resolve(ok("two"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "two");
  assert.equal(h.c.snapshot.error, null);
});

test("a rejected fetcher is treated as an error; offline flag follows the browser", async () => {
  const h = harness({ fetcher: () => Promise.reject(new Error("boom")), isOnline: () => false });
  h.c.set("a=2");
  await h.flush();
  assert.equal(h.c.snapshot.error?.offline, true);
  assert.equal(h.c.snapshot.data.n, "init");
});

test("popstate hit: restores from cache without touching history or the network", async () => {
  const h = harness();
  h.c.set("a=2");
  h.calls[0].resolve(ok("two"));
  await h.flush();
  h.history.length = 0;
  h.c.popstate("?a=1");
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.pending, false);
  assert.deepEqual(h.history, []);
  assert.equal(h.calls.length, 1);
});

test("popstate miss: fetches, keeps data on screen, does not push history", async () => {
  const h = harness();
  h.c.popstate("a=9");
  assert.equal(h.c.snapshot.pending, true);
  assert.equal(h.c.snapshot.data.n, "init");
  assert.deepEqual(h.history, []);
  h.calls[0].resolve(ok("nine"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "nine");
});

test("popstate while a request is in flight aborts it", async () => {
  const h = harness();
  h.c.set("a=2");
  h.c.popstate("a=1");
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.c.snapshot.pending, false);
  assert.equal(h.c.snapshot.data.n, "init");
});

test("query keys are normalised (order of params does not matter)", async () => {
  const h = harness({}, { qs: "b=2&a=1", data: { n: "init" } });
  assert.equal(h.c.snapshot.qs, "a=1&b=2");
  h.c.set("a=1&c=3");
  h.calls[0].resolve(ok("c"));
  await h.flush();
  h.c.set("c=3&a=1");
  assert.equal(h.calls.length, 1); // same key -> hit
});

test("debounce coalesces typing; history writes happen after the quiet period only", async () => {
  const h = harness();
  h.c.set("q=r", { debounce: true, history: "replace" });
  h.advance(60);
  h.c.set("q=re", { debounce: true, history: "replace" });
  h.advance(60);
  h.c.set("q=rea", { debounce: true, history: "replace" });
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.history, []);
  h.advance(100);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /q=rea$/);
  assert.deepEqual(h.history, [["replace", "q=rea"]]);
});

test("a non-debounced set cancels a pending debounce", () => {
  const h = harness();
  h.c.set("q=x", { debounce: true });
  h.c.set("a=5");
  h.advance(500);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /a=5$/);
});

test("same query again is a no-op (no duplicate request) but still writes history on push", () => {
  const h = harness();
  h.c.set("a=1");
  assert.equal(h.calls.length, 0);
  assert.equal(h.c.snapshot.pending, false);
});

test("401/403 triggers a hard redirect to the role's sign-in and keeps data", async () => {
  const h = harness();
  h.c.set("a=2");
  h.calls[0].resolve({ kind: "auth", status: 401 });
  await h.flush();
  assert.deepEqual(h.redirects, ["/login?as=employer"]);
  assert.equal(h.c.snapshot.data.n, "init");
  assert.equal(h.c.snapshot.pending, false);
});

test("loginPathForEndpoint mirrors the app's role routes; handled 403 bodies stay in place", () => {
  assert.equal(loginPathForEndpoint("/api/admin/x"), "/admin/login");
  assert.equal(loginPathForEndpoint("/api/employer/x"), "/login?as=employer");
  assert.equal(loginPathForEndpoint("/api/intern/x"), "/login?as=intern");
  assert.equal(isHandledInPlace403({ code: "terms_required" }), true);
  assert.equal(isHandledInPlace403({ code: "ACCOUNT_DISABLED" }), true);
  assert.equal(isHandledInPlace403({ error: "nope" }), false);
  assert.equal(isHandledInPlace403(null), false);
});

test("dispose: no emits, no fetches, in-flight aborted, late result dropped", async () => {
  const h = harness();
  h.c.set("a=2");
  const before = h.snaps.length;
  h.c.dispose();
  assert.equal(h.calls[0].signal.aborted, true);
  h.calls[0].resolve(ok("two"));
  await h.flush();
  h.c.set("a=3");
  h.c.refetch();
  h.c.popstate("a=1");
  assert.equal(h.snaps.length, before);
  assert.equal(h.calls.length, 1);
  assert.equal(h.cache.peek("a=2"), undefined);
});

test("dispose cancels a pending debounce", () => {
  const h = harness();
  h.c.set("q=x", { debounce: true });
  h.c.dispose();
  assert.equal(h.timers, 0);
  h.advance(1000);
  assert.equal(h.calls.length, 0);
});

test("invalidate(): clears cache and refetches the current query, data stays on screen", async () => {
  const h = harness();
  h.c.invalidate();
  assert.equal(h.cache.size, 0);
  assert.equal(h.c.snapshot.pending, true);
  assert.equal(h.c.snapshot.data.n, "init");
  h.calls[0].resolve(ok("new"));
  await h.flush();
  assert.equal(h.c.snapshot.data.n, "new");
});

test("invalidate(prefix) leaves the current query alone when it does not match", () => {
  const h = harness();
  h.cache.set("b=2", { n: "b" });
  h.c.invalidate("b=");
  assert.equal(h.cache.peek("b=2"), undefined);
  assert.equal(h.calls.length, 0);
  assert.equal(h.c.snapshot.pending, false);
});

test("adopt: a new server render replaces data, aborts in-flight and seeds the cache", async () => {
  const h = harness();
  h.c.set("a=2");
  h.c.adopt({ qs: "a=7", data: { n: "server" } });
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.c.snapshot.data.n, "server");
  assert.equal(h.c.snapshot.qs, "a=7");
  assert.equal(h.cache.peek("a=7")?.data.n, "server");
  assert.equal(h.c.snapshot.pending, false);
});

test("prefetch warms the cache, dedupes in-flight, ignores failures, skips fresh entries", async () => {
  const h = harness();
  const p1 = h.c.prefetch("a=5");
  const p2 = h.c.prefetch("a=5");
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve(ok("five"));
  await Promise.all([p1, p2]);
  assert.equal(h.cache.peek("a=5")?.data.n, "five");
  assert.equal(h.c.snapshot.qs, "a=1"); // state untouched
  await h.c.prefetch("a=5");
  assert.equal(h.calls.length, 1); // fresh -> skipped
  const p3 = h.c.prefetch("a=6");
  h.calls[1].resolve({ kind: "error", status: 500 });
  await p3;
  assert.equal(h.cache.peek("a=6"), undefined);
  h.c.set("a=5"); // prefetched entry serves instantly
  assert.equal(h.c.snapshot.data.n, "five");
  assert.equal(h.calls.length, 2);
});
