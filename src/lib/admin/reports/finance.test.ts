import assert from "node:assert/strict";
import { test } from "node:test";

import { ledgerTotals, netMinor, type LedgerRow } from "../revenue.ts";
import { moneyTotals, type MoneyRow } from "../receivables.ts";
import { gstInclusive, isWaivedOrder, shapeFinance, shapePayouts, type PayGroup } from "./finance.ts";

/** One payment as the database holds it, before grouping. */
type Row = { id: string; kind: "employer" | "intern"; status: string; currency: string; gateway: string; method?: string; amountMinor: number; discountMinor?: number; promo?: boolean; refundedMinor?: number; test?: boolean };

const FIXTURE: Row[] = [
  { id: "e1", kind: "employer", status: "paid", currency: "INR", gateway: "razorpay", amountMinor: 1_000_000 },
  { id: "e2", kind: "employer", status: "paid", currency: "INR", gateway: "razorpay", amountMinor: 500_000, discountMinor: 50_000, promo: true },
  { id: "e3", kind: "employer", status: "paid", currency: "USD", gateway: "razorpay", amountMinor: 20_000 }, // $200 = Rs 20,000
  { id: "e4", kind: "employer", status: "refunded", currency: "INR", gateway: "razorpay", amountMinor: 300_000, refundedMinor: 300_000 },
  { id: "e5", kind: "employer", status: "partially_refunded", currency: "INR", gateway: "razorpay", amountMinor: 400_000, refundedMinor: 100_000 },
  { id: "e6", kind: "employer", status: "paid", currency: "INR", gateway: "free", amountMinor: 0, discountMinor: 250_000, promo: true }, // legacy full-waiver code
  { id: "e7", kind: "employer", status: "paid", currency: "INR", gateway: "promo_full_waiver", method: "promo_full_waiver", amountMinor: 0, discountMinor: 600_000, promo: true }, // the new flag
  { id: "e8", kind: "employer", status: "created", currency: "INR", gateway: "razorpay", amountMinor: 700_000 },
  { id: "e9", kind: "employer", status: "failed", currency: "INR", gateway: "razorpay", amountMinor: 800_000 },
  { id: "e10", kind: "employer", status: "paid", currency: "INR", gateway: "razorpay", amountMinor: 9_900_000, test: true }, // the internal "admin" employer
  { id: "i1", kind: "intern", status: "paid", currency: "INR", gateway: "razorpay", amountMinor: 249_900 },
  { id: "i2", kind: "intern", status: "paid", currency: "INR", gateway: "razorpay", amountMinor: 199_900, discountMinor: 50_000, promo: true },
  { id: "i3", kind: "intern", status: "paid", currency: "INR", gateway: "college_drive", amountMinor: 0 }, // college waiver: not money
  { id: "i4", kind: "intern", status: "paid", currency: "USD", gateway: "razorpay", amountMinor: 3_000 }, // $30
  { id: "i5", kind: "intern", status: "created", currency: "INR", gateway: "razorpay", amountMinor: 249_900 },
];

const isWaived = (r: Row) => isWaivedOrder({ gateway: r.gateway, method: r.method, amountMinor: r.amountMinor, promoCode: r.promo ? "X" : null, discountMinor: r.discountMinor });

/** What the SQL GROUP BY returns: one row per (kind, status, currency, gateway, method, zero, promo). Test employers are filtered in SQL, so they are not here. */
function group(rows: Row[]): PayGroup[] {
  const by = new Map<string, PayGroup>();
  for (const r of rows.filter((x) => !x.test)) {
    const k = [r.kind, r.status, r.currency, r.gateway, r.method ?? "", r.amountMinor === 0, Boolean(r.promo)].join("|");
    const g = by.get(k) ?? { kind: r.kind, status: r.status, currency: r.currency, gateway: r.gateway, method: r.method ?? "", zero: r.amountMinor === 0, promo: Boolean(r.promo), count: 0, amountMinor: 0, discountMinor: 0 };
    g.count += 1;
    g.amountMinor += r.amountMinor;
    g.discountMinor += r.discountMinor ?? 0;
    by.set(k, g);
  }
  return [...by.values()];
}

const toLedger = (r: Row): LedgerRow => ({ id: r.id, status: r.status, amountMinor: r.amountMinor, currency: r.currency, discountMinor: r.discountMinor ?? 0, refundedMinor: r.refundedMinor ?? 0 });

test("isWaivedOrder: the new flag, the legacy free code and a zero-amount coded order are waived; a real ₹0 free order is not; a paid order is not", () => {
  assert.equal(isWaivedOrder({ gateway: "promo_full_waiver", amountMinor: 0 }), true);
  assert.equal(isWaivedOrder({ gateway: "razorpay", method: "promo_full_waiver", amountMinor: 0 }), true);
  assert.equal(isWaivedOrder({ gateway: "free", amountMinor: 0, promoCode: "FREE100", discountMinor: 5000 }), true);
  assert.equal(isWaivedOrder({ gateway: "razorpay", amountMinor: 0, promoCode: "FULL" }), true);
  assert.equal(isWaivedOrder({ gateway: "free", amountMinor: 0 }), true);
  assert.equal(isWaivedOrder({ gateway: "razorpay", amountMinor: 0 }), false);
  assert.equal(isWaivedOrder({ gateway: "razorpay", amountMinor: 1000, promoCode: "TEN", discountMinor: 100 }), false);
  assert.equal(isWaivedOrder({ gateway: "razorpay", amountMinor: 100 }), false);
});

test("isWaivedOrder works whether or not the flag exists: only a string compare, no throw on missing fields", () => {
  assert.equal(isWaivedOrder({}), false);
  assert.equal(isWaivedOrder({ gateway: null, method: null, amountMinor: null }), false);
  assert.equal(isWaivedOrder({ gateway: " PROMO_FULL_WAIVER ", amountMinor: 0 }), true);
});

test("collected, discount and refunds equal the existing ledgerTotals over the same rows (employer side)", () => {
  const employerRows = FIXTURE.filter((r) => r.kind === "employer");
  const ledger = ledgerTotals(employerRows.map(toLedger), new Set(employerRows.filter((r) => r.test).map((r) => r.id)));
  const f = shapeFinance(group(employerRows), { refundedMinor: 400_000 });
  // value reconciles exactly; the count excludes waived rows, which ledgerTotals counts (they are paid rows of value 0)
  assert.equal(f.employer.collected.inrMinor, ledger.collectedMinor);
  assert.equal(f.employer.collected.count + f.waived.employer, ledger.collectedCount);
  assert.equal(f.discountMinor.employer, ledger.discountMinor);
  assert.equal(f.refundedMinor, ledger.refundedMinor);
  assert.equal(f.netCollectedMinor, ledger.netCollectedMinor);
  assert.equal(f.employer.notCollected.inrMinor, ledger.notCollectedMinor);
  assert.equal(f.employer.notCollected.count, ledger.notCollectedCount);
});

test("the whole-tab collected equals employer ledger + intern ledger (activation fees, drive waivers out), as the Money report's Received", () => {
  const employer = ledgerTotals(FIXTURE.filter((r) => r.kind === "employer").map(toLedger), new Set(["e10"]));
  // Intern fees: status paid, not a college-drive waiver (receivables-load paidReceipts)
  const internPaid = FIXTURE.filter((r) => r.kind === "intern" && r.status === "paid" && r.gateway !== "college_drive").map(toLedger);
  const intern = ledgerTotals(internPaid);
  const f = shapeFinance(group(FIXTURE), { refundedMinor: 0 });
  assert.equal(f.collectedMinor, employer.collectedMinor + intern.collectedMinor);
  assert.equal(f.intern.collected.inrMinor, intern.collectedMinor);

  // Money in/out "Received" is the same rows as receivable rows with status "received": reuse its own totals function.
  const asReceived: MoneyRow[] = [
    ...FIXTURE.filter((r) => !r.test && ["paid", "refunded", "partially_refunded"].includes(r.status) && !(r.kind === "intern" && r.gateway === "college_drive") && (r.kind === "employer" || r.status === "paid")).map((r) => ({ id: r.id, inrMinor: r.currency === "USD" ? r.amountMinor * 100 : r.amountMinor, status: "received" as const })),
  ] as unknown as MoneyRow[];
  assert.equal(f.collectedMinor, moneyTotals(asReceived, []).receivedMinor);
});

test("waived is its own figure and never in collected", () => {
  const f = shapeFinance(group(FIXTURE), { refundedMinor: 0 });
  assert.equal(f.waived.count, 2); // e6 (legacy free) + e7 (promo_full_waiver); i3 is a college waiver, shown apart
  assert.equal(f.waived.employer, 2);
  assert.equal(f.waived.listInrMinor, 250_000 + 600_000); // what they would have cost: amount 0 + discount
  assert.equal(f.waived.collegeDrive, 1);
  const withoutWaived = shapeFinance(group(FIXTURE.filter((r) => !isWaived(r))), { refundedMinor: 0 });
  assert.equal(f.collectedMinor, withoutWaived.collectedMinor);
});

test("waived list value is null when a waived order recorded no discount (count only)", () => {
  const f = shapeFinance(group([{ id: "x", kind: "employer", status: "paid", currency: "INR", gateway: "promo_full_waiver", amountMinor: 0, promo: true }]), { refundedMinor: 0 });
  assert.equal(f.waived.count, 1);
  assert.equal(f.waived.listInrMinor, null);
});

test("by currency: INR count and value, USD count, dollar value and INR equivalent at 100 per dollar; waivers and unpaid are not transactions", () => {
  const f = shapeFinance(group(FIXTURE), { refundedMinor: 0 });
  // INR paid/settled money rows: e1 e2 e4 e5 (employer) + i1 i2 (intern); waived e6 e7 and drive i3 are not transactions
  assert.equal(f.currency.INR.count, 6);
  assert.equal(f.currency.INR.minor, 1_000_000 + 500_000 + 300_000 + 400_000 + 249_900 + 199_900);
  assert.equal(f.currency.USD.count, 2);
  assert.equal(f.currency.USD.minor, 20_000 + 3_000);
  assert.equal(f.currency.USD.inrEquivalentMinor, (20_000 + 3_000) * 100);
  assert.equal(f.currency.INR.minor + f.currency.USD.inrEquivalentMinor, f.collectedMinor);
});

test("order status split: paid, refunded, partly refunded, unpaid, failed", () => {
  const f = shapeFinance(group(FIXTURE), { refundedMinor: 0 });
  const s = f.employer.byStatus;
  assert.equal(s.paid.count, 5); // e1 e2 e3 + the two waived (still paid rows)
  assert.equal(s.refunded.count, 1);
  assert.equal(s.partially_refunded.count, 1);
  assert.equal(s.unpaid.count, 1);
  assert.equal(s.failed.count, 1);
  assert.equal(s.failed.inrMinor, 800_000);
  assert.equal(f.employer.orders.count, 9); // every non-test employer row
});

test("GST: ₹ amounts are 18% inclusive, dollar orders are an export with none; the figure is derived per row", () => {
  assert.equal(gstInclusive(118_000, "INR"), 18_000);
  assert.equal(gstInclusive(249_900, "INR"), 249_900 - Math.round(249_900 / 1.18));
  assert.equal(gstInclusive(20_000, "USD"), 0);
  assert.equal(gstInclusive(0, "INR"), 0);
  const f = shapeFinance(group(FIXTURE), { refundedMinor: 0 });
  assert.ok(f.gstMinor > 0);
  // collected INR only
  const inrCollected = [1_000_000, 500_000, 300_000, 400_000, 249_900, 199_900].reduce((s, a) => s + gstInclusive(a, "INR"), 0);
  assert.equal(f.gstMinor, inrCollected);
});

test("nothing in, zeros out", () => {
  const f = shapeFinance([], { refundedMinor: 0 });
  assert.equal(f.collectedMinor, 0);
  assert.equal(f.currency.USD.count, 0);
  assert.equal(f.waived.listInrMinor, 0);
  assert.equal(f.netCollectedMinor, 0);
});

test("payouts: stipends and completion bonuses by status, INR equivalent, reconciling with the Payouts totals (paid + pending)", () => {
  const p = shapePayouts([
    { kind: "stipend", status: "paid", currency: "INR", count: 3, amountMinor: 3_000_000 },
    { kind: "stipend", status: "pending", currency: "INR", count: 2, amountMinor: 1_600_000 },
    { kind: "stipend", status: "failed", currency: "INR", count: 1, amountMinor: 800_000 },
    { kind: "completion_bonus", status: "paid", currency: "INR", count: 1, amountMinor: 100_000 },
  ]);
  assert.deepEqual(p.stipend.paid, { count: 3, inrMinor: 3_000_000 });
  assert.deepEqual(p.stipend.pending, { count: 2, inrMinor: 1_600_000 });
  assert.deepEqual(p.stipend.failed, { count: 1, inrMinor: 800_000 });
  assert.deepEqual(p.completionBonus.paid, { count: 1, inrMinor: 100_000 });
  // loadPayoutTotals: paid = status paid (all kinds), pending = status pending (all kinds)
  assert.equal(p.paidOutMinor, 3_100_000);
  assert.equal(p.pendingMinor, 1_600_000);
  // The Money report's net uses the same paidOut and owed
  assert.equal(netMinor({ receivedMinor: 5_000_000, paidOutMinor: p.paidOutMinor, owedMinor: p.pendingMinor }), 300_000);
});
