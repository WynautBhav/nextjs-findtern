import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FAST_TIMING,
  MIN_WALK_PX,
  NORMAL_TIMING,
  RETRY_MAX_MS,
  RETRY_MIN_MS,
  SCROLL_QUIET_MS,
  WALK_MAX_PX,
  blockedFor,
  earliestStart,
  nextDelayMs,
  parseFindyFlags,
  pickPlan,
  positions,
  walkDistance,
  walkMs,
  walkRoom,
  type FindyAct,
} from "./findy-walk.ts";

/** A fake rng that replays a fixed sequence, then repeats the last value. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};
const idle = { hidden: false, hovered: false, menuOpen: false, dialogOpen: false, lastScrollAt: 0, now: 100_000 };

test("random interval stays in 25-70 s and spreads across the range", () => {
  assert.equal(NORMAL_TIMING.minMs, 25_000);
  assert.equal(NORMAL_TIMING.maxMs, 70_000);
  assert.equal(NORMAL_TIMING.gapMs, 20_000);
  assert.equal(nextDelayMs(() => 0), 25_000);
  assert.equal(nextDelayMs(() => 0.999999), 70_000);
  assert.ok(nextDelayMs(() => 1) <= 70_000, "rng at exactly 1 is clamped");
  assert.ok(nextDelayMs(() => -1) >= 25_000, "negative rng is clamped");
  const mid = nextDelayMs(() => 0.5);
  assert.ok(mid > 25_000 && mid < 70_000);
  const seen = new Set([0.1, 0.3, 0.5, 0.7, 0.9].map((r) => nextDelayMs(() => r)));
  assert.equal(seen.size, 5, "the jitter is not a constant");
});

test("fast mode (dev flag) uses 3-6 s with a 2 s gap", () => {
  assert.equal(nextDelayMs(() => 0, FAST_TIMING), 3_000);
  assert.ok(nextDelayMs(() => 0.999999, FAST_TIMING) <= 6_000);
  assert.equal(FAST_TIMING.gapMs, 2_000);
});

test("never two runs within 20 s: the next start is pushed past the previous end + gap", () => {
  const g = NORMAL_TIMING.gapMs;
  assert.equal(earliestStart({ wantedAt: 30_000, lastEndAt: 20_000, gapMs: g }), 40_000);
  assert.equal(earliestStart({ wantedAt: 90_000, lastEndAt: 20_000, gapMs: g }), 90_000);
  assert.equal(earliestStart({ wantedAt: 5_000, lastEndAt: null, gapMs: g }), 5_000);
});

test("each blocking condition alone defers the run, with a 1-3 s retry", () => {
  assert.equal(blockedFor(idle, () => 0.5), null);
  const cases: [string, Partial<typeof idle>][] = [
    ["hidden", { hidden: true }],
    ["hovered", { hovered: true }],
    ["menu", { menuOpen: true }],
    ["dialog", { dialogOpen: true }],
    ["scroll", { lastScrollAt: 100_000 - 500 }],
  ];
  for (const [reason, patch] of cases) {
    const b = blockedFor({ ...idle, ...patch }, () => 0);
    assert.equal(b?.reason, reason);
    assert.equal(b?.retryMs, RETRY_MIN_MS);
    const hi = blockedFor({ ...idle, ...patch }, () => 0.999999);
    assert.ok(hi!.retryMs <= RETRY_MAX_MS && hi!.retryMs > RETRY_MIN_MS);
  }
  assert.equal(RETRY_MIN_MS, 1_000);
  assert.equal(RETRY_MAX_MS, 3_000);
});

test("scrolling blocks only until it has been quiet for the quiet window", () => {
  assert.equal(SCROLL_QUIET_MS, 1_500);
  assert.equal(blockedFor({ ...idle, lastScrollAt: idle.now - (SCROLL_QUIET_MS - 1) }, () => 0)?.reason, "scroll");
  assert.equal(blockedFor({ ...idle, lastScrollAt: idle.now - SCROLL_QUIET_MS }, () => 0), null);
});

test("hidden tab outranks every other reason", () => {
  assert.equal(blockedFor({ ...idle, hidden: true, hovered: true, menuOpen: true }, () => 0)?.reason, "hidden");
});

test("room: right is the gap to the next element beyond the step-out, left is the space left of the logo", () => {
  // 1440px desktop: logo at x=112, 180px wide, nav starts at 520.
  const r = walkRoom({ linkLeft: 112, linkWidth: 180, nextLeft: 520, k: 1 });
  // centre may reach nextLeft-24 from link left (=408); step-out centre is W+28 (=208): 200px of walking.
  assert.equal(r.right, 520 - 112 - 24 - (180 + 28));
  assert.ok(r.left > 0, "112px of space left of the logo is enough for a short left walk");
  // Phone: logo at x=16 leaves no room on the left.
  const m = walkRoom({ linkLeft: 16, linkWidth: 150, nextLeft: 340, k: 44 / 56 });
  assert.ok(m.left < 0);
  assert.ok(m.right > 0);
  // No next element measured: right room is unbounded.
  assert.equal(walkRoom({ linkLeft: 112, linkWidth: 180, nextLeft: null, k: 1 }).right, Infinity);
});

test("a tight gap (1024px: 79px clearance) yields a short walk, not a skip", () => {
  const room = walkRoom({ linkLeft: 32, linkWidth: 180, nextLeft: 32 + 180 + 79, k: 1 });
  assert.equal(room.right, 79 - 24 - 28);
  assert.equal(room.right, 27);
  const d = walkDistance(room.right, WALK_MAX_PX);
  assert.equal(d, 27);
  assert.ok(d >= MIN_WALK_PX);
});

test("walkDistance: below the minimum is 0, between is the room, above is capped at the max", () => {
  assert.equal(MIN_WALK_PX, 24);
  assert.equal(walkDistance(-10, 72), 0);
  assert.equal(walkDistance(MIN_WALK_PX - 1, 72), 0);
  assert.equal(walkDistance(MIN_WALK_PX, 72), MIN_WALK_PX);
  assert.equal(walkDistance(50, 72), 50);
  assert.equal(walkDistance(500, 72), 72);
  assert.equal(walkDistance(Infinity, 72), 72);
});

test("walk duration scales with distance at the clip's pace", () => {
  assert.equal(walkMs(72), 1700);
  assert.ok(walkMs(24) >= 500 && walkMs(24) < 1700);
  assert.ok(walkMs(144) > walkMs(72));
});

test("positions mirror for the left side", () => {
  const r = positions("right", 180, 1);
  assert.deepEqual(r, { hidden: 150, peek: 182, out: 208 });
  const l = positions("left", 180, 1);
  assert.deepEqual(l, { hidden: 30, peek: -2, out: -28 });
  const k = 44 / 56;
  assert.ok(positions("right", 150, k).out < 150 + 28);
});

const roomBoth = { right: 200, left: 56 };
const offered = (n: number, room = roomBoth, last: FindyAct | null = null, short = false) => {
  const out = new Set<FindyAct>();
  for (let i = 0; i < n; i++) {
    const p = pickPlan({ rng: () => i / n, room, last, k: 1, short });
    if (p) out.add(p.act);
  }
  return out;
};

test("with room on both sides every act is reachable across an rng sweep", () => {
  assert.deepEqual([...offered(200)].sort(), ["hop", "peek", "peekWave", "walkBoth", "walkLeft", "walkOut"]);
});

test("no left room: no walkLeft or walkBoth; no right room but left: only left-side plans", () => {
  const a = offered(200, { right: 200, left: -5 });
  assert.ok(!a.has("walkLeft") && !a.has("walkBoth") && a.has("walkOut"));
  for (let i = 0; i < 50; i++) {
    const p = pickPlan({ rng: () => i / 50, room: { right: -3, left: 60 }, last: null, k: 1, short: false })!;
    assert.ok(p.act !== "walkOut" && p.act !== "walkBoth");
    assert.equal(p.side, "left");
  }
});

test("short room: walks are replaced by peek/hop acts; nothing fits means no plan", () => {
  const a = offered(200, { right: 10, left: -5 });
  assert.deepEqual([...a].sort(), ["hop", "peek", "peekWave"]);
  assert.equal(pickPlan({ rng: () => 0.3, room: { right: -1, left: -1 }, last: null, k: 1, short: false }), null);
});

test("a plan never repeats the previous act while an alternative exists", () => {
  for (const last of ["peek", "peekWave", "walkOut", "walkLeft", "walkBoth", "hop"] as FindyAct[]) {
    for (let i = 0; i < 100; i++) {
      assert.notEqual(pickPlan({ rng: () => i / 100, room: roomBoth, last, k: 1, short: false })!.act, last);
    }
  }
  // Only one act possible: repeating it is allowed rather than doing nothing.
  const only = pickPlan({ rng: () => 0.5, room: { right: 0, left: -1 }, last: "hop", k: 1, short: true });
  assert.ok(only);
});

test("hover cameos only pick short acts (peek, peekWave, hop, walkOut)", () => {
  assert.deepEqual([...offered(200, roomBoth, null, true)].sort(), ["hop", "peek", "peekWave", "walkOut"]);
});

test("plans carry measured walk distances, capped by room and by WALK_MAX_PX * k", () => {
  const p = pickPlan({ rng: seq(0.99), room: { right: 500, left: 40 }, last: null, k: 1, short: false })!;
  assert.equal(p.right, WALK_MAX_PX);
  assert.equal(p.left, 40);
  const q = pickPlan({ rng: seq(0.99), room: { right: 500, left: 40 }, last: null, k: 0.5, short: false })!;
  assert.equal(q.right, WALK_MAX_PX * 0.5);
});

test("dev flags: ?findy=walk forces a run, schedule-fast speeds timers, localStorage can force too", () => {
  assert.deepEqual(parseFindyFlags("?findy=walk", null), { force: true, fast: false });
  assert.deepEqual(parseFindyFlags("?findy=schedule-fast", null), { force: false, fast: true });
  assert.deepEqual(parseFindyFlags("?a=1&findy=walk,schedule-fast", null), { force: true, fast: true });
  assert.deepEqual(parseFindyFlags("", "walk"), { force: true, fast: false });
  assert.deepEqual(parseFindyFlags("?findy=nope", null), { force: false, fast: false });
  assert.deepEqual(parseFindyFlags("", null), { force: false, fast: false });
});
