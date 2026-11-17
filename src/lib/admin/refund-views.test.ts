import assert from "node:assert/strict";
import test from "node:test";

import { placementLedger } from "../dues.ts";
import { companyLedger } from "./company-ledger.ts";
import { companyMoney } from "./company-money.ts";
import { computeReceivables, type ReceivablesInput } from "./receivables.ts";

/**
 * Refunds in the four money views, on a ₹8,000 x 3 months hire with the ₹5,000 fee (₹29,000 paid upfront).
 * Policy (owner default, see report): a refund is a contra record, paid stays as recorded, net = paid - refunded,
 * and a refunded order never makes the company owe the amount again.
 */
const FEE_ON = { standard: true, skilled: true, assured: true };
const hire = (id: string, monthly: number, currency: "INR" | "USD" = "INR", status = "hired") => ({
  id, employerId: "emp1", internId: `intern-${id}`, projectId: "proj1", status, currency, hiredAt: "2026-11-20T10:00:00Z",
  offerDetails: { monthlyAmount: monthly, duration: "3m", startDate: "2026-12-01", perHireCharge: currency === "USD" ? 50 : 5000 },
});
const order = (id: string, amountMinor: number, ids: string[], mode: string, extra: Record<string, unknown> = {}, o: { currency?: string; paidAt?: string; status?: string; refunds?: unknown[] } = {}) => ({
  id, employerId: "emp1", orderId: `order_${id}`, paymentId: `pay_${id}`, status: o.status ?? "paid", amountMinor, currency: o.currency ?? "INR",
  paidAt: new Date(o.paidAt ?? "2026-11-21T10:00:00Z"), createdAt: new Date(o.paidAt ?? "2026-11-21T10:00:00Z"),
  raw: { notes: { proposalIds: ids, paymentMode: mode, perHireFeeMinor: { [ids[0]]: 500_000 }, ...extra }, ...(o.refunds ? { refunds: o.refunds } : {}) },
});
const proc = (id: string, amountMinor: number, at = "2026-12-05T10:00:00Z") => ({ id, amountMinor, status: "processed", at });

const report = (over: Partial<ReceivablesInput>) =>
  computeReceivables(
    {
      since: null, until: null, now: new Date("2026-12-15T00:00:00Z"), employerName: () => "Acme", internName: () => "Intern", scoreOf: () => 7,
      activationFeeMinor: 0, proposals: [], employerPayments: [], internPayments: [], unpaidProfiles: [], payouts: [], feeSetting: FEE_ON, ...over,
    } as unknown as ReceivablesInput,
    { receivables: "company", payables: "both" },
  );

const views = (hires: ReturnType<typeof hire>[], orders: ReturnType<typeof order>[]) => ({
  pl: hires.map((h) => placementLedger(h as never, orders as never)),
  cl: companyLedger(hires as never, orders as never, () => 7, FEE_ON),
  cm: companyMoney(["emp1"], hires as never, orders as never, () => 7, FEE_ON).get("emp1")!,
  rec: report({ proposals: hires as never, employerPayments: orders as never }),
});
const owed = (rec: ReturnType<typeof report>) => rec.receivables.filter((r) => r.status === "due" || r.status === "upcoming").reduce((s, r) => s + r.inrMinor, 0);

test("partial refund: paid stays ₹29,000, refunded ₹10,000, net ₹19,000, nothing owed again", () => {
  const v = views([hire("h1", 8000)], [order("o1", 2_900_000, ["h1"], "total", {}, { refunds: [proc("rfnd_1", 1_000_000)] })]);
  assert.deepEqual([v.cl.totals.paidInrMinor, v.cl.totals.refundedInrMinor, v.cl.totals.netPaidInrMinor, v.cl.totals.remainingInrMinor], [2_900_000, 1_000_000, 1_900_000, 0]);
  assert.deepEqual([v.cl.hires[0].paidMinor, v.cl.hires[0].refundedMinor, v.cl.hires[0].dueMinor], [2_900_000, 1_000_000, 0]);
  assert.equal(v.cm.amountLeftInrMinor, 0);
  assert.equal(v.cm.refundedInrMinor, 1_000_000);
  assert.equal(owed(v.rec), 0);
  assert.equal(v.pl[0].paidMinor, 2_900_000);
  assert.equal(v.pl[0].dueMinor, 0);
});

test("fully refunded order (status 'refunded'): the company does not owe ₹29,000 again in any view", () => {
  const v = views([hire("h1", 8000)], [order("o1", 2_900_000, ["h1"], "total", {}, { status: "refunded", refunds: [proc("rfnd_1", 2_900_000)] })]);
  assert.deepEqual([v.cl.totals.paidInrMinor, v.cl.totals.refundedInrMinor, v.cl.totals.netPaidInrMinor, v.cl.totals.remainingInrMinor], [2_900_000, 2_900_000, 0, 0]);
  assert.equal(v.cl.hires[0].dueMinor, 0);
  assert.equal(v.cm.amountLeftInrMinor, 0);
  assert.equal(owed(v.rec), 0);
  assert.equal(v.pl[0].dueMinor, 0);
});

test("label-only 'refunded' order (no amounts recorded) also stops the company owing it again, and is counted fully refunded", () => {
  const v = views([hire("h1", 8000)], [order("o1", 2_900_000, ["h1"], "total", {}, { status: "refunded" })]);
  assert.equal(v.cm.amountLeftInrMinor, 0);
  assert.equal(owed(v.rec), 0);
  assert.equal(v.cl.totals.refundedInrMinor, 2_900_000);
});

test("refunded then paid again: paid is both payments, refunded the first, net the second; the hire is covered once", () => {
  const first = order("o1", 2_900_000, ["h1"], "total", {}, { status: "refunded", refunds: [proc("rfnd_1", 2_900_000)] });
  const again = order("o2", 2_900_000, ["h1"], "total", {}, { paidAt: "2026-11-25T10:00:00Z" });
  const v = views([hire("h1", 8000)], [first, again]);
  assert.deepEqual([v.cl.totals.paidInrMinor, v.cl.totals.refundedInrMinor, v.cl.totals.netPaidInrMinor, v.cl.totals.remainingInrMinor], [5_800_000, 2_900_000, 2_900_000, 0]);
  assert.equal(v.cl.hires[0].paidMinor, 2_900_000, "the hire's paid figure is not doubled");
  assert.equal(v.cm.amountLeftInrMinor, 0);
});

test("a refunded monthly order still counts as a month paid: the remaining months stay due, the refunded month is not re-owed", () => {
  const o1 = order("o1", 1_300_000, ["h1"], "monthly", {}, { status: "refunded", refunds: [proc("rfnd_1", 1_300_000)] });
  const v = views([hire("h1", 8000)], [o1]);
  assert.equal(v.cl.hires[0].monthsPaid, 1);
  assert.equal(v.cl.hires[0].dueMinor, 1_600_000);
  assert.equal(v.cm.amountLeftInrMinor, 1_600_000);
  assert.equal(owed(v.rec), 1_600_000);
});

test("USD order refunded in USD: reports convert at ₹100 per $1", () => {
  const o = order("o1", 35_000, ["h1"], "total", {}, { currency: "USD", refunds: [proc("rfnd_1", 10_000)] });
  const v = views([hire("h1", 100, "USD")], [o]);
  assert.equal(v.cl.totals.refundedInrMinor, 1_000_000);
  assert.equal(v.cl.totals.netPaidInrMinor, 3_500_000 - 1_000_000);
  const row = v.rec.refunds[0];
  assert.deepEqual([row.amountMinor, row.currency, row.inrMinor, row.gstInrMinor], [10_000, "USD", 1_000_000, 0]);
});

test("report: the refund is its own row (money out), the payment row stays, and net received is paid - refunded", () => {
  const v = views([hire("h1", 8000)], [order("o1", 2_900_000, ["h1"], "total", {}, { refunds: [proc("rfnd_1", 1_000_000)] })]);
  assert.equal(v.rec.totals.receivedMinor, 2_900_000, "received is as recorded");
  assert.equal(v.rec.refundTotals.refundedMinor, 1_000_000);
  assert.equal(v.rec.refundTotals.netReceivedMinor, 1_900_000);
  assert.equal(v.rec.refundTotals.gstMinor, 1_000_000 - Math.round(1_000_000 / 1.18));
  assert.equal(v.rec.refunds.length, 1);
  assert.deepEqual([v.rec.refunds[0].id, v.rec.refunds[0].date, v.rec.refunds[0].companyName], ["refund:o1:rfnd_1", "2026-12-05", "Acme"]);
});

test("report: a refund is dated by its own day and bounded by the date range like other money", () => {
  const o = order("o1", 2_900_000, ["h1"], "total", {}, { refunds: [proc("rfnd_1", 1_000_000, "2026-12-05T10:00:00Z")] });
  const nov = report({ since: new Date("2026-10-31T18:30:00Z"), until: new Date("2026-11-30T18:30:00Z"), proposals: [hire("h1", 8000)] as never, employerPayments: [o] as never });
  const dec = report({ since: new Date("2026-11-30T18:30:00Z"), until: new Date("2026-12-31T18:30:00Z"), proposals: [hire("h1", 8000)] as never, employerPayments: [o] as never });
  assert.equal(nov.refunds.length, 0);
  assert.equal(dec.refunds.length, 1);
});

test("report: refund after payout is flagged when the intern's payout for that hire is already paid", () => {
  const o = order("o1", 2_900_000, ["h1"], "total", {}, { refunds: [proc("rfnd_1", 2_900_000)], status: "refunded" });
  const paidPayout = { id: "p1", internId: "intern-h1", status: "paid", amountMinor: 800_000, currency: "INR", referenceId: "r1", paidAt: new Date("2026-12-02T05:00:00Z"), createdAt: null, raw: {} };
  const pendingPayout = { ...paidPayout, id: "p2", status: "pending", paidAt: null };
  const flagged = report({ proposals: [hire("h1", 8000)] as never, employerPayments: [o] as never, payouts: [paidPayout, pendingPayout] as never });
  assert.equal(flagged.refundFlags.length, 1);
  assert.deepEqual([flagged.refundFlags[0].kind, flagged.refundFlags[0].orderId, flagged.refundFlags[0].paidOutInrMinor], ["refund_after_payout", "o1", 800_000]);
  const pendingOnly = report({ proposals: [hire("h1", 8000)] as never, employerPayments: [o] as never, payouts: [pendingPayout] as never });
  assert.equal(pendingOnly.refundFlags.length, 0, "a pending payout is not paid out yet");
  const noRefund = report({ proposals: [hire("h1", 8000)] as never, employerPayments: [order("o1", 2_900_000, ["h1"], "total")] as never, payouts: [paidPayout] as never });
  assert.equal(noRefund.refundFlags.length, 0);
});

test("report: the refund flag does not change any payout row", () => {
  const o = order("o1", 2_900_000, ["h1"], "total", {}, { refunds: [proc("rfnd_1", 2_900_000)], status: "refunded" });
  const payouts = [{ id: "p2", internId: "intern-h1", status: "pending", amountMinor: 800_000, currency: "INR", referenceId: null, paidAt: null, createdAt: new Date("2026-12-01T00:00:00Z"), raw: {} }];
  const withRefund = report({ proposals: [hire("h1", 8000)] as never, employerPayments: [o] as never, payouts: payouts as never });
  const without = report({ proposals: [hire("h1", 8000)] as never, employerPayments: [order("o1", 2_900_000, ["h1"], "total")] as never, payouts: payouts as never });
  assert.deepEqual(withRefund.payables, without.payables);
  assert.equal(withRefund.totals.owedMinor, without.totals.owedMinor);
});
