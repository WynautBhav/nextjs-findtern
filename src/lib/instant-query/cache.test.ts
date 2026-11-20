import test from "node:test";
import assert from "node:assert/strict";
import { InstantCache, normaliseQuery, queryOf, getCache, invalidateQueries } from "./cache.ts";

function clock(start = 1000) {
  let t = start;
  return { now: () => t, tick: (ms: number) => void (t += ms) };
}

test("normaliseQuery sorts keys, drops ?, keeps repeated-key order and empties", () => {
  assert.equal(normaliseQuery("?b=2&a=1"), "a=1&b=2");
  assert.equal(normaliseQuery("a=1&b=2"), "a=1&b=2");
  assert.equal(normaliseQuery(new URLSearchParams({ b: "2", a: "1" })), "a=1&b=2");
  assert.equal(normaliseQuery("skill=z&skill=a&q="), "q=&skill=z&skill=a");
  assert.equal(normaliseQuery(""), "");
  assert.equal(normaliseQuery(null), "");
});

test("queryOf accepts hrefs, queries and drops the hash", () => {
  assert.equal(queryOf("/employer/candidates?page=2&a=1#top"), "a=1&page=2");
  assert.equal(queryOf("?page=2"), "page=2");
  assert.equal(queryOf("page=2"), "page=2");
  assert.equal(queryOf("/employer/candidates"), "");
});

test("LRU evicts the least recently used past max", () => {
  const c = new InstantCache<number>({ max: 3 });
  c.set("a", 1); c.set("b", 2); c.set("c", 3);
  c.get("a"); // a is now newest; b is oldest
  c.set("d", 4);
  assert.deepEqual(c.keys(), ["c", "a", "d"]);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.size, 3);
});

test("set on an existing key refreshes data, timestamp and recency without growing", () => {
  const k = clock();
  const c = new InstantCache<number>({ max: 2, staleMs: 100, now: k.now });
  c.set("a", 1); c.set("b", 2);
  k.tick(90);
  c.set("a", 10);
  assert.equal(c.size, 2);
  assert.deepEqual(c.keys(), ["b", "a"]);
  k.tick(50);
  assert.equal(c.get("a")?.fresh, true); // 50ms old
  assert.equal(c.get("b")?.fresh, false); // 140ms old
  assert.equal(c.get("a")?.data, 10);
});

test("peek does not change LRU order", () => {
  const c = new InstantCache<number>({ max: 2 });
  c.set("a", 1); c.set("b", 2);
  c.peek("a");
  c.set("c", 3);
  assert.equal(c.peek("a"), undefined); // a stayed oldest and went
});

test("stale rules: fresh below staleMs, stale at/after it, stale hit still returns data, per-read override", () => {
  const k = clock();
  const c = new InstantCache<string>({ staleMs: 1000, now: k.now });
  c.set("q", "v");
  k.tick(999);
  assert.equal(c.get("q")?.fresh, true);
  k.tick(1);
  const hit = c.get("q");
  assert.equal(hit?.fresh, false);
  assert.equal(hit?.data, "v");
  assert.equal(c.get("q", 5000)?.fresh, true);
  assert.equal(c.get("q", 0)?.fresh, false);
});

test("invalidate(prefix) drops matching keys only; invalidate() drops all", () => {
  const c = new InstantCache<number>();
  c.set("a=1", 1); c.set("a=1&b=2", 2); c.set("b=2", 3);
  assert.equal(c.invalidate("a=1"), 2);
  assert.deepEqual(c.keys(), ["b=2"]);
  c.set("x", 4);
  assert.equal(c.invalidate(), 2);
  assert.equal(c.size, 0);
});

test("max below 1 is clamped to 1", () => {
  const c = new InstantCache<number>({ max: 0 });
  c.set("a", 1); c.set("b", 2);
  assert.deepEqual(c.keys(), ["b"]);
});

test("SSR: getCache retains nothing on the server (no window)", () => {
  assert.equal(typeof window, "undefined");
  getCache<number>("/api/x").set("a", 1);
  assert.equal(getCache<number>("/api/x").size, 0);
  assert.doesNotThrow(() => invalidateQueries("/api/x"));
});
