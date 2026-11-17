import assert from "node:assert/strict";
import test from "node:test";

import { formatMoney } from "./format.ts";
import { placementLedger } from "./dues.ts";
import { splitGst, placeOfSupply, type PlaceOfSupply } from "./gst.ts";
import { companyLedger } from "./admin/company-ledger.ts";
import { companyMoney } from "./admin/company-money.ts";
import { computeReceivables, moneyTotals, type MoneyRow, type ReceivablesInput } from "./admin/receivables.ts";
import { toInrMinor } from "./admin/money.ts";
import { acceptedLineCharge } from "./accepted-charge.ts";
import { parseOffer } from "./offer.ts";

/**
 * Company side: what a company has to pay (to collect) and what Findtern pays
 * out, for hires at monthly ₹8,000 / ₹5,000 / ₹15,000 (3 months, ₹5,000 hiring
 * fee) and a USD hire ($100/month, $50 fee). Every scenario goes through the
 * four places that print a company figure and they must agree:
 *   placementLedger (employer Orders page), companyLedger (admin company 360),
 *   companyMoney (admin Companies list), computeReceivables (admin Money in/out).
 * Pure code only: the SQL that feeds them is not run (no database here).
 */

const money = (minor: number, cur: "INR" | "USD" = "INR") => formatMoney(minor, cur, { zeroLabel: "0" });
const say = (what: string, expected: unknown, actual: unknown) => console.log(`${what}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);

const START = "2026-12-01";
const hire = (id: string, monthly: number, extra: Record<string, unknown> = {}, currency: "INR" | "USD" = "INR", status = "hired") => ({
  id,
  employerId: "emp1",
  internId: `intern-${id}`,
  projectId: "proj1",
  status,
  currency,
  hiredAt: "2026-11-20T10:00:00Z",
  offerDetails: { monthlyAmount: monthly, duration: "3m", startDate: START, perHireCharge: currency === "USD" ? 50 : 5000, ...extra },
});
const order = (id: string, amountMinor: number, ids: string[], mode: string, extra: Record<string, unknown> = {}, currency = "INR", paidAt = "2026-11-21T10:00:00Z") => ({
  id,
  employerId: "emp1",
  orderId: `order_${id}`,
  paymentId: `pay_${id}`,
  status: "paid",
  amountMinor,
  currency,
  paidAt: new Date(paidAt),
  createdAt: new Date(paidAt),
  raw: { notes: { proposalIds: ids, paymentMode: mode, ...extra } },
});
const FEE_ON = { standard: true, skilled: true, assured: true };
const FEE_OFF = { standard: false, skilled: false, assured: false };

/** One hire's "still to collect" as each of the four places computes it, in INR minor. */
function figures(h: ReturnType<typeof hire>, orders: ReturnType<typeof order>[], feeSetting = FEE_ON) {
  const hires = [h];
  const pl = placementLedger(h as never, orders as never);
  const cl = companyLedger(hires as never, orders as never, () => 7, feeSetting);
  const cm = companyMoney(["emp1"], hires as never, orders as never, () => 7, feeSetting).get("emp1")!;
  const rec = computeReceivables(
    {
      since: null,
      until: null,
      now: new Date("2026-12-15T00:00:00Z"),
      employerName: () => "Acme",
      internName: () => "Intern",
      scoreOf: () => 7,
      activationFeeMinor: 0,
      proposals: hires,
      employerPayments: orders,
      internPayments: [],
      unpaidProfiles: [],
      payouts: [],
      feeSetting,
    } as unknown as ReceivablesInput,
    { receivables: "company", payables: "company" },
  );
  const owed = rec.receivables.filter((r) => r.status === "due" || r.status === "upcoming").reduce((s, r) => s + r.inrMinor, 0);
  const cur = h.currency;
  return {
    placementDue: toInrMinor(pl.dueMinor, cur),
    placementTotal: toInrMinor(pl.totalMinor, cur),
    placementPaid: toInrMinor(pl.paidMinor, cur),
    ledgerDue: cl.totals.remainingInrMinor,
    ledgerPaid: cl.totals.paidInrMinor,
    listDue: cm.amountLeftInrMinor,
    reportDue: owed,
    pl,
    cl,
  };
}

/* ── 1. The scenarios, all four views must agree ────────────────────── */

for (const monthly of [8000, 5000, 15000]) {
  const m = monthly * 100;
  const fee = 500_000;
  const H = hire("h1", monthly);

  test(`₹${monthly}/month x 3, accepted, nothing paid: collect ₹${(3 * monthly + 5000).toLocaleString("en-IN")} (3 months + ₹5,000 fee) in every view`, () => {
    const accepted = hire("h1", monthly, {}, "INR", "accepted");
    const f = figures(accepted, []);
    const expected = 3 * m + fee;
    say("unpaid", { list: money(expected), ledger: money(expected), report: money(expected) }, { list: money(f.listDue), ledger: money(f.ledgerDue), report: money(f.reportDue) });
    assert.equal(f.listDue, expected, "companies list 'amount left'");
    assert.equal(f.ledgerDue, expected, "company 360 remaining");
    assert.equal(f.reportDue, expected, "money report due row");
    assert.equal(f.cl.hires[0].dueMinor, expected);
  });

  test(`₹${monthly}/month x 3, paid upfront in one order: nothing left; paid = ₹${(3 * monthly + 5000).toLocaleString("en-IN")} everywhere`, () => {
    const o = order("o1", 3 * m + fee, ["h1"], "total", { perHireFeeMinor: { h1: fee } });
    const f = figures(H, [o]);
    say("paid upfront", { due: 0, paid: money(3 * m + fee) }, { placement: f.placementDue, ledger: f.ledgerDue, listDue: f.listDue, paid: money(f.placementPaid) });
    assert.equal(f.placementDue, 0);
    assert.equal(f.ledgerDue, 0);
    assert.equal(f.listDue, 0);
    assert.equal(f.reportDue, 0);
    assert.equal(f.placementPaid, 3 * m + fee);
    assert.equal(f.ledgerPaid, 3 * m + fee);
  });

  test(`₹${monthly}/month x 3, monthly plan, 1 month paid (month + fee): ₹${(2 * monthly).toLocaleString("en-IN")} left, no second fee`, () => {
    const o = order("o1", m + fee, ["h1"], "monthly", { perHireFeeMinor: { h1: fee } });
    const f = figures(H, [o]);
    say("monthly, 1 paid", { due: money(2 * m), total: money(3 * m + fee) }, { placement: money(f.placementDue), total: money(f.placementTotal), ledger: money(f.ledgerDue), list: money(f.listDue), report: money(f.reportDue) });
    assert.equal(f.placementDue, 2 * m);
    assert.equal(f.ledgerDue, 2 * m);
    assert.equal(f.listDue, 2 * m);
    assert.equal(f.reportDue, 2 * m);
    assert.equal(f.placementTotal, 3 * m + fee, "total = 3 months + fee, fee once");
    assert.equal(f.placementPaid + f.placementDue, f.placementTotal, "paid + due = total");
  });

  test(`₹${monthly}/month x 3, post-paid (fee + month 1 first): ₹${(2 * monthly).toLocaleString("en-IN")} left and paid + due = total`, () => {
    const o = order("o1", m + fee, ["h1"], "hiring_fee", { firstMonthProposalIds: ["h1"], perHireFeeMinor: { h1: fee } });
    const f = figures(H, [o]);
    say("post-paid, fee + month 1", { due: money(2 * m) }, { placement: money(f.placementDue), ledger: money(f.ledgerDue), list: money(f.listDue), report: money(f.reportDue) });
    assert.equal(f.placementDue, 2 * m);
    assert.equal(f.ledgerDue, 2 * m);
    assert.equal(f.listDue, 2 * m);
    assert.equal(f.reportDue, 2 * m);
    assert.equal(f.placementPaid + f.placementDue, f.placementTotal);
  });

  test(`₹${monthly}/month x 3, hiring fee free for this hire: collect ₹${(3 * monthly).toLocaleString("en-IN")}, fee shown 0`, () => {
    const accepted = hire("h1", monthly, {}, "INR", "accepted");
    const f = figures(accepted, [], FEE_OFF);
    say("fee switched off for the score band", money(3 * m), { list: money(f.listDue), ledger: money(f.ledgerDue), report: money(f.reportDue) });
    assert.equal(f.listDue, 3 * m);
    assert.equal(f.ledgerDue, 3 * m);
    assert.equal(f.reportDue, 3 * m);
    // A paid order that recorded a ₹0 fee: the fee stays 0 even if the admin switch is later turned on.
    const o = order("o1", 3 * m, ["h1"], "total", { perHireFeeMinor: { h1: 0 } });
    const pl = placementLedger(H as never, [o] as never);
    assert.equal(pl.feeMinor, 0);
    assert.equal(pl.totalMinor, 3 * m);
    assert.equal(pl.dueMinor, 0);
  });
}

test("USD hire $100/month x 3 + $50 fee: collect $350 in the hire's currency; admin totals count it as ₹35,000 (₹100 = $1), never $350 + rupees raw", () => {
  const H = hire("u1", 100, {}, "USD", "accepted");
  const f = figures(H, []);
  say("USD unpaid", { ledgerHire: "$350.00", inr: "₹35,000" }, { ledgerHire: money(f.cl.hires[0].dueMinor, "USD"), inr: money(f.ledgerDue) });
  assert.equal(f.cl.hires[0].dueMinor, 35_000);
  assert.equal(f.cl.hires[0].currency, "USD");
  assert.equal(f.ledgerDue, 3_500_000);
  assert.equal(f.listDue, 3_500_000);
  assert.equal(f.reportDue, 3_500_000);
});

test("a company with one INR and one USD hire: the total is the INR sum, and each row keeps its own currency", () => {
  const a = hire("a", 8000, {}, "INR", "accepted");
  const b = hire("b", 100, {}, "USD", "accepted");
  const cl = companyLedger([a, b] as never, [], undefined, FEE_ON);
  const rows = cl.hires.map((h) => `${h.proposalId}:${h.currency}:${h.dueMinor}`);
  say("mixed currency", { rows: ["a:INR:2900000", "b:USD:35000"], remainingInr: 2_900_000 + 3_500_000 }, { rows, remainingInr: cl.totals.remainingInrMinor });
  assert.equal(cl.totals.remainingInrMinor, 2_900_000 + 3_500_000);
  assert.notEqual(cl.totals.remainingInrMinor, 2_900_000 + 35_000, "must not add dollars to rupees");
});

/* ── 2. Totals vs the rows that are visible ─────────────────────────── */

test("company 360 totals: billed = paid + remaining, remaining = sum of the per-hire due rows, across three hires", () => {
  const hires = [hire("a", 8000), hire("b", 5000), hire("c", 15000)];
  const orders = [order("o1", 3 * 800_000 + 500_000, ["a"], "total", { perHireFeeMinor: { a: 500_000 } }), order("o2", 500_000 + 500_000, ["b"], "monthly", { perHireFeeMinor: { b: 500_000 } })];
  const cl = companyLedger(hires as never, orders as never, undefined, FEE_ON);
  const rowsDue = cl.hires.reduce((s, h) => s + toInrMinor(h.dueMinor, h.currency), 0);
  const rowsPaid = cl.hires.reduce((s, h) => s + toInrMinor(h.paidMinor, h.currency), 0);
  say("360 totals", { remaining: money(rowsDue), paid: money(rowsPaid), billed: money(rowsDue + rowsPaid) }, { remaining: money(cl.totals.remainingInrMinor), paid: money(cl.totals.paidInrMinor), billed: money(cl.totals.billedInrMinor) });
  assert.equal(cl.totals.remainingInrMinor, rowsDue);
  assert.equal(cl.totals.paidInrMinor, rowsPaid, "paid total = sum of the hire rows' paid");
  assert.equal(cl.totals.billedInrMinor, cl.totals.paidInrMinor + cl.totals.remainingInrMinor);
  for (const h of cl.hires) assert.equal(h.paidMinor + h.dueMinor, h.totalMinor, `${h.proposalId}: paid + due = total`);
});

test("a multi-hire order's amount is split across its hires with no paisa lost or invented", () => {
  const hires = [hire("a", 8000), hire("b", 5000), hire("c", 15000)];
  const total = 3 * 800_000 + 3 * 500_000 + 3 * 1_500_000 + 3 * 500_000 - 7; // an odd amount: forces rounding
  const o = order("o1", total, ["a", "b", "c"], "total");
  const cl = companyLedger(hires as never, [o] as never, undefined, FEE_ON);
  const paidRows = cl.hires.reduce((s, h) => s + h.paidMinor, 0);
  say("split", total, paidRows);
  assert.equal(paidRows, total);
  assert.equal(cl.totals.paidInrMinor, total);
});

test("a payment that names a proposal this company does not have is still counted in 'paid' (visible in the payments list), never silently dropped", () => {
  const hires = [hire("a", 8000)];
  const o = order("o1", 123_456, ["ghost"], "total");
  const cl = companyLedger(hires as never, [o] as never, undefined, FEE_ON);
  say("orphan payment", { paid: 123_456 }, { paid: cl.totals.paidInrMinor });
  assert.equal(cl.totals.paidInrMinor, 123_456);
});

/* ── 3. Promo, refunds, GST ─────────────────────────────────────────── */

test("promo: ₹2,000 off an ₹8,000 x 3 + ₹5,000 hire: total ₹27,000, paid ₹27,000, due 0, and 'fee' is still ₹5,000", () => {
  const H = hire("h1", 8000);
  const o = order("o1", 2_700_000, ["h1"], "total", { perHireFeeMinor: { h1: 500_000 } });
  (o.raw as Record<string, unknown>).promo = { code: "SAVE2K", discountMinor: 200_000 };
  const pl = placementLedger(H as never, [o] as never);
  say("promo", { total: "₹27,000", paid: "₹27,000", due: "0", fee: "₹5,000" }, { total: money(pl.totalMinor), paid: money(pl.paidMinor), due: money(pl.dueMinor), fee: money(pl.feeMinor) });
  assert.equal(pl.totalMinor, 2_700_000);
  assert.equal(pl.paidMinor, 2_700_000);
  assert.equal(pl.dueMinor, 0);
  assert.equal(pl.feeMinor, 500_000);
  assert.equal(pl.totalMinor, o.amountMinor, "ledger total equals the money actually charged");
});

test("promo on a monthly plan: the discount lowers the total and 'paid' by the same figure, so due is unchanged (₹16,000)", () => {
  const H = hire("h1", 8000);
  const o = order("o1", 1_300_000 - 100_000, ["h1"], "monthly", { perHireFeeMinor: { h1: 500_000 } });
  (o.raw as Record<string, unknown>).promo = { code: "SAVE1K", discountMinor: 100_000 };
  const pl = placementLedger(H as never, [o] as never);
  say("promo monthly", { paid: "₹12,000", due: "₹16,000", total: "₹28,000" }, { paid: money(pl.paidMinor), due: money(pl.dueMinor), total: money(pl.totalMinor) });
  assert.equal(pl.paidMinor, 1_200_000);
  assert.equal(pl.dueMinor, 1_600_000);
  assert.equal(pl.paidMinor, o.amountMinor, "paid equals the charge");
});

test("OBSERVATION (read): there is no refund model in the money views: a refunded or failed employer order is simply not 'paid'", () => {
  const H = hire("h1", 8000, {}, "INR", "accepted");
  for (const status of ["refunded", "failed", "created", "partially_refunded"]) {
    const o = { ...order("o1", 2_900_000, ["h1"], "total"), status };
    const f = figures(H, [o]);
    say(`order ${status}`, "treated as unpaid: ₹29,000 still to collect", money(f.listDue));
    assert.equal(f.listDue, 2_900_000);
    assert.equal(f.ledgerPaid, 0);
  }
});

test("GST is inclusive: the employer pays exactly the quoted amount; 8,000 / 5,000 / 15,000 split into base + 18% and add back to the same total, to the paisa", () => {
  const rows: string[] = [];
  for (const total of [800_000, 500_000, 1_500_000, 2_900_000, 833_333, 1_234_567]) {
    for (const place of ([{ kind: "india", stateCode: "08", stateName: "Rajasthan" }, { kind: "india", stateCode: "27", stateName: "Maharashtra" }, { kind: "export" }] as PlaceOfSupply[])) {
      const s = splitGst(total, place);
      assert.equal(s.baseMinor + s.cgstMinor + s.sgstMinor + s.igstMinor, total, `${total} ${place.kind}`);
      assert.equal(s.totalMinor, total);
      if (place.kind === "india" && place.stateCode === "08") assert.ok(Math.abs(s.cgstMinor - s.sgstMinor) <= 1);
      if (place.kind === "export") assert.equal(s.baseMinor, total, "no GST on export");
    }
    const s = splitGst(total, { kind: "india", stateCode: "27", stateName: "Maharashtra" });
    rows.push(`${money(total)} = ${money(s.baseMinor)} + IGST ${money(s.igstMinor)}`);
  }
  console.log(rows.join("\n"));
  // 18% of the ex-GST base: 800000 / 1.18 = 677966.10 -> base 677,966, tax 122,034.
  const s8 = splitGst(800_000, { kind: "india", stateCode: "27", stateName: "Maharashtra" });
  assert.deepEqual([s8.baseMinor, s8.igstMinor], [677_966, 122_034]);
  assert.equal(placeOfSupply({ currency: "USD" } as never).kind, "export");
});

test("OPEN QUESTION (confirmed by code): the hiring fee is not taxed separately; ₹5,000 is the GST-inclusive fee (₹4,237.29 + ₹762.71 GST on the invoice)", () => {
  const s = splitGst(500_000, { kind: "india", stateCode: "27", stateName: "Maharashtra" });
  assert.deepEqual([s.baseMinor, s.igstMinor], [423_729, 76_271]);
});

/* ── 4. Money in / out report ───────────────────────────────────────── */

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

test("report tiles equal the sum of the visible rows, USD rows counted at ₹100/$ and shown in their own currency", () => {
  const data = computeReceivables(
    reportBase({
      employerPayments: [order("o1", 2_900_000, ["a"], "total"), order("o2", 10_000, ["b"], "total", {}, "USD")] as never,
      payouts: [
        { id: "p1", internId: "i1", status: "paid", amountMinor: 800_000, currency: "INR", referenceId: "r1", paidAt: new Date("2026-12-02T05:00:00Z"), createdAt: null, raw: {} },
        { id: "p2", internId: "i2", status: "pending", amountMinor: 1_500_000, currency: "INR", referenceId: null, paidAt: null, createdAt: new Date("2026-12-01T00:00:00Z"), raw: { scheduledFor: "2026-12-05" } },
      ],
    }),
    { receivables: "both", payables: "both" },
  );
  const sum = (rows: MoneyRow[], st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + r.inrMinor, 0);
  say("tiles", { received: money(2_900_000 + 1_000_000), paidOut: money(800_000), owed: money(1_500_000) }, { received: money(data.totals.receivedMinor), paidOut: money(data.totals.paidOutMinor), owed: money(data.totals.owedMinor) });
  assert.equal(data.totals.receivedMinor, 2_900_000 + 1_000_000, "₹29,000 + $100 (= ₹10,000)");
  assert.equal(data.totals.paidOutMinor, 800_000);
  assert.equal(data.totals.owedMinor, 1_500_000);
  assert.deepEqual(data.totals, {
    receivedMinor: sum(data.receivables, ["received"]),
    dueMinor: sum(data.receivables, ["due", "upcoming"]),
    prospectMinor: sum(data.receivables, ["unpaid"]),
    paidOutMinor: sum(data.payables, ["paid"]),
    owedMinor: sum(data.payables, ["pending", "upcoming"]),
  });
  assert.deepEqual(moneyTotals(data.receivables, data.payables), data.totals);
});

test("report date range uses IST days: a payment at 2026-11-30T19:00Z (1 Dec IST) is in December, not November", () => {
  const o = order("o1", 800_000, ["a"], "total", {}, "INR", "2026-11-30T19:00:00Z");
  const dec = computeReceivables(reportBase({ since: new Date("2026-11-30T18:30:00Z"), until: new Date("2026-12-31T18:30:00Z"), employerPayments: [o] as never }), { receivables: "both", payables: "both" });
  const nov = computeReceivables(reportBase({ since: new Date("2026-10-31T18:30:00Z"), until: new Date("2026-11-30T18:30:00Z"), employerPayments: [o] as never }), { receivables: "both", payables: "both" });
  say("range", { december: 1, november: 0, rowDate: "2026-12-01" }, { december: dec.receivables.length, november: nov.receivables.length, rowDate: dec.receivables[0]?.date });
  assert.equal(dec.receivables.length, 1);
  assert.equal(dec.receivables[0].date, "2026-12-01");
  assert.equal(nov.receivables.length, 0);
});

test("accepted-but-unpaid hire appears once in the report (due), and a paid hire never also shows as due", () => {
  const accepted = hire("a", 8000, {}, "INR", "accepted");
  const paidHire = hire("b", 5000);
  const o = order("o1", 2_000_000, ["b"], "total", { perHireFeeMinor: { b: 500_000 } });
  const rec = computeReceivables(reportBase({ proposals: [accepted, paidHire] as never, employerPayments: [o] as never, feeSetting: FEE_ON }), { receivables: "company", payables: "company" });
  const due = rec.receivables.filter((r) => r.status === "due" || r.status === "upcoming");
  say("report rows", ["due:a ₹29,000"], due.map((r) => `${r.id} ${money(r.inrMinor)}`));
  assert.deepEqual(due.map((r) => r.id), ["due:a"]);
  assert.equal(due[0].inrMinor, 2_900_000);
  const fee = acceptedLineCharge(parseOffer(accepted.offerDetails, "INR"), "upfront", { feeSetting: FEE_ON }).totalMinor;
  assert.equal(fee, 2_900_000);
});
