import assert from "node:assert/strict";
import { test } from "node:test";

import { paginate, promoRedemptionsCsv, sortPromos, totalDiscountInrMinor, type PromoListRow, type Redemption } from "./promo-redemptions.ts";

const r = (over: Partial<Redemption> = {}): Redemption => ({
  who: "Acme Pvt Ltd", email: "hr@acme.test", kind: "employer", orderId: "order_1", currency: "INR",
  orderAmountMinor: 84_480_00, discountMinor: 21_120_00, redeemedAt: new Date("2026-11-17T10:00:00Z"), ...over,
});

test("total discount sums INR paise and converts USD cents at 100 INR per dollar", () => {
  assert.equal(totalDiscountInrMinor([]), 0);
  assert.equal(totalDiscountInrMinor([r({ discountMinor: 500_00 }), r({ currency: "USD", discountMinor: 50_00 })]), 500_00 + 50_00 * 100);
});

test("csv: header, IST time, major units with 2 decimals, quoting, and no spreadsheet formulas", () => {
  const csv = promoRedemptionsCsv("PCT20", [
    r(),
    r({ who: '=HYPERLINK("http://x","y")', email: null, kind: "intern", currency: "USD", orderAmountMinor: 12_345, discountMinor: 2_469, orderId: "o,2" }),
  ]);
  const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
  assert.equal(lines[0], "Code,Redeemed at (IST),Who,Email,Type,Order id,Currency,Order amount,Discount");
  assert.equal(lines[1], "PCT20,2026-11-17 15:30:00,Acme Pvt Ltd,hr@acme.test,Company,order_1,INR,84480.00,21120.00");
  assert.ok(lines[2].startsWith(`PCT20,2026-11-17 15:30:00,"'=HYPERLINK(""http://x"",""y"")",,Intern,"o,2",USD,123.45,24.69`));
});

test("csv of nothing is just the header", () => {
  assert.equal(promoRedemptionsCsv("X", []).replace(/^\uFEFF/, "").trim().split("\r\n").length, 1);
});

const p = (code: string, used: number, until: string | null, created: string): PromoListRow => ({ code, usedCount: used, validUntil: until ? new Date(until) : null, createdAt: new Date(created) });
const rows = [p("B", 2, null, "2026-01-02"), p("A", 9, "2026-12-01", "2026-01-01"), p("C", 0, "2026-11-20", "2026-01-03")];

test("sort: newest, most used, code A-Z, ending soonest (no end date last)", () => {
  assert.deepEqual(sortPromos(rows, "newest").map((x) => x.code), ["C", "B", "A"]);
  assert.deepEqual(sortPromos(rows, "used").map((x) => x.code), ["A", "B", "C"]);
  assert.deepEqual(sortPromos(rows, "code").map((x) => x.code), ["A", "B", "C"]);
  assert.deepEqual(sortPromos(rows, "ending").map((x) => x.code), ["C", "A", "B"]);
  assert.deepEqual(rows.map((x) => x.code), ["B", "A", "C"], "input is not mutated");
});

test("paginate: 25 per page, clamps the page, reports the range", () => {
  const many = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual(paginate(many, 1, 25), { items: many.slice(0, 25), page: 1, pages: 3, from: 1, to: 25, total: 53 });
  assert.deepEqual(paginate(many, 3, 25), { items: many.slice(50), page: 3, pages: 3, from: 51, to: 53, total: 53 });
  assert.equal(paginate(many, 9, 25).page, 3);
  assert.deepEqual(paginate([], 1, 25), { items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
});
