import test from "node:test";
import assert from "node:assert/strict";

import {
  LIMITS,
  PAYOUT_HEAT_FACTOR_KEYS,
  PAYOUT_HEAT_GUIDE,
  WEIGHTS,
  amountPoints,
  bandCounts,
  duesHeatInput,
  heatBand,
  heatCsv,
  ledgerHeatInput,
  payoutHeat,
  sortByHeat,
} from "./payout-heat.ts";
import type { StipendDue } from "./stipend-dues.ts";

const today = "2026-11-28";
const rupees = (n: number) => n * 100;

test("every weight is in the guide once, and each guide row shows its weight", () => {
  assert.deepEqual([...PAYOUT_HEAT_FACTOR_KEYS].sort(), Object.keys(WEIGHTS).sort());
  assert.equal(PAYOUT_HEAT_GUIDE.factors.length, Object.keys(WEIGHTS).length);
  PAYOUT_HEAT_FACTOR_KEYS.forEach((k, i) => assert.match(PAYOUT_HEAT_GUIDE.factors[i].points, new RegExp(`^\\+${WEIGHTS[k]}\\b`)));
});

test("closed rows have no heat", () => {
  for (const status of ["paid", "failed", "cancelled"]) {
    const r = { status, raw: { scheduledFor: "2026-11-01" }, scheduledFor: "2026-11-01", paidAt: null, createdAt: new Date("2026-10-30"), inrMinor: rupees(20000) };
    assert.equal(payoutHeat(ledgerHeatInput(r, null), today), null);
  }
  const done = { remainingMinor: 0, monthlyShareMinor: rupees(10000) } as StipendDue;
  assert.equal(payoutHeat(duesHeatInput({ ...done, nextDate: null, aheadOfEmployer: false, pending: false, remainingMonths: 0 }, null), today), null);
  const noStipend = { remainingMinor: 0, monthlyShareMinor: 0, nextDate: "2026-11-01", aheadOfEmployer: false, pending: false, remainingMonths: 2 } as StipendDue;
  assert.equal(payoutHeat(duesHeatInput(noStipend, null), today), null);
});

test("worked examples score exactly as the guide adds up", () => {
  // Pending payout 12 days overdue, ₹15,000, no bank details: 40 + 3x10 (capped) + 25 + 5 = 100, Hot.
  const a = payoutHeat(
    ledgerHeatInput({ status: "pending", raw: { scheduledFor: "2026-11-16" }, scheduledFor: "2026-11-16", paidAt: null, createdAt: new Date("2026-11-01"), inrMinor: rupees(15000) }, "Intern has no bank details on file"),
    today,
  )!;
  assert.equal(a.score, WEIGHTS.overdue + WEIGHTS.perDayLate * LIMITS.lateDays + WEIGHTS.noBank + WEIGHTS.per10k);
  assert.equal(a.score, 100);
  assert.equal(a.level, "hot");
  assert.equal(a.why, "12 days overdue · no bank details · ₹15,000");

  // Placement month 2 days overdue, ₹10,000: 40 + 6 + 5 = 51, Warm.
  const due = (o: Partial<StipendDue>) =>
    ({ remainingMinor: rupees(20000), monthlyShareMinor: rupees(10000), remainingMonths: 2, nextDate: "2026-11-26", aheadOfEmployer: false, pending: false, ...o }) as StipendDue;
  const b = payoutHeat(duesHeatInput(due({}), null), today)!;
  assert.equal(b.score, 51);
  assert.equal(b.level, "warm");
  assert.equal(b.why, "2 days overdue · ₹10,000");

  // Due in 2 days, employer hasn't paid, ₹26,400 a month (2 full steps): 30 + 20 + 10 = 60, Warm.
  const c = payoutHeat(duesHeatInput(due({ monthlyShareMinor: rupees(26400), remainingMinor: rupees(52800), nextDate: "2026-11-30", aheadOfEmployer: true }), null), today)!;
  assert.equal(c.score, WEIGHTS.dueIn3Days + WEIGHTS.employerBehind + 2 * WEIGHTS.per10k);
  assert.equal(c.why, "Due in 2 days · employer hasn't paid this month · ₹26,400");

  // Due in 6 days, ₹8,000 (no full step), payout already created: 15, Calm.
  const d = payoutHeat(duesHeatInput(due({ monthlyShareMinor: rupees(8000), remainingMinor: rupees(8000), nextDate: "2026-12-04", pending: true }), null), today)!;
  assert.equal(d.score, WEIGHTS.dueIn7Days);
  assert.equal(d.level, "calm");
  assert.equal(d.why, "Due in 6 days · payout created, not marked paid · ₹8,000");

  // Month owed is the one-month cap, never the whole remaining balance.
  assert.equal(amountPoints(rupees(9999)), 0);
  assert.equal(amountPoints(rupees(100000)), WEIGHTS.per10k * LIMITS.amountSteps);

  // A pending payout with no pay date counts from the day it was added (IST).
  const e = payoutHeat(
    ledgerHeatInput({ status: "pending", raw: {}, scheduledFor: null, paidAt: null, createdAt: new Date("2026-11-24T20:00:00Z"), inrMinor: rupees(12000) }, null),
    today,
  )!;
  // 20:00 UTC on the 24th is the 25th in India: 3 days late, 40 + 9 + 5 = 54.
  assert.equal(e.score, 54);
  assert.equal(e.why, "Added 3 days ago with no pay date · ₹12,000");
});

test("heat order, bands and CSV cell", () => {
  const h = (score: number) => ({ score, level: score >= 70 ? ("hot" as const) : score >= 40 ? ("warm" as const) : ("calm" as const), why: "x" });
  const rows = [
    { id: "closed-1", heat: null },
    { id: "warm", heat: h(55) },
    { id: "hot", heat: h(90) },
    { id: "closed-2", heat: null },
    { id: "calm", heat: h(10) },
    { id: "warm-2", heat: h(55) },
  ];
  assert.deepEqual(sortByHeat(rows).map((r) => r.id), ["hot", "warm", "warm-2", "calm", "closed-1", "closed-2"]);
  assert.deepEqual(sortByHeat(rows, "asc").map((r) => r.id), ["calm", "warm", "warm-2", "hot", "closed-1", "closed-2"]);
  const counts = bandCounts(rows.map((r) => r.heat));
  assert.deepEqual(counts, { hot: 1, warm: 2, calm: 1, closed: 2 });
  for (const band of ["hot", "warm", "calm", "closed"] as const) assert.equal(rows.filter((r) => heatBand(r.heat) === band).length, counts[band]);
  assert.equal(heatCsv(h(82)), "Hot 82: x");
  assert.equal(heatCsv(null), "Closed");
});

test("heat paging: open rows first, then closed rows from the right offset, with no row skipped or repeated", async () => {
  const { heatPageSplit } = await import("./payout-heat.ts");
  // 7 open rows, 5 closed, pages of 3 (small numbers stand in for any cap).
  const open = ["o1", "o2", "o3", "o4", "o5", "o6", "o7"];
  const closed = ["c1", "c2", "c3", "c4", "c5"];
  const seen: string[] = [];
  for (let offset = 0; offset < open.length + closed.length; offset += 3) {
    const s = heatPageSplit(open.length, offset, 3);
    const rows = [...open.slice(s.openStart, s.openEnd), ...(s.closedLimit > 0 ? closed.slice(s.closedOffset, s.closedOffset + s.closedLimit) : [])];
    assert.ok(rows.length <= 3);
    seen.push(...rows);
  }
  assert.deepEqual(seen, [...open, ...closed]);
  assert.deepEqual(heatPageSplit(7, 6, 3), { openStart: 6, openEnd: 7, closedOffset: 0, closedLimit: 2 });
  assert.deepEqual(heatPageSplit(7, 9, 3), { openStart: 7, openEnd: 7, closedOffset: 2, closedLimit: 3 });
  assert.deepEqual(heatPageSplit(0, 0, 25), { openStart: 0, openEnd: 0, closedOffset: 0, closedLimit: 25 });
});

test("Dues 'Next payment' sort keeps placements with no next date last in both directions", async () => {
  const { dueHeatView } = await import("./payout-heat.ts");
  const rows = [
    { id: "a", nextDate: "2026-12-05", heat: null },
    { id: "none-1", nextDate: null, heat: null },
    { id: "b", nextDate: "2026-11-20", heat: null },
    { id: "none-2", nextDate: null, heat: null },
    { id: "c", nextDate: "2027-01-02", heat: null },
  ];
  assert.deepEqual(dueHeatView(rows, "", "next", "asc").map((r) => r.id), ["b", "a", "c", "none-1", "none-2"]);
  assert.deepEqual(dueHeatView(rows, "", "next", "desc").map((r) => r.id), ["c", "a", "b", "none-1", "none-2"]);
});
