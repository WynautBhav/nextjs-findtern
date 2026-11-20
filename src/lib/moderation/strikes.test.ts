import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HOLD_EXPIRY_DAYS, cleanEvidence, holdCutoff, holdLapsed, nextForViolations, pendingWarningIds, planAction, standingOf, violationCount,
} from "./strikes.ts";

test("strike count -> action: 0 warns, 1 or more freezes", () => {
  assert.equal(nextForViolations(0), "warn");
  assert.equal(nextForViolations(1), "freeze");
  assert.equal(nextForViolations(5), "freeze");
});

test("only warnings and freezes count; an unfreeze is not a violation and strikes never expire", () => {
  const h = [{ kind: "warning" }, { kind: "freeze" }, { kind: "unfreeze" }, { kind: "revoked" }];
  assert.equal(violationCount(h), 2);
  assert.equal(violationCount([{ kind: "warning", createdAt: "2000-01-01" }]), 1, "an old strike still counts");
});

test("first confirmed violation warns, second freezes", () => {
  assert.deepEqual(planAction({ violations: 0, frozen: false }, { action: "violation", expectedViolations: 0 }), { effect: "warn" });
  assert.deepEqual(planAction({ violations: 1, frozen: false }, { action: "violation", expectedViolations: 1 }), { effect: "freeze" });
});

test("a violation after an unfreeze freezes again (strikes never expire)", () => {
  const h = [{ kind: "warning" }, { kind: "freeze" }, { kind: "unfreeze" }];
  const s = standingOf(h, false);
  assert.equal(s.violations, 2);
  assert.equal(s.next, "freeze");
});

test("direct freeze works from a clean account (severe case) and counts as a violation", () => {
  assert.deepEqual(planAction({ violations: 0, frozen: false }, { action: "freeze", expectedViolations: 0 }), { effect: "freeze" });
  assert.equal(violationCount([{ kind: "freeze" }]), 1);
});

test("a double click is idempotent: a stale count or an already-frozen account changes nothing", () => {
  assert.deepEqual(planAction({ violations: 1, frozen: false }, { action: "violation", expectedViolations: 0 }), { effect: "none", why: "stale" });
  assert.deepEqual(planAction({ violations: 2, frozen: true }, { action: "violation", expectedViolations: 2 }), { effect: "none", why: "already_frozen" });
  assert.deepEqual(planAction({ violations: 2, frozen: true }, { action: "freeze", expectedViolations: 2 }), { effect: "none", why: "already_frozen" });
});

test("unfreeze only does something to a frozen account, and twice is a no-op", () => {
  assert.deepEqual(planAction({ violations: 2, frozen: true }, { action: "unfreeze", expectedViolations: 0 }), { effect: "unfreeze" });
  assert.deepEqual(planAction({ violations: 2, frozen: false }, { action: "unfreeze", expectedViolations: 0 }), { effect: "none", why: "not_frozen" });
});

test("acknowledge flow: a warning is pending until acknowledgedAt is set", () => {
  const h = [{ id: "a", kind: "warning", acknowledgedAt: null }, { id: "b", kind: "warning", acknowledgedAt: "2026-01-01" }, { id: "c", kind: "freeze" }];
  assert.deepEqual(pendingWarningIds(h), ["a"]);
  assert.equal(standingOf(h, false).pendingWarning, true);
  assert.equal(standingOf([{ id: "b", kind: "warning", acknowledgedAt: "2026-01-01" }], false).pendingWarning, false);
});

test("the evidence note is required, trimmed and capped", () => {
  assert.equal(cleanEvidence("  ").ok, false);
  assert.equal(cleanEvidence(undefined).ok, false);
  assert.equal(cleanEvidence("x".repeat(2001)).ok, false);
  assert.deepEqual(cleanEvidence("  shared a phone number  "), { ok: true, note: "shared a phone number" });
});

test("a hold lapses after 14 days", () => {
  const frozenAt = new Date("2026-11-01T00:00:00Z");
  assert.equal(HOLD_EXPIRY_DAYS, 14);
  assert.equal(holdLapsed(frozenAt, new Date("2026-11-14T23:59:00Z")), false);
  assert.equal(holdLapsed(frozenAt, new Date("2026-11-15T00:00:00Z")), true);
  assert.equal(holdLapsed(null), false);
  assert.equal(holdCutoff(new Date("2026-11-15T00:00:00Z")).toISOString(), "2026-11-01T00:00:00.000Z");
});
