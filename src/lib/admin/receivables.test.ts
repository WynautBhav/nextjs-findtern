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
