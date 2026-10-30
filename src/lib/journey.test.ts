import { test } from "node:test";
import assert from "node:assert/strict";

import { HIDDEN_COMPANY, activeEngagement, hoursByMonth, periodLabel, buildThread, deriveMoney, deriveProofs, deriveStage, isAcceptedStatus, payoutState, proofAsText, recordTotals } from "./journey.ts";

const payout = (id: string, status: string, amountMinor: number, scheduledFor?: string) => ({
  id,
  amountMinor,
  currency: "INR",
  status,
  referenceId: null,
  notes: null,
  paidAt: status === "paid" ? new Date("2026-10-05T00:00:00Z") : null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  raw: scheduledFor ? { scheduledFor } : {},
});

test("money keeps paid, pending and failed apart; only pending is incoming (INT-01/INW-04)", () => {
  const money = deriveMoney([
    payout("a", "paid", 800000),
    payout("b", "pending", 800000, "2026-11-01"),
    payout("c", "failed", 300000, "2026-10-15"),
    payout("d", "PAID", 100000),
    payout("e", "cancelled", 999),
  ]);
  assert.equal(money.paidMinor, 900000);
  assert.equal(money.incomingMinor, 800000);
  assert.equal(money.failedMinor, 300000);
  // The failed payout's date is not the next expected one.
  assert.equal(money.nextExpectedAt?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(payoutState(" Failed "), "failed");
  assert.equal(payoutState("scheduled"), null);
});

test("a failed payout is never shown as on its way in the thread", () => {
  const thread = buildThread({
    proposals: [],
    interviews: [],
    timesheets: [],
    payouts: [payout("c", "failed", 300000)],
    names: {},
  });
  assert.equal(thread.length, 1);
  assert.notEqual(thread[0].title, "Stipend on its way");
  assert.equal(thread[0].tone, "info");
});

const proposal = (id: string, status: string, hiredAt: Date | null = null) => ({
  id,
  employerId: "e1",
  internId: "i1",
  projectId: null,
  skills: null,
  interviewId: null,
  flowType: null,
  status,
  currency: "INR",
  offerDetails: { roleTitle: "Designer" },
  aiRatings: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  hiredAt,
});

test("an offer in legacy 'processing' counts as accepted for the journey (INW-21)", () => {
  assert.equal(isAcceptedStatus("processing"), true);
  assert.equal(isAcceptedStatus("sent"), false);
  assert.equal(deriveStage([proposal("p1", "processing")]), "working");
  assert.equal(activeEngagement([proposal("p1", "processing")])?.id, "p1");
  const thread = buildThread({ proposals: [proposal("p1", "processing")], interviews: [], timesheets: [], payouts: [], names: {} });
  // Not "Offer waiting on you", and nothing for the intern to do.
  assert.equal(thread[0].title, "You accepted: Designer");
  assert.equal(thread[0].tone, "waiting");
  assert.equal(deriveStage([proposal("p1", "sent")]), "seeking");
});

test("QA-004: Record has one score card, the current score, not a snapshot per proposal", () => {
  const stale = { ...proposal("p1", "hired", new Date("2026-09-01")), aiRatings: { overall: 8.2, coding: 8.5 } };
  const older = { ...proposal("p2", "rejected"), aiRatings: { overall: 7.9 } };
  const proofs = deriveProofs({
    proposals: [stale, older],
    interviews: [],
    timesheets: [],
    payouts: [],
    names: {},
    score: { overall: 8.8, ratings: { coding: 9.3 }, at: new Date("2026-08-20") },
  });
  const scores = proofs.filter((p) => p.title === "Findtern Score published");
  assert.equal(scores.length, 1);
  assert.deepEqual(scores[0].facts.slice(0, 2), [
    { label: "Overall", value: "8.8/10" },
    { label: "Coding", value: "9.3/10" },
  ]);
  assert.equal(scores[0].at.toISOString(), "2026-08-20T00:00:00.000Z");
  // No current score: no score card (the snapshots are not a fallback).
  assert.equal(deriveProofs({ proposals: [stale], interviews: [], timesheets: [], payouts: [], names: {} }).filter((p) => p.kind === "assessment").length, 0);
});

test("QA-108: a hidden company reads as \"the company\" in the thread, never \"Hidden company\"", () => {
  const thread = buildThread({ proposals: [proposal("p1", "accepted")], interviews: [], timesheets: [], payouts: [], names: { e1: HIDDEN_COMPANY } });
  assert.equal(thread[0].detail, "Waiting for the company to complete the payment. Logging hours opens once they do.");
  const sent = buildThread({ proposals: [proposal("p1", "sent")], interviews: [], timesheets: [], payouts: [], names: { e1: HIDDEN_COMPANY } });
  assert.match(sent[0].detail ?? "", /^The company sent you an offer/);
  const named = buildThread({ proposals: [proposal("p1", "accepted")], interviews: [], timesheets: [], payouts: [], names: { e1: "Northwind Labs" } });
  assert.match(named[0].detail ?? "", /^Waiting for Northwind Labs to complete/);
});

test("periodLabel reads the stored end bound as its calendar day, not the next day in IST", () => {
  // Periods are stored start T00:00Z .. end T23:59:59.999Z; in IST the end is 05:29 the next day.
  const t = { periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-30T23:59:59.999Z") };
  assert.equal(periodLabel(t as Parameters<typeof periodLabel>[0]), "1 – 30 Nov 2026");
});

test("hoursByMonth buckets sheets by IST start month, splits by state and drops rejected and out-of-range", () => {
  const sheet = (start: string, status: string, hours: number[]) =>
    ({ periodStart: new Date(start), status, entries: hours.map((h) => ({ hours: h })) }) as unknown as Parameters<typeof hoursByMonth>[0][number];
  const months = hoursByMonth(
    [
      sheet("2026-10-01T00:00:00Z", "approved", [3, 2]),
      sheet("2026-09-30T20:00:00Z", "submitted", [4]), // 1 Oct 01:30 in IST
      sheet("2026-11-01T00:00:00Z", "draft", [6]),
      sheet("2026-08-01T00:00:00Z", "rejected", [9]),
      sheet("2025-01-01T00:00:00Z", "approved", [9]),
    ],
    new Date("2026-11-15T00:00:00Z"),
    3,
  );
  assert.deepEqual(months.map((m) => m.key), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(months.map((m) => [m.approved, m.sent, m.draft]), [[0, 0, 0], [5, 4, 0], [0, 0, 6]]);
});

test("hoursByMonth runs on to a later draft month so next month's sheet is not dropped", () => {
  const sheet = { periodStart: new Date("2026-11-01T00:00:00Z"), status: "draft", entries: [{ hours: 2 }] } as unknown as Parameters<typeof hoursByMonth>[0][number];
  const months = hoursByMonth([sheet], new Date("2026-10-29T00:00:00Z"), 2);
  assert.deepEqual(months.map((m) => [m.key, m.draft]), [["2026-10", 0], ["2026-11", 2]]);
});

test("hoursByMonth starts at the joining month, not six months back", () => {
  const sheet = { periodStart: new Date("2026-10-11T00:00:00Z"), status: "approved", entries: [{ hours: 5 }] } as unknown as Parameters<typeof hoursByMonth>[0][number];
  const months = hoursByMonth([sheet], new Date("2026-11-20T00:00:00Z"), 6, new Date("2026-10-11T00:00:00Z"));
  assert.deepEqual(months.map((m) => [m.key, m.approved]), [["2026-10", 5], ["2026-11", 0]]);
});

test("record totals add numbers, not display strings, and never add across currencies", () => {
  const sheet = (id: string, hours: number[]) =>
    ({ id, proposalId: "p1", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), status: "approved", entries: hours.map((h) => ({ hours: h })), submittedAt: null, approvedAt: new Date("2026-10-03"), rejectedAt: null, managerNote: null, internNote: null, createdAt: new Date("2026-09-01") });
  const proofs = deriveProofs({
    proposals: [proposal("p1", "hired", new Date("2026-09-08"))],
    interviews: [],
    timesheets: [sheet("t1", [2, 3]), sheet("t2", [8, 8, 8]), { ...sheet("t3", [40]), approvedAt: null }],
    payouts: [payout("a", "paid", 2500000), payout("b", "paid", 50), { ...payout("c", "paid", 12000), currency: "USD" }, payout("d", "pending", 900000)],
    names: {},
  });
  const totals = recordTotals(proofs);
  assert.equal(totals.items, proofs.length);
  assert.equal(totals.items, 6); // offer + 2 approved sheets + 3 paid payouts
  assert.equal(totals.hours, 29);
  assert.deepEqual(totals.paid, [{ currency: "INR", minor: 2500050 }, { currency: "USD", minor: 12000 }]);
  // The export makes no claim of a public verify page (it needs a login).
  assert.ok(!proofs.some((p) => proofAsText(p, "X").includes("findtern.in/record")));
});
