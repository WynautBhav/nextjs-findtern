import assert from "node:assert/strict";
import { test } from "node:test";

import { billingPlanOf, engagementEndOn, monthMismatches, orderDueMonths, postpaidDueOn, postpaidMonthsPaid, postpaidNext, stipendMonthDates } from "./billing-plan.ts";
import { lineCharge } from "./checkout.ts";
import { monthlyDues, paymentIndexMismatch, placementLedger } from "./dues.ts";
import { employerInvoices, type InvoiceHire, type InvoicePayment } from "./employer-invoice.ts";
import { hireInvoiceLines } from "./invoice-lines.ts";
import { parseOffer } from "./offer.ts";
import { companyLedger } from "./admin/company-ledger.ts";
import { companyMoney } from "./admin/company-money.ts";
import { computeReceivables, type ReceivablesInput } from "./admin/receivables.ts";
import { employerSide, payoutRefusal, stipendDues } from "./admin/stipend-dues.ts";

const OFFER = { roleTitle: "Designer", monthlyAmount: 10000, duration: "3m", startDate: "2026-09-18", perHireCharge: 5000 };
const offer = parseOffer(OFFER, "INR");
const ord = (mode: string, paidAt: string, over: Record<string, unknown> = {}) => ({
  status: "paid",
  paidAt: new Date(paidAt),
  raw: { notes: { paymentMode: mode, proposalIds: ["p1"], dueProposalIds: [], ...over } },
});
const fee = ord("hiring_fee", "2026-09-10T10:00:00+05:30");
const m1 = ord("monthly", "2026-10-17T10:00:00+05:30", { dueProposalIds: ["p1"] });
const m2 = ord("monthly", "2026-11-17T10:00:00+05:30", { dueProposalIds: ["p1"] });

test("billingPlanOf: the oldest paid order decides, unknown modes are upfront, unpaid orders are ignored", () => {
  assert.equal(billingPlanOf("p1", []), "unpaid");
  assert.equal(billingPlanOf("p1", [{ ...fee, status: "created" }]), "unpaid");
  assert.equal(billingPlanOf("p1", [ord("total", "2026-09-01")]), "upfront");
  assert.equal(billingPlanOf("p1", [ord("weird", "2026-09-01")]), "upfront");
  assert.equal(billingPlanOf("p1", [ord("monthly", "2026-09-01")]), "monthly_prepaid");
  // later month orders (mode "monthly") never turn a post-paid hire into a prepaid one, whatever the array order
  assert.equal(billingPlanOf("p1", [m1, fee]), "postpaid");
  assert.equal(billingPlanOf("other", [fee]), "unpaid");
});

test("postpaidMonthsPaid (old rule, fee-only order): the fee order is not a month", () => {
  assert.equal(postpaidMonthsPaid("p1", [fee]), 0);
  assert.equal(postpaidMonthsPaid("p1", [fee, m1]), 1);
  assert.equal(postpaidMonthsPaid("p1", [fee, m1, m2]), 2);
});

test("postpaidDueOn: 2 days before the intern is paid for the month, in IST; clamps; falls back to the IST hire day", () => {
  assert.equal(postpaidDueOn("2026-09-18", 3, 1), "2026-10-16"); // intern paid 18 Oct
  assert.equal(postpaidDueOn("2026-09-18", 3, 3), "2026-12-16"); // intern paid 18 Dec
  assert.equal(postpaidDueOn("2026-01-31", 2, 1), "2026-02-26"); // intern paid 28 Feb (clamped)
  assert.equal(postpaidDueOn("2026-09-18", 3, 4), null);
  assert.equal(postpaidDueOn(null, 3, 1), null);
  assert.deepEqual(postpaidNext("2026-09-18", 3, 0, "2026-09-30"), { k: 1, dueOn: "2026-10-16", payable: false });
  assert.equal(postpaidNext("2026-09-18", 3, 0, "2026-10-01")!.payable, true); // 15 days before the due day
  assert.equal(postpaidNext("2026-09-18", 3, 0, "2026-10-16")!.payable, true);
  assert.equal(postpaidNext("2026-09-18", 3, 0, "2026-11-30")!.payable, true); // late is still payable
  assert.equal(postpaidNext("2026-09-18", 3, 1, "2026-10-31")!.payable, false); // month 2 (due 16 Nov) not before 1 Nov
  assert.equal(postpaidNext("2026-09-18", 3, 1, "2026-11-01")!.payable, true);
  assert.equal(postpaidNext("2026-09-18", 3, 3, "2027-01-01"), null);
  // hired 17 Oct 23:00 UTC = 18 Oct IST, no start date: month 1 paid to the intern 18 Nov, due from the employer 16 Nov
  const [d] = monthlyDues([{ id: "p1", status: "hired", offerDetails: { duration: "1m" }, hiredAt: "2026-10-17T23:00:00Z" }], [fee], "2026-11-17");
  assert.equal(d.dueOn, "2026-11-16");
});

test("stipendMonthDates: the one source of the intern pay day, employer due day (2 days earlier) and pay window (15 days before that)", () => {
  // The owner's example: start 23 Nov 2026, 3 months.
  assert.deepEqual([1, 2, 3].map((k) => stipendMonthDates("2026-11-23", 3, k)), [
    { internPayOn: "2026-12-23", employerDueOn: "2026-12-21", payableFrom: "2026-12-06" },
    { internPayOn: "2027-01-23", employerDueOn: "2027-01-21", payableFrom: "2027-01-06" },
    { internPayOn: "2027-02-23", employerDueOn: "2027-02-21", payableFrom: "2027-02-06" },
  ]);
  // 31st: clamps to the month's last day, then 2 days back
  assert.deepEqual(stipendMonthDates("2026-10-31", 3, 1), { internPayOn: "2026-11-30", employerDueOn: "2026-11-28", payableFrom: "2026-11-13" });
  assert.equal(stipendMonthDates("2026-10-31", 3, 2)!.internPayOn, "2026-12-31");
  // Feb, non-leap and leap
  assert.deepEqual(stipendMonthDates("2027-01-31", 2, 1), { internPayOn: "2027-02-28", employerDueOn: "2027-02-26", payableFrom: "2027-02-11" });
  assert.deepEqual(stipendMonthDates("2028-01-31", 2, 1), { internPayOn: "2028-02-29", employerDueOn: "2028-02-27", payableFrom: "2028-02-12" });
  assert.equal(stipendMonthDates("2028-01-30", 1, 1)!.employerDueOn, "2028-02-27");
  // pay day on the 1st or 2nd: the due day falls in the previous month (and across a year end)
  assert.equal(stipendMonthDates("2026-10-01", 3, 1)!.employerDueOn, "2026-10-30");
  assert.equal(stipendMonthDates("2026-12-02", 1, 1)!.employerDueOn, "2026-12-31");
  assert.equal(stipendMonthDates("2026-12-01", 1, 1)!.employerDueOn, "2026-12-30");
  assert.equal(stipendMonthDates("2026-11-15", 3, 1)!.payableFrom, "2026-11-28");
  // out of range / no anchor
  assert.equal(stipendMonthDates("2026-11-23", 3, 0), null);
  assert.equal(stipendMonthDates("2026-11-23", 3, 4), null);
  assert.equal(stipendMonthDates(null, 3, 1), null);
  assert.equal(stipendMonthDates("not a date", 3, 1), null);
  // the engagement still ends on the timesheet period end, not the due day
  assert.equal(engagementEndOn("2026-11-23", 3), "2027-02-22");
});

test("IST: the anchor of a hire with no start date is its Indian day, so its dates follow India", () => {
  // 18:29 UTC on 22 Nov is 23:59 IST 22 Nov; 18:30 UTC is 00:00 IST 23 Nov
  const at = (hiredAt: string) => monthlyDues([{ id: "p1", status: "hired", offerDetails: { duration: "1m" }, hiredAt }], [fee], "2026-11-01")[0].dueOn;
  assert.equal(at("2026-11-22T18:29:00Z"), "2026-12-20");
  assert.equal(at("2026-11-22T18:30:00Z"), "2026-12-21");
});

test("checkout: post-paid first payment is the fee + Month 1; no double fee on a month; low score / full-time are not offered", () => {
  const first = lineCharge(offer, 7, "postpaid");
  assert.equal(first.totalMinor, 500_000 + 1_000_000);
  assert.equal(first.perHireMinor, 500_000);
  const month = lineCharge(offer, 7, "postpaid", { firstPayment: false });
  assert.equal(month.totalMinor, 1_000_000);
  assert.equal(month.perHireMinor, 0);
  // fee + Month 1, then the later months = the whole engagement, fee counted once
  assert.equal(first.totalMinor + 2 * month.totalMinor, lineCharge(offer, 7, "upfront").totalMinor);
  assert.ok(lineCharge(offer, 5, "postpaid").monthlyBlocked);
  assert.ok(lineCharge(parseOffer({ fullTimeOffer: { annualCtc: 600000 } }, "INR"), 8, "postpaid").monthlyBlocked);
  // USD keeps $50
  assert.equal(lineCharge(parseOffer({ monthlyAmount: 100, duration: "2m", currency: "USD" }, "USD"), 8, "postpaid").totalMinor, 5_000 + 10_000);
});

test("monthlyDues (old rule, fee-only order): month 1 is payable from 15 days before its due day (2 days before the intern's pay day), never blocked after", () => {
  const hire = [{ id: "p1", status: "hired", offerDetails: OFFER, hiredAt: "2026-09-10T00:00:00Z" }];
  assert.deepEqual(monthlyDues(hire, [fee], "2026-09-30").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[0, "2026-10-16", false]]);
  assert.deepEqual(monthlyDues(hire, [fee], "2026-10-01").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[0, "2026-10-16", true]]);
  assert.deepEqual(monthlyDues(hire, [fee], "2026-10-16").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[0, "2026-10-16", true]]);
  assert.deepEqual(monthlyDues(hire, [fee, m1], "2026-10-18").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[1, "2026-11-16", false]]);
  assert.deepEqual(monthlyDues(hire, [fee, m1], "2026-11-01").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[1, "2026-11-16", true]]);
  assert.deepEqual(monthlyDues(hire, [fee, m1, m2, ord("monthly", "2026-12-17", { dueProposalIds: ["p1"] })], "2027-01-01"), []);
  // a stale second submit for month 1 once month 2 is payable names a paid month
  assert.equal(paymentIndexMismatch([{ due: { monthsPaid: 1 } }], 0), true);
});

test("grandfathered hires: a monthly (pay-at-start) hire owes its next month now, a fully paid one owes nothing", () => {
  const hire = [{ id: "p1", status: "hired", offerDetails: OFFER, hiredAt: "2026-09-10T00:00:00Z" }];
  const first = ord("monthly", "2026-09-10");
  assert.deepEqual(monthlyDues(hire, [first], "2026-09-11").map((d) => [d.plan, d.monthsPaid, d.payable]), [["monthly_prepaid", 1, true]]);
  assert.deepEqual(monthlyDues(hire, [ord("total", "2026-09-10")], "2026-09-11"), []);
});

test("placementLedger (old rule, fee-only order): after the fee only the hire is partly paid, never fully paid; due 2 days before the intern's pay day", () => {
  const hire = { id: "p1", status: "hired", offerDetails: OFFER, currency: "INR", hiredAt: "2026-09-10T00:00:00Z" };
  const a = placementLedger(hire, [fee]);
  assert.deepEqual([a.plan, a.status, a.paidMinor, a.dueMinor, a.monthsPaid, a.nextDue], ["postpaid", "partially_paid", 500_000, 3_000_000, 0, "2026-10-16"]);
  const b = placementLedger(hire, [fee, m1, m2, ord("monthly", "2026-12-17", { dueProposalIds: ["p1"] })]);
  assert.deepEqual([b.status, b.dueMinor, b.paidMinor, b.nextDue], ["fully_paid", 0, 3_500_000, null]);
});

test("invoice lines: fee order = one Hiring charge line; month k = Month k of N, no fee, k counts months not payments", () => {
  const base = { who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer, paymentIndex: 0 };
  const f = hireInvoiceLines({ ...base, monthly: false, postpaid: "fee", chargedMinor: 500_000 });
  assert.equal(f.length, 1);
  assert.match(f[0].label, /Hiring charge/);
  assert.equal(f[0].amountMinor, 500_000);
  assert.doesNotMatch(f[0].detail ?? "", /Stipend/);
  const k = hireInvoiceLines({ ...base, monthly: true, paymentIndex: 1, postpaid: 1, chargedMinor: 1_000_000 });
  assert.equal(k.length, 1);
  assert.match(k[0].detail ?? "", /Month 1 of 3 \(18 Sep – 17 Oct\)/);
  assert.equal(k[0].amountMinor, 1_000_000);
  assert.ok(!k.some((l) => /hiring/i.test(l.label)));
  // upfront payment keeps its stipend + fee lines
  assert.equal(hireInvoiceLines({ ...base, monthly: false }).length, 2);
});

test("employerInvoices: post-paid order sequence prints Hiring charge, then Month 1 of 3, then Month 2 of 3", () => {
  const hire: InvoiceHire = { proposalId: "p1", offerDetails: OFFER, currency: "INR", who: "Asha K", projectName: "Brand" };
  const mk = (id: string, o: ReturnType<typeof ord>, amountMinor: number): InvoicePayment => ({ id, orderId: id, invoiceNumber: `FT/${id}`, status: "paid", paidAt: o.paidAt, amountMinor, raw: o.raw });
  const pays = [mk("a", fee, 500_000), mk("b", m1, 1_000_000), mk("c", m2, 1_000_000)];
  const inv = employerInvoices({ payments: pays, allPayments: pays, legacyPaid: [], hires: new Map([["p1", hire]]) });
  assert.deepEqual(inv.get("a")!.lines.map((l) => l.amountMinor), [500_000]);
  assert.match(inv.get("a")!.lines[0].label, /Hiring charge/);
  assert.match(inv.get("a")!.description, /hiring charge/);
  assert.match(inv.get("b")!.lines[0].detail ?? "", /Month 1 of 3/);
  assert.match(inv.get("c")!.lines[0].detail ?? "", /Month 2 of 3/);
  assert.equal(inv.get("b")!.lines.length, 1);
});

test("payout gate (old rule, fee-only order): a post-paid month is refused until the employer has paid it; grandfathered hires are not blocked", () => {
  const hire = (id: string) => ({ id, status: "hired", employerId: "e1", offerDetails: OFFER, currency: "INR", hiredAt: "2026-09-10T00:00:00Z" });
  const gate = (orders: unknown[], paidPayouts: number) =>
    payoutRefusal(
      stipendDues([hire("p1")], Array.from({ length: paidPayouts }, () => ({ status: "paid", raw: { proposalId: "p1" } })), 7, orders as never)[0],
      500_000,
    );
  assert.match(gate([fee], 0)!, /hasn't paid month 1/);
  assert.equal(gate([fee, m1], 0), null); // employer paid month 1: payout 1 opens
  assert.match(gate([fee, m1], 1)!, /hasn't paid month 2/); // month 2 payout refused
  assert.equal(gate([fee, m1, m2], 1), null);
  // grandfathered monthly: employer paid month 1 only, intern is "ahead" but not blocked
  const [g] = stipendDues([hire("p1")], [{ status: "paid", raw: { proposalId: "p1" } }], 7, [ord("monthly", "2026-09-10")] as never);
  assert.equal(g.employer!.plan, "monthly_prepaid");
  assert.equal(g.aheadOfEmployer, true);
  assert.equal(payoutRefusal(g, 500_000), null);
  // employerSide: the fee is neither paid in full nor a month
  const side = employerSide("p1", offer, [fee]);
  assert.deepEqual([side.paidInFull, side.paidMonths, side.plan], [false, 0, "postpaid"]);
});

test("receivables: post-paid month 1 due 16 Oct: upcoming the day before, due from the due day itself; fee shows as hiring charge", () => {
  const input = (now: string): ReceivablesInput => ({
    since: null,
    until: null,
    now: new Date(now),
    employerName: () => "Acme",
    internName: () => "Asha",
    scoreOf: () => 7,
    activationFeeMinor: 0,
    proposals: [{ id: "p1", employerId: "e1", internId: "i1", status: "hired", currency: "INR", offerDetails: OFFER, hiredAt: "2026-09-10T00:00:00Z" }],
    employerPayments: [{ id: "o1", employerId: "e1", orderId: "ord", paymentId: "pay", status: "paid", amountMinor: 500_000, currency: "INR", paidAt: fee.paidAt, createdAt: null, raw: fee.raw }],
    internPayments: [],
    unpaidProfiles: [],
    payouts: [],
  });
  const rows = (now: string) => computeReceivables(input(now), { receivables: "company", payables: "company" }).receivables;
  const r1 = rows("2026-10-16T12:00:00+05:30");
  assert.equal(r1.find((r) => r.id === "instalment:p1:1")!.date, "2026-10-16");
  assert.equal(r1.find((r) => r.id === "instalment:p1:1")!.status, "due");
  assert.equal(rows("2026-10-15T12:00:00+05:30").find((r) => r.id === "instalment:p1:1")!.status, "upcoming");
  assert.match(r1.find((r) => r.status === "received")!.description, /hiring charge/);
  assert.equal(r1.filter((r) => r.id.startsWith("instalment")).length, 3);
});

test("companyLedger: post-paid hire shows plan postpaid with its due date (2 days before the intern's pay day), the fee is not 'upfront'", () => {
  const l = companyLedger(
    [{ id: "p1", internId: "i1", projectId: "pr", status: "hired", currency: "INR", offerDetails: OFFER, hiredAt: "2026-09-10T00:00:00Z" }],
    [{ id: "o1", status: "paid", amountMinor: 500_000, currency: "INR", paidAt: fee.paidAt, createdAt: null, raw: fee.raw }],
    () => 7,
  );
  const h = l.hires[0];
  assert.deepEqual([h.plan, h.paidMinor, h.dueMinor, h.monthsPaid, h.nextDueDate], ["postpaid", 500_000, 3_000_000, 0, "2026-10-16"]);
  assert.equal(l.payments.get("o1")!.mode, "Hiring charge");
});

const feeOrder = (id: string) => ({ status: "paid", paidAt: "2026-09-01T00:00:00Z", raw: { notes: { proposalIds: [id], paymentMode: "hiring_fee" } } });
const monthOrder = (id: string, at: string) => ({ status: "paid", paidAt: at, raw: { notes: { proposalIds: [id], dueProposalIds: [id], paymentMode: "total" } } });
const checkout = (id: string, dueMonth: number) => ({ notes: { proposalIds: [id], dueProposalIds: [id], dueMonths: { [id]: dueMonth }, paymentMode: "total" } });

test("orderDueMonths reads the month each due line was priced for", () => {
  assert.deepEqual(orderDueMonths(checkout("p1", 2)), { p1: 2 });
  assert.deepEqual(orderDueMonths({ order: checkout("p1", 3) }), { p1: 3 });
  assert.deepEqual(orderDueMonths({ notes: { dueMonths: { p1: 0, p2: "x" } } }), {});
  assert.deepEqual(orderDueMonths(null), {});
});

test("monthMismatches: a post-paid month paid out of turn is flagged, the right month and old orders are not", () => {
  // month 1 paid: the next order is month 2
  const others = [feeOrder("p1"), monthOrder("p1", "2026-10-01T00:00:00Z")];
  assert.deepEqual(monthMismatches(checkout("p1", 2), others), []);
  // a second checkout for month 2 settling after the first one did: monthsPaid is now 2, not 1
  const both = [...others, monthOrder("p1", "2026-10-02T00:00:00Z")];
  assert.deepEqual(monthMismatches(checkout("p1", 2), both), [{ proposalId: "p1", dueMonth: 2, monthsPaid: 2 }]);
  // a month skipped
  assert.deepEqual(monthMismatches(checkout("p1", 3), others), [{ proposalId: "p1", dueMonth: 3, monthsPaid: 1 }]);
  // month 1 right after the fee
  assert.deepEqual(monthMismatches(checkout("p1", 1), [feeOrder("p1")]), []);
  // orders without dueMonths and pay-at-start (monthly) hires are never checked
  assert.deepEqual(monthMismatches({ notes: { proposalIds: ["p1"], dueProposalIds: ["p1"] } }, both), []);
  const prepaid = [{ status: "paid", raw: { notes: { proposalIds: ["p1"], paymentMode: "monthly" } } }];
  assert.deepEqual(monthMismatches(checkout("p1", 5), prepaid), []);
});

test("an anchor that only looks like a date gives no stipend dates", () => {
  assert.equal(stipendMonthDates("2026-02-30", 3, 1), null);
  assert.equal(stipendMonthDates("2026-13-01", 3, 1), null);
  assert.equal(engagementEndOn("2026-02-30", 3), null);
  assert.notEqual(stipendMonthDates("2026-02-28", 3, 1), null);
});

test("admin money views price an accepted offer the same whatever the intern's score is now (cleared, below 6, or 6+)", () => {
  const proposal = { id: "p1", internId: "i1", projectId: "pr", status: "hired", currency: "INR", offerDetails: OFFER, hiredAt: "2026-09-10T00:00:00Z" };
  const orders = [{ id: "o1", status: "paid", amountMinor: 500_000, currency: "INR", paidAt: fee.paidAt, createdAt: null, raw: fee.raw }];
  const ledger = (score: number) => companyLedger([proposal], orders, () => score).hires[0];
  const receivables = (score: number) =>
    computeReceivables(
      {
        since: null,
        until: null,
        now: new Date("2026-10-16T12:00:00+05:30"),
        employerName: () => "Acme",
        internName: () => "Asha",
        scoreOf: () => score,
        activationFeeMinor: 0,
        proposals: [{ ...proposal, employerId: "e1" }],
        employerPayments: [{ ...orders[0], employerId: "e1", orderId: "ord", paymentId: "pay" }],
        internPayments: [],
        unpaidProfiles: [],
        payouts: [],
      } as ReceivablesInput,
      { receivables: "company", payables: "company" },
    ).receivables.filter((r) => r.id.startsWith("instalment")).map((r) => [r.id, r.amountMinor] as const).sort();
  const money = (score: number) =>
    companyMoney(["e1"], [{ ...proposal, employerId: "e1" }], orders.map((o) => ({ ...o, employerId: "e1" })), () => score).get("e1")!.amountLeftInrMinor;

  for (const score of [0, 3, 5.9, 6, 10]) {
    assert.deepEqual([ledger(score).plan, ledger(score).dueMinor], ["postpaid", 3_000_000], `ledger ${score}`);
    assert.deepEqual(receivables(score), [["instalment:p1:1", 1_000_000], ["instalment:p1:2", 1_000_000], ["instalment:p1:3", 1_000_000]], `receivables ${score}`);
    assert.equal(money(score), 3_000_000, `money ${score}`);
  }
});

// ── New rule: the first post-paid payment is the hiring charge + Month 1 (notes.firstMonthProposalIds) ──
const feeM1 = ord("hiring_fee", "2026-09-10T10:00:00+05:30", { firstMonthProposalIds: ["p1"] });
const feeM1Raw = (amountMinor: number) => ({ id: "o1", status: "paid", amountMinor, currency: "INR", paidAt: feeM1.paidAt, createdAt: null, raw: feeM1.raw });
const hireP1 = { id: "p1", status: "hired", offerDetails: OFFER, currency: "INR", hiredAt: "2026-09-10T00:00:00Z" };

test("new rule: a fee order that names the hire in firstMonthProposalIds pays month 1; the flag is ignored on any other mode", () => {
  assert.equal(postpaidMonthsPaid("p1", [feeM1]), 1);
  assert.equal(postpaidMonthsPaid("p1", [feeM1, m2]), 2);
  assert.equal(postpaidMonthsPaid("other", [feeM1]), 0);
  assert.equal(billingPlanOf("p1", [feeM1]), "postpaid");
  assert.equal(postpaidMonthsPaid("p1", [ord("total", "2026-09-10", { firstMonthProposalIds: ["p1"] })]), 0);
  // month 2 right after the new-rule fee order is the right month, not a mismatch
  assert.deepEqual(monthMismatches(checkout("p1", 2), [feeM1]), []);
  assert.deepEqual(monthMismatches(checkout("p1", 1), [feeM1]), [{ proposalId: "p1", dueMonth: 1, monthsPaid: 1 }]);
});

test("new rule: monthlyDues and placementLedger start at month 2; a one-month hire is fully paid", () => {
  assert.deepEqual(monthlyDues([hireP1], [feeM1], "2026-11-01").map((d) => [d.monthsPaid, d.dueOn, d.payable]), [[1, "2026-11-16", true]]);
  const a = placementLedger(hireP1, [feeM1]);
  assert.deepEqual([a.plan, a.status, a.paidMinor, a.dueMinor, a.monthsPaid, a.nextDue], ["postpaid", "partially_paid", 1_500_000, 2_000_000, 1, "2026-11-16"]);
  const one = { ...hireP1, offerDetails: { ...OFFER, duration: "1m" } };
  const b = placementLedger(one, [feeM1]);
  assert.deepEqual([b.status, b.dueMinor, b.paidMinor, b.nextDue], ["fully_paid", 0, 1_500_000, null]);
  assert.deepEqual(monthlyDues([one], [feeM1], "2026-11-01"), []);
});

test("new rule: companyLedger counts month 1 on the fee order", () => {
  const l = companyLedger([{ ...hireP1, internId: "i1", projectId: "pr" }], [feeM1Raw(1_500_000)], () => 7);
  const h = l.hires[0];
  assert.deepEqual([h.plan, h.paidMinor, h.dueMinor, h.monthsPaid, h.nextDueDate], ["postpaid", 1_500_000, 2_000_000, 1, "2026-11-16"]);
});

test("new rule: payout gate lets intern month 1 through and employerSide reads one paid month; receivables label the order", () => {
  const [d] = stipendDues([{ ...hireP1, employerId: "e1" }], [], 7, [feeM1] as never);
  assert.equal(payoutRefusal(d, 500_000), null);
  const side = employerSide("p1", offer, [feeM1]);
  assert.deepEqual([side.paidInFull, side.paidMonths, side.plan], [false, 1, "postpaid"]);
  const rows = computeReceivables(
    {
      since: null, until: null, now: new Date("2026-10-16T12:00:00+05:30"), employerName: () => "Acme", internName: () => "Asha", scoreOf: () => 7, activationFeeMinor: 0,
      proposals: [{ ...hireP1, employerId: "e1", internId: "i1" }],
      employerPayments: [{ ...feeM1Raw(1_500_000), employerId: "e1", orderId: "ord", paymentId: "pay" }],
      internPayments: [], unpaidProfiles: [], payouts: [],
    } as ReceivablesInput,
    { receivables: "company", payables: "company" },
  ).receivables;
  assert.match(rows.find((r) => r.status === "received")!.description, /hiring charge \+ month 1/);
  assert.deepEqual(rows.filter((r) => r.id.startsWith("instalment")).map((r) => r.id).sort(), ["instalment:p1:2", "instalment:p1:3"]);
});

test("new rule: invoice = Hiring charge line + Month 1 charge line; the next order says Month 2 of 3; free mode falls back to the list month", () => {
  const base = { who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer, paymentIndex: 0 };
  const two = hireInvoiceLines({ ...base, monthly: false, postpaid: "fee", withMonth1: true, chargedMinor: 1_500_000 });
  assert.deepEqual(two.map((l) => l.amountMinor), [500_000, 1_000_000]);
  assert.match(two[0].label, /Hiring charge/);
  assert.match(two[1].detail ?? "", /Month 1 charge \(18 Sep – 17 Oct\)/);
  assert.deepEqual(hireInvoiceLines({ ...base, monthly: false, postpaid: "fee", withMonth1: true, chargedMinor: 0 }).map((l) => l.amountMinor), [500_000, 1_000_000]);
  const hire: InvoiceHire = { proposalId: "p1", offerDetails: OFFER, currency: "INR", who: "Asha K", projectName: "Brand" };
  const mk = (id: string, o: ReturnType<typeof ord>, amountMinor: number): InvoicePayment => ({ id, orderId: id, invoiceNumber: `FT/${id}`, status: "paid", paidAt: o.paidAt, amountMinor, raw: o.raw });
  const pays = [mk("a", feeM1, 1_500_000), mk("b", m2, 1_000_000)];
  const inv = employerInvoices({ payments: pays, allPayments: pays, legacyPaid: [], hires: new Map([["p1", hire]]) });
  assert.equal(inv.get("a")!.lines.length, 2);
  assert.match(inv.get("a")!.description, /hiring charge \+ Month 1 charge/);
  assert.match(inv.get("b")!.lines[0].detail ?? "", /Month 2 of 3/);
});
