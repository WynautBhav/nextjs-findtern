import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ageInDays,
  comparePayouts,
  compareStuck,
  compareWhen,
  dueDay,
  failedGroup,
  fullName,
  groupByQueue,
  joinParts,
  offerAmountMinorInr,
  overdueDays,
  QUEUE_ORDER,
  topRecords,
  totalOf,
  totalOwed,
  truncate,
} from "./dashboard-queues-pure.ts";
import type { QueueGroup, QueueRecord } from "./dashboard-queues.types.ts";

const NOW = new Date("2026-11-03T06:00:00Z"); // 11:30 IST, 3 Nov

const rec = (queue: QueueRecord["queue"], id: string, extra: Partial<QueueRecord> = {}): QueueRecord => ({
  id: `${queue}:${id}`,
  queue,
  title: id,
  subtitle: "",
  amountMinorInr: null,
  ageDays: null,
  when: null,
  href: "/x",
  props: [],
  ...extra,
});

test("fullName trims and falls back", () => {
  assert.equal(fullName("  Ira ", " Zug "), "Ira Zug");
  assert.equal(fullName("Ira", null), "Ira");
  assert.equal(fullName("", "  "), "Candidate");
  assert.equal(fullName(null, undefined, "Unknown sender"), "Unknown sender");
});

test("truncate cuts at 80 with an ellipsis and collapses whitespace", () => {
  assert.equal(truncate("  Hello \n  there "), "Hello there");
  const long = "a".repeat(120);
  const out = truncate(long, 80);
  assert.equal(out.length, 80);
  assert.ok(out.endsWith("…"));
  assert.equal(truncate(null), "");
});

test("joinParts drops empty parts", () => {
  assert.equal(joinParts("Brightwell US", "", null, "due 5 Nov"), "Brightwell US · due 5 Nov");
  assert.equal(joinParts("", undefined), "");
});

test("ageInDays counts whole days and never goes negative", () => {
  assert.equal(ageInDays(new Date("2026-10-31T06:00:00Z"), NOW), 3);
  assert.equal(ageInDays("2026-11-02T10:00:00Z", NOW), 0);
  assert.equal(ageInDays(new Date("2026-11-10T00:00:00Z"), NOW), 0);
  assert.equal(ageInDays(null, NOW), null);
  assert.equal(ageInDays("not a date", NOW), null);
});

test("overdueDays is IST-day based; a due date in the future is 0, none is null", () => {
  assert.equal(overdueDays("2026-11-03", NOW), 0);
  assert.equal(overdueDays("2026-11-01", NOW), 2);
  assert.equal(overdueDays("2026-11-05", NOW), 0); // due later
  assert.equal(overdueDays("2026-11-01T00:00:00.000Z", NOW), 2);
  assert.equal(overdueDays("", NOW), null);
  assert.equal(overdueDays(undefined, NOW), null);
  assert.equal(overdueDays("2026-13-45", NOW), null);
  // 23:30 IST on 3 Nov is still 3 Nov in India even though UTC says 3 Nov 18:00.
  assert.equal(overdueDays("2026-11-03", new Date("2026-11-03T18:00:00Z")), 0);
  // 00:30 IST on 4 Nov: a 3 Nov due date is now 1 day overdue.
  assert.equal(overdueDays("2026-11-03", new Date("2026-11-03T19:00:00Z")), 1);
});

test("dueDay accepts only real days", () => {
  assert.equal(dueDay("2026-11-03"), "2026-11-03");
  assert.equal(dueDay(" 2026-11-03T00:00:00Z"), "2026-11-03");
  assert.equal(dueDay("03/11/2026"), null);
  assert.equal(dueDay(42), null);
});

test("offerAmountMinorInr: INR monthly offer is the engagement plus the hiring fee", () => {
  // 3 months at 26,400 a month, standard fee 5,000: (79,200 + 5,000) rupees in paise.
  const inr = offerAmountMinorInr({ monthlyAmount: 26400, duration: "3m" }, "INR");
  assert.equal(inr, (26400 * 3 + 5000) * 100);
});

test("offerAmountMinorInr: a stored total already carries the fee", () => {
  const inr = offerAmountMinorInr({ totalPrice: 24000, monthlyAmount: 7000, duration: "3m", perHireCharge: 3000 }, "INR");
  assert.equal(inr, (24000 - 3000 + 3000) * 100);
});

test("offerAmountMinorInr: a USD offer converts at the business rate", () => {
  // $1,000 a month for 2 months plus the $50 fee = $2,050 = 205,000 cents = 20,500,000 paise.
  const inr = offerAmountMinorInr({ monthlyAmount: 1000, duration: "2m" }, "USD");
  assert.equal(inr, 20_500_000);
});

test("offerAmountMinorInr: a full-time offer is the 8.33% fee on the annual CTC", () => {
  const inr = offerAmountMinorInr({ fullTimeOffer: { annualCtc: 1_200_000 } }, "INR");
  assert.equal(inr, 9_996_000); // 99,960 rupees in paise
});

test("offerAmountMinorInr: an unparseable or unpriced offer is null, never 0", () => {
  assert.equal(offerAmountMinorInr(null, "INR"), null);
  assert.equal(offerAmountMinorInr(undefined, "INR"), null);
  assert.equal(offerAmountMinorInr("garbage", "INR"), null);
  assert.equal(offerAmountMinorInr([], "INR"), null);
  assert.equal(offerAmountMinorInr({}, "INR"), null);
  assert.equal(offerAmountMinorInr({ monthlyAmount: "abc", totalPrice: "x" }, "INR"), null);
  assert.equal(offerAmountMinorInr({ monthlyAmount: 0 }, "INR"), null);
  assert.equal(offerAmountMinorInr({ fullTimeOffer: {} }, "INR"), null);
});

test("comparePayouts: most overdue first, then largest, unknown age last, stable by id", () => {
  const rows = [
    { id: "a", ageDays: 0, amountMinorInr: 900 },
    { id: "b", ageDays: 5, amountMinorInr: 100 },
    { id: "c", ageDays: 5, amountMinorInr: 700 },
    { id: "d", ageDays: null, amountMinorInr: 9999 },
    { id: "e", ageDays: 5, amountMinorInr: 700 },
  ];
  assert.deepEqual(
    [...rows].sort(comparePayouts).map((r) => r.id),
    ["c", "e", "b", "a", "d"],
  );
});

test("compareStuck: longest waiting first", () => {
  const rows = [
    { id: "a", ageDays: 2, amountMinorInr: 5 },
    { id: "b", ageDays: 9, amountMinorInr: null },
    { id: "c", ageDays: 9, amountMinorInr: 50 },
  ];
  assert.deepEqual(
    [...rows].sort(compareStuck).map((r) => r.id),
    ["c", "b", "a"],
  );
});

test("compareWhen: soonest first, missing last", () => {
  const rows = [
    { id: "a", when: "2026-11-05T10:00:00Z" },
    { id: "b", when: null },
    { id: "c", when: "2026-11-04T10:00:00Z" },
  ];
  assert.deepEqual(
    [...rows].sort(compareWhen).map((r) => r.id),
    ["c", "a", "b"],
  );
});

test("topRecords orders then caps at 6, and copes with zero records", () => {
  const many = Array.from({ length: 10 }, (_, i) => rec("payouts", String(i), { ageDays: i }));
  const top = topRecords(many, comparePayouts);
  assert.equal(top.length, 6);
  assert.equal(top[0].ageDays, 9);
  assert.deepEqual(topRecords([], comparePayouts), []);
  // The input is not mutated.
  assert.equal(many[0].ageDays, 0);
});

test("totalOwed sums priced offers and counts unparseable ones", () => {
  assert.deepEqual(totalOwed([{ amountMinorInr: 1000 }, { amountMinorInr: null }, { amountMinorInr: 250 }]), {
    owedByEmployersMinor: 1250,
    employerOfferCount: 3,
  });
  assert.deepEqual(totalOwed([]), { owedByEmployersMinor: 0, employerOfferCount: 0 });
  assert.deepEqual(totalOwed([{ amountMinorInr: null }]), { owedByEmployersMinor: 0, employerOfferCount: 1 });
});

test("groupByQueue keeps every queue present, in the rail's order", () => {
  assert.deepEqual(QUEUE_ORDER, ["calendar", "payouts", "nolink", "unscored", "messages", "accepted", "sheets"]);
  const g = groupByQueue([rec("sheets", "1"), rec("payouts", "2"), rec("payouts", "3")]);
  assert.deepEqual(Object.keys(g), QUEUE_ORDER);
  assert.equal(g.payouts.length, 2);
  assert.equal(g.sheets.length, 1);
  assert.equal(g.calendar.length, 0);
  assert.equal(groupByQueue([]).messages.length, 0);
});

const group = (key: QueueGroup["key"], count: number, fresh = 0, extra: Partial<QueueGroup> = {}): QueueGroup => ({
  key,
  label: key,
  detail: "",
  count,
  fresh,
  moreHref: "/",
  moreLabel: "",
  records: [],
  ...extra,
});

test("totalOf matches attentionTotal: sums counts, fresh capped at count", () => {
  assert.deepEqual(totalOf([group("payouts", 14, 3), group("calendar", 1, 0, { flag: true }), group("messages", 2, 9)]), { total: 17, fresh: 5 });
  assert.deepEqual(totalOf([]), { total: 0, fresh: 0 });
  assert.deepEqual(totalOf([group("payouts", 0), group("sheets", 0)]), { total: 0, fresh: 0 });
});

test("a failed queue adds nothing to the total and is flagged, not zero", () => {
  const failed = failedGroup({ key: "payouts", label: "Stipend payouts due", detail: "", moreHref: "/", moreLabel: "" });
  assert.equal(failed.error, true);
  assert.equal(failed.count, 0);
  assert.deepEqual(failed.records, []);
  assert.deepEqual(totalOf([failed, group("messages", 4, 1)]), { total: 4, fresh: 1 });
});
