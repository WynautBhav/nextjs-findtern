import { test } from "node:test";
import assert from "node:assert/strict";

import { ONLINE_ACTIVE_MS, ONLINE_SEEN_MS, presenceLabel } from "./presence.ts";

const now = new Date("2026-11-06T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const row = (seenMs: number, activeMs: number | null, hidden = false) => ({
  lastSeenAt: ago(seenMs),
  lastActiveAt: activeMs === null ? null : ago(activeMs),
  hidden,
});
const H = 60 * 60 * 1000;
const D = 24 * H;

test("online needs a beat within 75 s AND activity within 2 min", () => {
  assert.equal(presenceLabel(row(0, 0), now), "Online now");
  assert.equal(presenceLabel(row(ONLINE_SEEN_MS - 1, ONLINE_ACTIVE_MS - 1), now), "Online now");
  // Tab hidden (no beats) for 75 s: no longer online, still active today.
  assert.equal(presenceLabel(row(ONLINE_SEEN_MS, 0), now), "Active today");
  // Tab visible but idle for 2 min: not online.
  assert.equal(presenceLabel(row(0, ONLINE_ACTIVE_MS), now), "Active today");
});

test("today < 24 h, this week < 7 d, older is no label", () => {
  assert.equal(presenceLabel(row(D, D - 1), now), "Active today");
  assert.equal(presenceLabel(row(D, D), now), "Active this week");
  assert.equal(presenceLabel(row(7 * D, 7 * D - 1), now), "Active this week");
  assert.equal(presenceLabel(row(7 * D, 7 * D), now), null);
});

test("hidden, never active, or no row: no label", () => {
  assert.equal(presenceLabel(row(0, 0, true), now), null);
  assert.equal(presenceLabel(row(0, null), now), null);
  assert.equal(presenceLabel(null, now), null);
});

test("a label is never a time", () => {
  for (const ms of [0, 5 * 60 * 1000, 3 * H, 2 * D]) {
    const label = presenceLabel(row(ms, ms), now);
    assert.ok(label === null || !/\d/.test(label), `label "${label}" contains a number`);
  }
});
