import assert from "node:assert/strict";
import { test } from "node:test";

import { computeReceivables, moneyRowFilter, narrowReceivables, type ReceivablesInput } from "./receivables.ts";

test("receivables and payables with INR totals", () => {
  const input: ReceivablesInput = {
    since: new Date("2026-01-01T00:00:00Z"),
    until: new Date("2027-01-01T00:00:00Z"),
    employerName: () => "Acme",
    internName: (id) => (id === "i1" ? "Asha K" : "Ravi M"),
    scoreOf: () => 7,
    activationFeeMinor: 249_900,
    proposals: [
      { id: "h", employerId: "e1", internId: "i1", status: "hired", currency: "INR", offerDetails: { monthlyAmount: 20000, duration: "3m", startDate: "2026-06-01" } },
      { id: "a", employerId: "e1", internId: "i2", status: "accepted", currency: "USD", offerDetails: { monthlyAmount: 100, duration: "1m", startDate: "2026-11-01" } },
    ],
    employerPayments: [
      { id: "o1", employerId: "e1", orderId: "ord", paymentId: "pay", status: "paid", amountMinor: 2_000_000, currency: "INR", paidAt: new Date("2026-05-20"), createdAt: null, raw: { notes: { paymentMode: "monthly", proposalIds: ["h"] } } },
      { id: "o2", employerId: "e1", orderId: "ord2", paymentId: null, status: "created", amountMinor: 1, currency: "INR", paidAt: null, createdAt: new Date("2026-05-21"), raw: {} },
    ],
    internPayments: [{ id: "f1", internId: "i1", paymentId: "rzp", status: "paid", amountMinor: 249_900, currency: "INR", paidAt: new Date("2026-02-01"), createdAt: null }],
    unpaidProfiles: [{ userId: "i2", createdAt: new Date("2026-03-01") }],
    payouts: [{ id: "po1", internId: "i1", status: "paid", amountMinor: 1_000_000, currency: "INR", referenceId: "UTR1", paidAt: new Date("2026-07-01"), createdAt: null, raw: { proposalId: "h" } }],
  };
  const r = computeReceivables(input, { receivables: "both", payables: "both" });
  assert.equal(r.totals.receivedMinor, 2_000_000 + 249_900);
  // accepted USD offer $100 × 1 month + $50 hiring fee → ₹15,000; two monthly instalments of ₹20,000 left
  assert.equal(r.totals.dueMinor, 1_500_000 + 4_000_000);
  assert.equal(r.totals.prospectMinor, 249_900);
  assert.equal(r.totals.paidOutMinor, 1_000_000);
  // two stipend months still owed at ₹10,000
  assert.equal(r.totals.owedMinor, 2_000_000);
  assert.deepEqual(
    r.payables.filter((p) => p.status === "upcoming").map((p) => p.date),
    ["2026-09-01", "2026-08-01"],
  );
  const companyOnly = computeReceivables(input, { receivables: "company", payables: "company" });
  assert.equal(companyOnly.receivables.every((x) => x.source === "company"), true);
  assert.equal(companyOnly.payables.length, 0);

  // Candidate / company / status filters, re-totalled (ADM-15).
  assert.equal(narrowReceivables(r, moneyRowFilter({})), r);
  const asha = narrowReceivables(r, moneyRowFilter({ candidate: "asha" }));
  assert.equal(asha.receivables.every((x) => x.candidateName === "Asha K"), true);
  assert.equal(asha.totals.receivedMinor, 249_900); // her fee; the order has no candidate
  assert.equal(asha.totals.paidOutMinor, 1_000_000);
  const due = narrowReceivables(r, moneyRowFilter({ status: "due", company: "ACME" }));
  assert.deepEqual(due.receivables.map((x) => x.status), ["due"]);
  assert.equal(due.totals.dueMinor, 1_500_000);
  assert.equal(moneyRowFilter({ status: "bogus" }).status, "");
});

test("timestamps are dated by India day against a month window", () => {
  const base = (over: Partial<ReceivablesInput>): ReceivablesInput => ({
    since: new Date("2026-06-30T18:30:00Z"), // 1 Jul 00:00 IST
    until: new Date("2026-07-31T18:30:00Z"), // 1 Aug 00:00 IST
    employerName: () => "Acme",
    internName: () => "Asha K",
    scoreOf: () => 7,
    activationFeeMinor: 249_900,
    proposals: [],
    employerPayments: [],
    internPayments: [],
    unpaidProfiles: [],
    payouts: [],
    ...over,
  });
  const payout = (id: string, at: string) => ({ id, internId: "i1", status: "paid", amountMinor: 100, currency: "INR", referenceId: null, paidAt: new Date(at), createdAt: null, raw: {} });
  const f = { receivables: "both", payables: "both" } as const;
  // 01:30 IST on 1 Jul is 20:00Z on 30 Jun: in July, not June.
  const inJuly = computeReceivables(base({ payouts: [payout("a", "2026-06-30T20:00:00Z")] }), f);
  assert.deepEqual(inJuly.payables.map((p) => p.date), ["2026-07-01"]);
  // 01:30 IST on 1 Aug is 20:00Z on 31 Jul: out of July.
  assert.equal(computeReceivables(base({ payouts: [payout("b", "2026-07-31T20:00:00Z")] }), f).payables.length, 0);
  // Unpaid profile created 01:30 IST on 1 Jul is in; on 1 Aug is out.
  assert.equal(computeReceivables(base({ unpaidProfiles: [{ userId: "i1", createdAt: new Date("2026-06-30T20:00:00Z") }] }), f).receivables[0].date, "2026-07-01");
  assert.equal(computeReceivables(base({ unpaidProfiles: [{ userId: "i1", createdAt: new Date("2026-07-31T20:00:00Z") }] }), f).receivables.length, 0);
  // Received is exact to the instant at both edges.
  const fee = (id: string, at: string) => ({ id, internId: "i1", paymentId: null, status: "paid", amountMinor: 100, currency: "INR", paidAt: new Date(at), createdAt: null });
  const got = (at: string) => computeReceivables(base({ internPayments: [fee("x", at)] }), f).receivables.length;
  assert.equal(got("2026-06-30T18:29:59Z"), 0);
  assert.equal(got("2026-06-30T18:30:00Z"), 1);
  assert.equal(got("2026-07-31T18:29:59Z"), 1);
  assert.equal(got("2026-07-31T18:30:00Z"), 0);
});

test("college seat batches count as money received; paid college withdrawals as money out; pending and void do not", () => {
  const input: ReceivablesInput = {
    since: new Date("2026-01-01T00:00:00Z"),
    until: new Date("2027-01-01T00:00:00Z"),
    employerName: () => "Acme",
    internName: () => "Asha",
    scoreOf: () => 0,
    activationFeeMinor: 249_900,
    proposals: [],
    employerPayments: [],
    internPayments: [],
    unpaidProfiles: [],
    payouts: [],
    collegeName: () => "IIT X",
    collegeBatches: [
      { id: "b1", collegeId: "c1", status: "paid", amountMinor: 24_000_000, invoiceNumber: "061126-1", referenceId: "UTR1", paidAt: new Date("2026-11-05T06:00:00Z"), createdAt: null },
      { id: "b2", collegeId: "c1", status: "pending", amountMinor: 8_000_000, invoiceNumber: null, referenceId: null, paidAt: null, createdAt: new Date("2026-11-05T06:00:00Z") },
      { id: "b3", collegeId: "c1", status: "void", amountMinor: 8_000_000, invoiceNumber: null, referenceId: null, paidAt: null, createdAt: new Date("2026-11-05T06:00:00Z") },
    ],
    collegePayouts: [
      { id: "p1", collegeId: "c1", status: "paid", amountMinor: 1_500_000, referenceId: "UTR9", paidAt: new Date("2026-11-06T06:00:00Z"), createdAt: null },
      { id: "p2", collegeId: "c1", status: "requested", amountMinor: 500_000, referenceId: null, paidAt: null, createdAt: new Date("2026-11-06T06:00:00Z") },
    ],
  };
  const both = computeReceivables(input, { receivables: "both", payables: "both" });
  assert.equal(both.totals.receivedMinor, 24_000_000);
  assert.equal(both.totals.paidOutMinor, 1_500_000);
  assert.deepEqual(both.receivables.map((r) => [r.source, r.companyName]), [["college", "IIT X"]]);
  const candidateOnly = computeReceivables(input, { receivables: "candidate", payables: "candidate" });
  assert.equal(candidateOnly.totals.receivedMinor, 0);
  assert.equal(candidateOnly.totals.paidOutMinor, 0);
});
