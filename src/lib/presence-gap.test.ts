import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { claimBeat, MIN_GAP_MS, BEAT_KEY } from "./presence-gap.ts";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("two tabs sharing one store: only one of two beats inside the gap goes out", () => {
  const shared = store();
  assert.equal(claimBeat(1_000_000, shared), true); // tab A
  assert.equal(claimBeat(1_000_500, shared), false); // tab B, half a second later
  assert.equal(claimBeat(1_000_000 + MIN_GAP_MS - 1, shared), false);
  assert.equal(claimBeat(1_000_000 + MIN_GAP_MS, shared), true);
});

test("six tabs opened at once send one beat; the server allows six a minute per person", () => {
  const shared = store();
  const sent = Array.from({ length: 6 }, () => claimBeat(5_000_000, shared)).filter(Boolean).length;
  assert.equal(sent, 1);
  assert.equal(shared.getItem(BEAT_KEY), "5000000");
});

test("storage that throws, or is missing, still beats (the 30 s interval alone keeps it under the limit)", () => {
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(claimBeat(1, broken), true);
  assert.equal(claimBeat(1, null), true);
});

test("a garbled stored value does not block beating", () => {
  const s = store();
  s.setItem(BEAT_KEY, "not-a-number");
  assert.equal(claimBeat(9_000_000, s), true);
});

test("the gap sits under the server's 6 a minute (10 s each) and under the 30 s interval", () => {
  assert.ok(MIN_GAP_MS >= 10_000 && MIN_GAP_MS < 30_000);
});

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the heartbeat hook goes through claimBeat", () => {
  assert.match(read("../hooks/use-presence.ts"), /claimBeat\(/);
});

test("csp-report: 300 a minute per address, and over the limit it answers 204, never 429", () => {
  const src = read("../app/api/csp-report/route.ts");
  assert.match(src, /new RateLimiter\(300,\s*60_000\)/);
  assert.doesNotMatch(src, /status:\s*429/);
  assert.match(src, /limiter\.take\([^)]*\)[^\n]*\)\s*return new NextResponse\(null, \{ status: 204 \}\)/);
});
