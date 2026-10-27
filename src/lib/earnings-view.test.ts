import { test } from "node:test";
import assert from "node:assert/strict";

import { earningsEngagements, earningsView } from "./earnings-view.ts";

test("a hired intern with no payouts yet sees the summary, not the empty state", () => {
  assert.equal(earningsView(0, true), "summary");
  assert.equal(earningsView(0, false), "empty");
  assert.equal(earningsView(2, false), "summary");
});

const base = {
  employerId: "e1",
  currency: "INR",
  createdAt: new Date("2026-09-01T00:00:00Z"),
};
const offer = (monthlyAmount: number, duration = "2m", extra: Record<string, unknown> = {}) => ({
  roleTitle: "Designer",
  monthlyAmount,
  duration,
  startDate: "2026-09-01",
  ...extra,
});
const payout = (id: string, status: string, amountMinor: number, raw: Record<string, unknown> = {}) => ({
  id,
  amountMinor,
  currency: "INR",
  status,
  referenceId: null,
  notes: null,
  paidAt: status === "paid" ? new Date("2026-10-05T00:00:00Z") : null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  raw,
});

test("one card per hired internship; accepted and processing offers earn nothing (INW-11/21)", () => {
  const cards = earningsEngagements(
    [
      { ...base, id: "p-hired", status: "hired", hiredAt: new Date("2026-09-02T00:00:00Z"), offerDetails: offer(16000) },
      { ...base, id: "p-second", employerId: "e2", status: "hired", hiredAt: new Date("2026-10-02T00:00:00Z"), offerDetails: offer(20000, "1m") },
      { ...base, id: "p-accepted", status: "accepted", hiredAt: null, offerDetails: offer(30000) },
      { ...base, id: "p-processing", status: "processing", hiredAt: null, offerDetails: offer(30000) },
      { ...base, id: "p-ft", status: "hired", hiredAt: new Date("2026-09-03T00:00:00Z"), offerDetails: offer(0, "1m", { fullTimeOffer: { jobTitle: "SDE" } }) },
    ],
    [],
    { e1: "Acme", e2: "Globex" },
    7,
  );
  assert.deepEqual(
    cards.map((c) => c.proposalId),
    ["p-second", "p-hired"],
  );
  const acme = cards.find((c) => c.proposalId === "p-hired")!;
  // Half the employer's ₹16,000, in paise; the whole two months still to come.
  assert.equal(acme.monthlyMinor, 800000);
  assert.equal(acme.remainingMinor, 1600000);
  assert.equal(acme.company, "Acme");
});

test("payouts split paid / pending / failed per placement; failed is never pending (INT-01)", () => {
  const proposals = [
    { ...base, id: "p1", status: "hired", hiredAt: new Date("2026-09-02T00:00:00Z"), offerDetails: offer(16000) },
    { ...base, id: "p2", status: "hired", hiredAt: new Date("2026-09-03T00:00:00Z"), offerDetails: offer(16000) },
  ];
  const [p2, p1] = earningsEngagements(
    proposals,
    [
      payout("a", "paid", 800000, { proposalId: "p1" }),
      payout("b", "pending", 800000, { proposalId: "p1", scheduledFor: "2026-11-01" }),
      payout("c", "failed", 800000, { proposalId: "p1" }),
      payout("d", "paid", 500000, { proposalId: "p2" }),
      // No placement on the row and two hires: belongs to neither card.
      payout("e", "paid", 100000),
    ],
    {},
    null,
  );
  assert.equal(p1.paidMinor, 800000);
  assert.equal(p1.pendingMinor, 800000);
  assert.equal(p1.failedMinor, 800000);
  assert.equal(p1.remainingMinor, 0);
  assert.equal(p1.nextPayoutAt?.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(p2.paidMinor, 500000);
  assert.equal(p2.pendingMinor, 0);
  assert.equal(p2.nextPayoutAt, null);
});

test("with a single hire, payouts recorded without a placement count towards it", () => {
  const [card] = earningsEngagements(
    [{ ...base, id: "p1", status: "hired", hiredAt: new Date("2026-09-02T00:00:00Z"), offerDetails: offer(16000) }],
    [payout("a", "paid", 800000)],
    {},
    null,
  );
  assert.equal(card.paidMinor, 800000);
});

test("a candidate scored below 6 is not eligible and has nothing to come", () => {
  const [card] = earningsEngagements(
    [{ ...base, id: "p1", status: "hired", hiredAt: new Date("2026-09-02T00:00:00Z"), offerDetails: offer(16000) }],
    [],
    {},
    4,
  );
  assert.equal(card.eligible, false);
  assert.equal(card.monthlyMinor, 0);
  assert.equal(card.remainingMinor, 0);
});
