import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bucketByIstDay,
  bucketByIstMonth,
  fillBuckets,
  istDateRange,
  istDayKey,
  istDayKeys,
  istDayStart,
  istMonthKey,
  istMonthKeys,
  istMonthLabel,
  istMonthStart,
  istWeekdayLabel,
  ledgerTotals,
  netMinor,
  type LedgerRow,
} from "./revenue.ts";

test("IST day and month keys around midnight, whatever the host zone", () => {
  // 18:29:59Z is 23:59:59 IST, 18:30:00Z is 00:00:00 the next IST day.
  assert.equal(istDayKey("2026-11-01T18:29:59Z"), "2026-11-01");
  assert.equal(istDayKey("2026-11-01T18:30:00Z"), "2026-11-02");
  assert.equal(istDayKey(new Date("2026-11-01T00:00:00Z")), "2026-11-01");
  // Month edge: 30 Nov 18:30Z is 1 Dec IST; a UTC host would say November.
  assert.equal(istMonthKey("2026-11-30T18:29:59Z"), "2026-11");
  assert.equal(istMonthKey("2026-11-30T18:30:00Z"), "2026-12");
  // Year edge.
  assert.equal(istDayKey("2026-12-31T20:00:00Z"), "2027-01-01");
  assert.equal(istMonthKey("2026-12-31T20:00:00Z"), "2027-01");
  assert.equal(istDayKey("nope"), null);
  assert.equal(istDayKey(null), null);
});

test("day and month starts invert the keys", () => {
  assert.equal(istDayStart("2026-11-02").toISOString(), "2026-11-01T18:30:00.000Z");
  assert.equal(istMonthStart("2026-12").toISOString(), "2026-11-30T18:30:00.000Z");
  for (const k of ["2026-03-01", "2026-12-31", "2028-02-29"]) assert.equal(istDayKey(istDayStart(k)), k);
  assert.equal(istDayKey(new Date(istDayStart("2026-11-02").getTime() - 1)), "2026-11-01");
});

test("key windows end on the IST today, not the host's", () => {
  // 19:00Z on 31 Oct is already 1 Nov in India.
  const now = new Date("2026-10-31T19:00:00Z");
  assert.deepEqual(istDayKeys(now, 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(istDayKeys(now, 7)[6], "2026-11-01");
  assert.deepEqual(istMonthKeys(now, 3), ["2026-09", "2026-10", "2026-11"]);
  // Year wrap and 6-month window.
  assert.deepEqual(istMonthKeys(new Date("2027-01-15T00:00:00Z"), 6), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  // Month length does not matter when stepping days back from 1 March.
  assert.deepEqual(istDayKeys(new Date("2027-03-01T00:00:00Z"), 2), ["2027-02-28", "2027-03-01"]);
});

test("labels come from the key, not the host zone", () => {
  assert.equal(istMonthLabel("2026-09"), "Sep");
  assert.equal(istMonthLabel("2026-12"), "Dec");
  assert.equal(istWeekdayLabel("2026-11-02"), "Mon");
});

test("bucketByIstDay / Month put a 23:30 IST sale on its own day and month", () => {
  const rows = [
    { at: "2026-11-30T18:00:00Z", amountMinor: 100 }, // 30 Nov 23:30 IST
    { at: "2026-11-30T19:00:00Z", amountMinor: 50 }, // 1 Dec 00:30 IST
    { at: new Date("2026-12-01T05:00:00Z"), amountMinor: 3, currency: "USD" }, // 1 Dec, $3 = ₹300
    { at: null, amountMinor: 999 },
  ];
  const days = bucketByIstDay(rows);
  assert.deepEqual(days.get("2026-11-30"), { totalMinor: 100, count: 1 });
  assert.deepEqual(days.get("2026-12-01"), { totalMinor: 350, count: 2 });
  assert.equal(days.size, 2);
  const months = bucketByIstMonth(rows);
  assert.deepEqual(months.get("2026-11"), { totalMinor: 100, count: 1 });
  assert.deepEqual(months.get("2026-12"), { totalMinor: 350, count: 2 });
});

test("fillBuckets zero-fills and drops keys outside the window", () => {
  const b = bucketByIstMonth([{ at: "2026-10-10T00:00:00Z", amountMinor: 5 }, { at: "2025-01-01T00:00:00Z", amountMinor: 9 }]);
  assert.deepEqual(fillBuckets(["2026-09", "2026-10"], b), [
    { key: "2026-09", totalMinor: 0, count: 0 },
    { key: "2026-10", totalMinor: 5, count: 1 },
  ]);
});

test("istDateRange reads India dates, end inclusive", () => {
  const r = istDateRange("2026-11-01", "2026-11-30");
  assert.equal(r.since?.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(r.until?.toISOString(), "2026-11-30T18:30:00.000Z");
  assert.deepEqual(istDateRange("garbage", undefined), { since: null, until: null });
  assert.equal(istDateRange(undefined, "2026-12-31").since, null);
});

test("ledgerTotals: collected is paid payment rows only, flag-only rows are not money", () => {
  const rows: LedgerRow[] = [
    { id: "a", status: "paid", amountMinor: 1000, currency: "INR", discountMinor: 100 },
    { id: "b", status: "paid", amountMinor: 2, currency: "USD", discountMinor: 1 }, // ₹200, discount ₹100
    { id: "free", status: "paid", amountMinor: 0, currency: "INR" },
    { id: "flag-x", status: "paid", amountMinor: 5000, currency: "INR", discountMinor: 500, flagOnly: true },
    { id: "c", status: "created", amountMinor: 700, currency: "INR" },
    { id: "d", status: "failed", amountMinor: 300, currency: "INR" },
    { id: "test", status: "paid", amountMinor: 9000, currency: "INR" },
  ];
  const t = ledgerTotals(rows, new Set(["test"]));
  assert.equal(t.collectedMinor, 1200);
  assert.equal(t.collectedCount, 3);
  assert.equal(t.discountMinor, 200);
  assert.equal(t.notCollectedMinor, 1000);
  assert.equal(t.notCollectedCount, 2);
  assert.equal(t.markedPaidCount, 1);
});

test("ledgerTotals of nothing is zero", () => {
  assert.deepEqual(ledgerTotals([]), { collectedMinor: 0, collectedCount: 0, discountMinor: 0, notCollectedMinor: 0, notCollectedCount: 0, markedPaidCount: 0 });
});

test("net = received - paid out - owed", () => {
  assert.equal(netMinor({ receivedMinor: 10_000, paidOutMinor: 3_000, owedMinor: 2_500 }), 4_500);
  assert.equal(netMinor({ receivedMinor: 0, paidOutMinor: 100, owedMinor: 50 }), -150);
});

// ── college seat batches are money received (B-3) ──────────────────────

test("paid college batches become IST receipts; pending and void are ignored", async () => {
  const { collegeBatchReceipts, bucketByIstDay, bucketByIstMonth } = await import("./revenue.ts");
  const rows = [
    { id: "b1", collegeId: "c1", status: "paid", amountMinor: 24000000, invoiceNumber: "061126-1", paidAt: new Date("2026-11-05T19:00:00Z") }, // 6 Nov 00:30 IST
    { id: "b2", collegeId: "c1", status: "pending", amountMinor: 8000000, paidAt: null, createdAt: new Date("2026-11-05T10:00:00Z") },
    { id: "b3", collegeId: "c2", status: "void", amountMinor: 8000000, paidAt: null },
    { id: "b4", collegeId: "c2", status: "paid", amountMinor: 8000000, paidAt: null, createdAt: new Date("2026-10-31T20:00:00Z") }, // legacy: no paid_at, created 1 Nov IST
  ];
  const receipts = collegeBatchReceipts(rows);
  assert.deepEqual(receipts.map((r) => r.id), ["b1", "b4"]);
  const byDay = bucketByIstDay(receipts);
  assert.equal(byDay.get("2026-11-06")?.totalMinor, 24000000);
  assert.equal(byDay.get("2026-11-01")?.totalMinor, 8000000);
  assert.equal(bucketByIstMonth(receipts).get("2026-11")?.totalMinor, 32000000);
});

test("totals with college included: employer + intern + college receipts add up", async () => {
  const { collegeBatchReceipts, bucketByIstMonth } = await import("./revenue.ts");
  const employer = [{ at: new Date("2026-11-02T06:00:00Z"), amountMinor: 1000000, currency: "INR" }];
  const intern = [{ at: new Date("2026-11-03T06:00:00Z"), amountMinor: 249900, currency: "INR" }];
  const college = collegeBatchReceipts([{ id: "b1", collegeId: "c1", status: "paid", amountMinor: 8000000, paidAt: new Date("2026-11-04T06:00:00Z") }]);
  const month = bucketByIstMonth([...employer, ...intern, ...college]).get("2026-11");
  assert.equal(month?.totalMinor, 1000000 + 249900 + 8000000);
  assert.equal(month?.count, 3);
});

import { isMoneyReceived } from "./revenue.ts";

test("college-drive waiver rows are not money received; a paid gateway row still is", () => {
  const rows = [{ gateway: "razorpay" }, { gateway: "free" }, { gateway: "college_drive" }, {}];
  assert.deepEqual(rows.filter(isMoneyReceived).length, 3);
  assert.equal(isMoneyReceived({ gateway: "college_drive" }), false);
});
