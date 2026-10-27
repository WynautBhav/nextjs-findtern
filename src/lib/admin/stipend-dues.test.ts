import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addMonthsIso,
  cycleFor,
  employerSide,
  monthlyShareOf,
  nextFromCycle,
  payoutCapMinor,
  payoutRefusal,
  stipendDues,
} from "./stipend-dues.ts";
import { parseOffer } from "../offer.ts";

const hired = (id: string, offer: Record<string, unknown>) => ({ id, status: "hired", employerId: "e1", offerDetails: offer, currency: "INR" });

test("half the employer's monthly amount, next month after the paid ones", () => {
  const [d] = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "3m", startDate: "2026-01-31" })],
    [{ status: "paid", raw: { proposalId: "p1" } }, { status: "pending", raw: { proposalId: "other" } }],
    7.5,
  );
  assert.equal(d.monthlyShareMinor, 1_000_000);
  assert.equal(d.paidMonths, 1);
  assert.equal(d.remainingMonths, 2);
  assert.equal(d.remainingMinor, 2_000_000);
  assert.equal(d.nextDate, "2026-03-31");
  assert.equal(d.pending, false);
});

test("below score 6 the share is zero; full-time and unhired placements are left out", () => {
  const dues = stipendDues(
    [
      hired("p1", { monthlyAmount: 20000, duration: "2m", startDate: "2026-01-01" }),
      hired("ft", { fullTimeOffer: { annualCtc: 600000 } }),
      { ...hired("p2", { monthlyAmount: 1, duration: "1m" }), status: "accepted" },
    ],
    [],
    5,
  );
  assert.equal(dues.length, 1);
  assert.equal(dues[0].monthlyShareMinor, 0);
  assert.equal(dues[0].remainingMinor, 0);
});

test("fully paid placement has no next date", () => {
  const [d] = stipendDues([hired("p1", { monthlyAmount: 10000, duration: "1m", startDate: "2026-05-10" })], [{ status: "paid", raw: { proposalId: "p1" } }], 8);
  assert.equal(d.remainingMonths, 0);
  assert.equal(d.nextDate, null);
});

test("addMonthsIso clamps to month end", () => {
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2026-11-15", 2), "2027-01-15");
  assert.equal(addMonthsIso(null, 1), null);
});

test("owed counts unpaid months of a hire with no payout rows yet, and hiredAt counts as hired", async () => {
  const { stipendDues, owedMinor } = await import("./stipend-dues.ts");
  // QA repro: ₹32,000 a month, 1 month, score 9.1, hired via hiredAt, no payouts.
  const proposals = [
    {
      id: "p1",
      status: "accepted",
      hiredAt: new Date("2026-10-01"),
      employerId: "e1",
      offerDetails: { monthlyAmount: 32000, duration: "1m", startDate: "2026-10-01" },
      currency: "INR",
    },
  ];
  const dues = stipendDues(proposals, [], 9.1);
  assert.equal(dues.length, 1);
  assert.equal(owedMinor(dues, 0), 1_600_000);
  assert.equal(owedMinor(dues, 50_000), 1_650_000);
});

/* ── ADP-18 / ADM-20 / ADP-19 / ADP-29 / ADP-21 ───────────────────────── */

test("ADP-18: an unlinked paid payout counts when amount and month date match, once only", () => {
  const offer = { monthlyAmount: 20000, duration: "3m", startDate: "2026-01-31" };
  const unlinked = (date: string, amount = 1_000_000) => ({ status: "paid", raw: { scheduledFor: date }, amountMinor: amount, currency: "INR" });
  const dues = stipendDues(
    [hired("p1", offer), hired("p2", offer)],
    [
      unlinked("2026-02-28"), // clamped month 1
      unlinked("2026-03-03", 999_900), // wrong amount: ignored
      unlinked("2026-06-15"), // outside the placement's months
      { status: "pending", raw: {}, amountMinor: 1_000_000, currency: "INR" },
    ],
    8,
  );
  // The one matching payout counts for one placement, not both.
  assert.equal(dues[0].paidMonths + dues[1].paidMonths, 1);
  assert.equal(dues[0].paidMonths, 1);
  assert.equal(dues[0].paidMinor, 1_000_000);
  assert.equal(dues[0].nextDate, "2026-03-31");
});

test("ADP-18: legacy rolled-over month dates also match (31 Jan + 1 month = 3 Mar)", () => {
  const [d] = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "2m", startDate: "2026-01-31" })],
    [{ status: "paid", raw: {}, amountMinor: 1_000_000, currency: "INR", paidAt: "2026-03-03T10:00:00Z" }],
    7,
  );
  assert.equal(d.paidMonths, 1);
});

test("ADM-20: an offer with only totalPrice falls back to total / months", () => {
  const offer = parseOffer({ totalPrice: 30000, duration: "3m" }, "INR");
  assert.equal(monthlyShareOf(offer, 7), 500_000);
  assert.equal(monthlyShareOf(offer, 5), 0);
  const [d] = stipendDues([hired("p1", { totalPrice: 30000, duration: "3m", startDate: "2026-01-01" })], [], null);
  assert.equal(d.monthlyShareMinor, 500_000);
  assert.equal(d.remainingMinor, 1_500_000);
});

test("ADP-19: employer side from order notes (total, monthly, due months)", () => {
  const offer = parseOffer({ monthlyAmount: 20000, duration: "3m", startDate: "2026-01-01" }, "INR");
  const total = employerSide("p1", offer, [{ status: "paid", raw: { notes: { proposalIds: ["p1", "p2"], paymentMode: "total" } } }]);
  assert.equal(total.paidInFull, true);
  assert.equal(total.paidMonths, 3);
  assert.equal(total.dueMinor, 0);

  const monthly = employerSide("p1", offer, [
    { status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
    { status: "paid", raw: { order: { notes: { proposal_ids: '["p1"]', purpose: "employer_monthly_payment" } } } },
    { status: "created", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } },
    { status: "paid", raw: { notes: { proposalIds: ["p9"], paymentMode: "total", dueProposalIds: ["p1"] } } },
  ]);
  assert.equal(monthly.paidInFull, false);
  assert.equal(monthly.paidMonths, 3);
  assert.equal(monthly.dueMinor, 0);

  const one = employerSide("p1", offer, [{ status: "paid", raw: { notes: { proposalIds: "p1", paymentMode: "monthly" } } }]);
  assert.equal(one.paidMonths, 1);
  assert.equal(one.dueMinor, 4_000_000);
});

test("ADP-19: a stipend month the employer hasn't paid for is flagged", () => {
  const [d] = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "3m", startDate: "2026-01-01" })],
    [{ status: "paid", raw: { proposalId: "p1" }, amountMinor: 1_000_000, currency: "INR" }],
    8,
    [{ status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } }],
  );
  assert.equal(d.employer?.paidMonths, 1);
  assert.equal(d.aheadOfEmployer, true);
});

test("ADP-29: payout guard refuses ₹0 share, pending, nothing owed and overpayment", () => {
  const base = stipendDues([hired("p1", { monthlyAmount: 20000, duration: "2m", startDate: "2026-01-01" })], [], 8)[0];
  assert.equal(payoutCapMinor(base), 1_000_000);
  assert.equal(payoutRefusal(base, 1_000_000), null);
  assert.equal(payoutRefusal(base, 500_000), null);
  assert.match(payoutRefusal(base, 1_000_001) ?? "", /at most ₹10,000/);
  assert.match(payoutRefusal(base, 0) ?? "", /greater than zero/);
  assert.match(payoutRefusal(undefined, 100) ?? "", /hired placement/);

  const low = stipendDues([hired("p1", { monthlyAmount: 20000, duration: "2m" })], [], 5)[0];
  assert.match(payoutRefusal(low, 100) ?? "", /below 6/);

  const pending = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "2m" })],
    [{ id: "x", status: "pending", raw: { proposalId: "p1" } }],
    8,
  )[0];
  assert.equal(pending.pendingPayoutId, "x");
  assert.match(payoutRefusal(pending, 100) ?? "", /already pending/);

  const done = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "1m" })],
    [{ status: "paid", raw: { proposalId: "p1" }, amountMinor: 1_000_000 }],
    8,
  )[0];
  assert.match(payoutRefusal(done, 100) ?? "", /Nothing is left/);

  // A failed payout neither pays a month nor blocks a new one.
  const failed = stipendDues(
    [hired("p1", { monthlyAmount: 20000, duration: "1m" })],
    [{ status: "failed", raw: { proposalId: "p1" }, amountMinor: 1_000_000 }],
    8,
  )[0];
  assert.equal(payoutRefusal(failed, 1_000_000), null);
});

test("ADP-21 / DB-18: a saved schedule queues the next month like legacy", () => {
  const cycle = cycleFor(3, 1_000_000, "bank");
  assert.deepEqual(cycle, { remaining: 3, monthsStep: 1, amountMinor: 1_000_000, currency: "INR", method: "bank" });
  const next = nextFromCycle({ amountMinor: 700_000, currency: "INR", method: "bank", raw: { proposalId: "p1", scheduledFor: "2026-01-31", cycle } });
  assert.ok(next);
  assert.equal(next.amountMinor, 1_000_000);
  assert.equal(next.scheduledFor, "2026-02-28");
  assert.equal(next.cycle.remaining, 2);
  // Last month of a series, no schedule, no date.
  assert.equal(nextFromCycle({ amountMinor: 1, currency: "INR", method: "bank", raw: { scheduledFor: "2026-01-01", cycle: { remainingMonths: 1 } } }), null);
  assert.equal(nextFromCycle({ amountMinor: 1, currency: "INR", method: "bank", raw: { scheduledFor: "2026-01-01" } }), null);
  assert.equal(nextFromCycle({ amountMinor: 1, currency: "INR", method: "bank", raw: { cycle: { remaining: 3 } } }), null);
  // Legacy key spellings and a two-month step.
  const legacy = nextFromCycle({ amountMinor: 500, currency: "INR", method: "upi", raw: { scheduled_for: "2026-03-15", cycle: { remaining: 2, monthsStep: 2 } } });
  assert.equal(legacy?.amountMinor, 500);
  assert.equal(legacy?.method, "upi");
  assert.equal(legacy?.scheduledFor, "2026-05-15");
});
