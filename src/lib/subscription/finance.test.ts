import assert from "node:assert/strict";
import { test } from "node:test";

import { computeReceivables, type ReceivablesInput } from "../admin/receivables.ts";

/**
 * A Findtern Pro payment has no proposals. In Finance it must show as money received, never as something a hire still owes,
 * and a full-waiver one must not count as received at all.
 */
const base = (employerPayments: ReceivablesInput["employerPayments"]): ReceivablesInput => ({
  since: new Date("2026-01-01T00:00:00Z"),
  until: new Date("2027-01-01T00:00:00Z"),
  employerName: () => "Acme",
  internName: () => "Asha K",
  scoreOf: () => 7,
  activationFeeMinor: 249_900,
  proposals: [],
  employerPayments,
  internPayments: [],
  unpaidProfiles: [],
  payouts: [],
});
const sub = (over: Partial<ReceivablesInput["employerPayments"][number]>): ReceivablesInput["employerPayments"][number] => ({
  id: "s1", employerId: "e1", orderId: "order_sub", paymentId: "pay_sub", status: "paid", amountMinor: 1_000_000, currency: "INR",
  paidAt: new Date("2026-05-20"), createdAt: null, raw: { kind: "employer_subscription", periodDays: 365, currency: "INR", notes: { proposalIds: [] } },
  ...over,
});

test("a paid subscription is received money with no hire dues, instalments or payables", () => {
  const r = computeReceivables(base([sub({})]), { receivables: "both", payables: "both" });
  assert.equal(r.totals.receivedMinor, 1_000_000);
  assert.equal(r.totals.dueMinor, 0);
  assert.equal(r.totals.owedMinor, 0);
  assert.deepEqual(r.receivables.map((x) => [x.status, x.source]), [["received", "company"]]);
  assert.deepEqual(r.payables, []);
});

test("a waived subscription is not counted as received", () => {
  const r = computeReceivables(base([sub({ gateway: "promo_full_waiver", amountMinor: 0, paymentId: null })]), { receivables: "both", payables: "both" });
  assert.equal(r.totals.receivedMinor, 0);
  assert.equal(r.receivables.length, 0);
});

test("a subscription next to a hire order leaves the hire's dues untouched", () => {
  const input = base([
    sub({}),
    { id: "o1", employerId: "e1", orderId: "ord", paymentId: "pay", status: "paid", amountMinor: 2_000_000, currency: "INR", paidAt: new Date("2026-05-20"), createdAt: null, raw: { notes: { paymentMode: "monthly", proposalIds: ["h"] } } },
  ]);
  input.proposals = [{ id: "h", employerId: "e1", internId: "i1", status: "hired", currency: "INR", offerDetails: { monthlyAmount: 20000, duration: "3m", startDate: "2026-06-01" } }];
  const alone = computeReceivables({ ...input, employerPayments: [input.employerPayments[1]] }, { receivables: "both", payables: "both" });
  const both = computeReceivables(input, { receivables: "both", payables: "both" });
  assert.equal(both.totals.dueMinor, alone.totals.dueMinor);
  assert.equal(both.totals.receivedMinor, alone.totals.receivedMinor + 1_000_000);
});
