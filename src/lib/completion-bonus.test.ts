import assert from "node:assert/strict";
import { test } from "node:test";

import { grantCompletionBonus } from "./admin/ratings.ts";
import { stipendDues } from "./admin/stipend-dues.ts";
import { bonusBand, completionBonusPlan, isEngagementComplete } from "./completion-bonus.ts";

const plan = (score: number | null, over = {}) =>
  completionBonusPlan({ alreadyGranted: false, fullTime: false, ended: false, extra: score === null ? {} : { findternScore: score }, ...over });

test("band edges use the score before the +1", () => {
  assert.equal(plan(5.99)?.amountMinor, 200000);
  assert.equal(plan(6)?.amountMinor, 250000);
  assert.equal(plan(7.99)?.amountMinor, 250000);
  assert.equal(plan(8)?.amountMinor, 300000);
  assert.equal(plan(5.4)?.amountMinor, 200000); // becomes 6.4, still the low band
  assert.equal(bonusBand(null), "standard");
});

test("score +1 is capped at 10, bonus still paid", () => {
  assert.equal(grantCompletionBonus({ findternScore: 9.5 }).findternScore, 10);
  assert.equal(grantCompletionBonus({ findternScore: 10 }).findternScore, 10);
  assert.equal(plan(10)?.amountMinor, 300000);
});

test("a second approval, full-time or an early end pays nothing", () => {
  assert.equal(plan(7, { alreadyGranted: true }), null);
  assert.equal(plan(7, { fullTime: true }), null);
  assert.equal(plan(7, { ended: true }), null);
});

test("complete only when every engagement month is approved", () => {
  const m = [{ start: "2026-01-01", end: "2026-01-31" }, { start: "2026-02-01", end: "2026-02-28" }];
  assert.equal(isEngagementComplete("2026-01-01", 2, m), true);
  assert.equal(isEngagementComplete("2026-01-01", 2, m.slice(0, 1)), false);
  assert.equal(isEngagementComplete(null, 2, m), false);
});

test("a bonus never counts as a stipend month, linked or unlinked", () => {
  const proposals = [{ id: "p1", status: "hired", employerId: "e", currency: "INR", hiredAt: "2026-01-01", offerDetails: { monthlyAmount: 25000, duration: "2m", startDate: "2026-01-01" } }];
  const base = stipendDues(proposals, [], 7)[0];
  assert.ok(base.monthlyShareMinor > 0);
  const bonus = [
    { status: "paid", kind: "completion_bonus", raw: { proposalId: "p1" }, amountMinor: 250000, paidAt: "2026-02-01" },
    { status: "paid", kind: "completion_bonus", raw: {}, amountMinor: base.monthlyShareMinor, paidAt: "2026-02-01" },
    { status: "pending", kind: "completion_bonus", raw: { proposalId: "p1" }, amountMinor: 250000 },
  ];
  const after = stipendDues(proposals, bonus, 7)[0];
  assert.equal(after.paidMonths, 0);
  assert.equal(after.paidMinor, 0);
  assert.equal(after.pending, false);
  assert.equal(after.remainingMonths, base.remainingMonths);
});
