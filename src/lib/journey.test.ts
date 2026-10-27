import { test } from "node:test";
import assert from "node:assert/strict";

import { activeEngagement, buildThread, deriveMoney, deriveStage, isAcceptedStatus, payoutState } from "./journey.ts";

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
