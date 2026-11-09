import { test } from "node:test";
import assert from "node:assert/strict";

import { planTakedown, takedownBlock, TAKEDOWN_BLOCKS } from "./takedown.ts";

const NOW = new Date("2026-11-08T10:00:00Z");
const up = { takenDownAt: null };
const down = { takenDownAt: new Date("2026-11-01T00:00:00Z") };

test("takedown stamps time, admin and trimmed reason", () => {
  const p = planTakedown({ project: up, action: "takedown", adminId: "a1", reason: "  spam  ", now: NOW });
  assert.deepEqual(p, { ok: true, noop: false, set: { takenDownAt: NOW, takenDownBy: "a1", takenDownReason: "spam" } });
});

test("takedown needs a reason, even for an already-down listing", () => {
  for (const reason of [undefined, null, "", "   "]) {
    const p = planTakedown({ project: up, action: "takedown", adminId: "a1", reason });
    assert.equal(p.ok, false);
  }
  assert.equal(planTakedown({ project: down, action: "takedown", adminId: "a1", reason: " " }).ok, false);
});

test("taking down an already-down listing is a no-op", () => {
  assert.deepEqual(planTakedown({ project: down, action: "takedown", adminId: "a1", reason: "again" }), { ok: true, noop: true });
});

test("restore clears all three fields; restoring a live listing is a no-op", () => {
  assert.deepEqual(planTakedown({ project: down, action: "restore", adminId: "a1" }), {
    ok: true,
    noop: false,
    set: { takenDownAt: null, takenDownBy: null, takenDownReason: null },
  });
  assert.deepEqual(planTakedown({ project: up, action: "restore", adminId: "a1" }), { ok: true, noop: true });
});

test("reason is capped at 500 characters", () => {
  const p = planTakedown({ project: up, action: "takedown", adminId: "a1", reason: "x".repeat(900), now: NOW });
  assert.ok(p.ok && !p.noop && p.set.takenDownReason?.length === 500);
});

test("takedownBlock refuses for a taken-down listing, per action, and passes a live or missing one", () => {
  for (const action of ["accept", "pay", "schedule"] as const) {
    assert.equal(takedownBlock(down, action), TAKEDOWN_BLOCKS[action]);
    assert.equal(takedownBlock({ takenDownAt: "2026-11-01T00:00:00Z" }, action), TAKEDOWN_BLOCKS[action], "string timestamps count too");
    assert.equal(takedownBlock(up, action), null);
    assert.equal(takedownBlock(null, action), null, "no project row: nothing to block on");
    assert.equal(takedownBlock(undefined, action), null);
  }
  assert.match(TAKEDOWN_BLOCKS.accept, /can still turn it down/);
});
