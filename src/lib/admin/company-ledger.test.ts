import assert from "node:assert/strict";
import { test } from "node:test";

import { companyLedger } from "./company-ledger.ts";

const proposals = [
  // accepted, not paid: ₹10,000 × 2 + ₹5,000 fee due by the start date
  { id: "a", internId: "i1", projectId: "p1", status: "accepted", currency: "INR", offerDetails: { monthlyAmount: 10000, duration: "2m", startDate: "2026-12-01" } },
  // monthly plan, 1 of 3 months paid ($100 + $50 fee), 2 × $100 left
  { id: "m", internId: "i2", projectId: "p1", status: "hired", currency: "USD", offerDetails: { monthlyAmount: 100, duration: "3m", startDate: "2026-09-15" } },
  // paid upfront with a promo: total is what was paid, nothing due
  { id: "u", internId: "i3", projectId: "p2", status: "hired", currency: "INR", offerDetails: { monthlyAmount: 5000, duration: "1m" } },
  // full-time, hired with no order on record (legacy / free)
  { id: "f", internId: "i4", projectId: null, status: "hired", currency: "INR", offerDetails: { fullTimeOffer: { annualCtc: 600000, jobTitle: "Dev" } } },
  { id: "x", internId: "i5", projectId: null, status: "rejected", currency: "INR", offerDetails: {} },
];

const payments = [
  { id: "pay1", status: "paid", amountMinor: 15_000, currency: "USD", paidAt: "2026-09-10", createdAt: null, raw: { notes: { paymentMode: "monthly", proposalIds: ["m"] } } },
  { id: "pay2", status: "paid", amountMinor: 900_000, currency: "INR", paidAt: "2026-08-01", createdAt: null, raw: { notes: { paymentMode: "total", proposalIds: ["u"] } } },
  { id: "pay3", status: "created", amountMinor: 1, currency: "INR", paidAt: null, createdAt: "2026-10-01", raw: { notes: { proposalIds: ["a", "f"] } } },
];

test("per-hire dues: unpaid, monthly, upfront and settled hires", () => {
  const l = companyLedger(proposals, payments, () => 7);
  const by = new Map(l.hires.map((h) => [h.proposalId, h]));
  assert.equal(l.hires.length, 4);

  assert.deepEqual(
    [by.get("a")!.plan, by.get("a")!.dueMinor, by.get("a")!.paidMinor, by.get("a")!.nextDueDate],
    ["unpaid", 2_500_000, 0, "2026-12-01"],
  );
  const m = by.get("m")!;
  assert.deepEqual([m.plan, m.paidMinor, m.dueMinor, m.totalMinor, m.monthsPaid, m.monthsLeft, m.nextDueDate], ["monthly", 15_000, 20_000, 35_000, 1, 2, "2026-10-15"]);
  const u = by.get("u")!;
  assert.deepEqual([u.plan, u.paidMinor, u.dueMinor, u.totalMinor], ["upfront", 900_000, 0, 900_000]);
  const f = by.get("f")!;
  assert.deepEqual([f.fullTime, f.ctcMinor, f.dueMinor], [true, 60_000_000, 0]);

  // INR totals: paid $150 (₹15,000) + ₹9,000; due ₹25,000 + $200 (₹20,000)
  assert.deepEqual(l.totals, { paidInrMinor: 2_400_000, remainingInrMinor: 4_500_000, billedInrMinor: 6_900_000 });
});

test("payment rows name their proposals, type and mode", () => {
  const l = companyLedger(proposals, payments, () => 7);
  assert.deepEqual(l.payments.get("pay1"), { paymentId: "pay1", proposalIds: ["m"], type: "Internship", mode: "Monthly" });
  assert.equal(l.payments.get("pay3")!.type, "Mixed");
  assert.equal(l.payments.get("pay2")!.mode, "Upfront");
});

test("one order for two hires is split by what each line cost", () => {
  const two = [
    { id: "a", internId: "i1", projectId: null, status: "hired", currency: "INR", offerDetails: { monthlyAmount: 10000, duration: "1m" } },
    { id: "b", internId: "i2", projectId: null, status: "hired", currency: "INR", offerDetails: { monthlyAmount: 20000, duration: "1m" } },
  ];
  const pay = [{ id: "p", status: "paid", amountMinor: 4_000_000, currency: "INR", paidAt: "2026-01-01", createdAt: null, raw: { notes: { paymentMode: "total", proposalIds: ["a", "b"] } } }];
  const l = companyLedger(two, pay, () => 7);
  // weights ₹15,000 and ₹25,000
  assert.deepEqual(l.hires.map((h) => h.paidMinor), [1_500_000, 2_500_000]);
});
