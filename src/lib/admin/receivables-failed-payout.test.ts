import assert from "node:assert/strict";
import test from "node:test";

import { formatMoney } from "../format.ts";
import { computeReceivables, type ReceivablesInput } from "./receivables.ts";

const money = (minor: number) => formatMoney(minor, "INR", { zeroLabel: "0" });
const say = (what: string, expected: unknown, actual: unknown) => console.log(`${what}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
const START = "2026-12-01";
const reportBase = (over: Partial<ReceivablesInput>): ReceivablesInput => ({
  since: null,
  until: null,
  now: new Date("2026-12-15T00:00:00Z"),
  employerName: () => "Acme",
  internName: () => "Intern",
  scoreOf: () => 7,
  activationFeeMinor: 0,
  proposals: [],
  employerPayments: [],
  internPayments: [],
  unpaidProfiles: [],
  payouts: [],
  ...over,
});

test("DEFECT (money report): a FAILED payout is not 'pending', and the month it failed for is not owed twice", () => {
  // Hire at the ₹8,000 share for 3 months; the first payout of ₹8,000 failed at the bank. The month is still owed once:
  // ₹24,000 for 3 months. The Payouts page counts only status 'pending' as pending; the report must agree.
  const proposal = { id: "h1", employerId: "emp1", internId: "i1", status: "hired", currency: "INR", hiredAt: "2026-11-20T10:00:00Z", offerDetails: { monthlyAmount: 16000, duration: "3m", startDate: START } };
  const failed = { id: "p1", internId: "i1", status: "failed", amountMinor: 800_000, currency: "INR", referenceId: null, paidAt: null, createdAt: new Date("2026-12-31T10:00:00Z"), raw: { proposalId: "h1", scheduledFor: "2027-01-01" } };
  const data = computeReceivables(reportBase({ proposals: [proposal] as never, payouts: [failed] as never }), { receivables: "company", payables: "both" });
  const rows = data.payables.map((r) => `${r.id} ${r.status} ${money(r.inrMinor)}`);
  say("failed payout, 3 months of ₹8,000 owed", { owed: money(2_400_000), pendingRows: 0 }, { owed: money(data.totals.owedMinor), rows });
  assert.equal(data.payables.filter((r) => r.id === "payout:p1" && r.status === "pending").length, 0, "a failed payout is not listed as pending");
  assert.equal(data.totals.owedMinor, 2_400_000, "₹24,000 owed, not ₹32,000");
});

test("a pending payout covers its month: owed = pending ₹8,000 + 2 upcoming months = ₹24,000 (control for the defect above)", () => {
  const proposal = { id: "h1", employerId: "emp1", internId: "i1", status: "hired", currency: "INR", hiredAt: "2026-11-20T10:00:00Z", offerDetails: { monthlyAmount: 16000, duration: "3m", startDate: START } };
  const pending = { id: "p1", internId: "i1", status: "pending", amountMinor: 800_000, currency: "INR", referenceId: null, paidAt: null, createdAt: new Date("2026-12-31T10:00:00Z"), raw: { proposalId: "h1", scheduledFor: "2027-01-01" } };
  const data = computeReceivables(reportBase({ proposals: [proposal] as never, payouts: [pending] as never }), { receivables: "company", payables: "both" });
  say("pending payout", { owed: money(2_400_000) }, { owed: money(data.totals.owedMinor), rows: data.payables.map((r) => `${r.id} ${r.status}`) });
  assert.equal(data.totals.owedMinor, 2_400_000);
});
