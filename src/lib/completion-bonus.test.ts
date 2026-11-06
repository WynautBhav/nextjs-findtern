import assert from "node:assert/strict";
import { test } from "node:test";

import { grantCompletionBonus } from "./admin/ratings.ts";
import { stipendDues } from "./admin/stipend-dues.ts";
import { bonusBand, completionBonusPlan, isEngagementComplete, offerBonusMinor } from "./completion-bonus.ts";

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

test("no offer start date: months count from the hire day (IST), as billing-plan does", () => {
  const m = [{ start: "2026-01-01", end: "2026-01-31" }, { start: "2026-02-01", end: "2026-02-28" }];
  // 2025-12-31T20:00Z is 2026-01-01 01:30 IST, so month 1 starts on 1 Jan.
  const hired = new Date("2025-12-31T20:00:00Z");
  assert.equal(isEngagementComplete(null, 2, m, hired), true);
  assert.equal(isEngagementComplete(null, 2, m.slice(0, 1), hired), false);
  assert.equal(isEngagementComplete("", 2, m, "2026-01-01T09:00:00Z"), true);
  assert.equal(isEngagementComplete(null, 2, m, null), false);
  // An offer start date still wins over the hire day.
  assert.equal(isEngagementComplete("2026-03-01", 2, m, hired), false);
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

test("the offer shows the bonus by band, and none for full-time, unscored or below 6", () => {
  assert.equal(offerBonusMinor(7, { fullTime: false }), 250000);
  assert.equal(offerBonusMinor(6, { fullTime: false }), 250000);
  assert.equal(offerBonusMinor(9, { fullTime: false }), 300000);
  assert.equal(offerBonusMinor(9, { fullTime: true }), null);
  assert.equal(offerBonusMinor(null, { fullTime: false }), null);
  assert.equal(offerBonusMinor(5.5, { fullTime: false }), null);
});
