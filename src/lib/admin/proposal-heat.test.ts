import test from "node:test";
import assert from "node:assert/strict";

import { PROPOSAL_HEAT_GUIDE, WEIGHTS, daysToStart, proposalHeat } from "./proposal-heat.ts";

const now = new Date("2026-11-28T12:00:00+05:30");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const intern = (start: string, monthly = 26400, extra: Record<string, unknown> = {}) => ({ startDate: start, monthlyAmount: monthly, duration: "2m", ...extra });

test("every guide factor shows a weight, and every weight is in the guide", () => {
  const shown = PROPOSAL_HEAT_GUIDE.factors.map((f) => Number(f.points.replace("+", "")));
  const weights = Object.values(WEIGHTS);
  assert.equal(shown.length, weights.length);
  assert.deepEqual([...shown].sort((a, b) => a - b), [...weights].sort((a, b) => a - b));
});

test("closed rows have no heat", () => {
  for (const bucket of ["hired", "rejected", "withdrawn", "expired"] as const) {
    assert.equal(proposalHeat({ bucket, pay: null, offerDetails: intern("2026-11-30"), currency: "INR", createdAt: ago(1) }, now), null);
  }
});

test("worked examples score exactly as the guide adds up", () => {
  // Accepted, not paid for 4 days, starts in 2 days, ₹26,400 a month: 40 + 40 + 10 + 5 = 95, Hot.
  const a = proposalHeat({ bucket: "accepted", pay: "unpaid", offerDetails: intern("2026-11-30", 26400, { acceptedAt: ago(4) }), currency: "INR", createdAt: ago(10) }, now)!;
  assert.equal(a.score, WEIGHTS.acceptedUnpaid + WEIGHTS.startIn2Days + WEIGHTS.unpaid3Days + WEIGHTS.bigStipend);
  assert.equal(a.score, 95);
  assert.equal(a.level, "hot");
  assert.equal(a.why, "Starts in 2 days · employer hasn't paid in 4 days · ₹26,400 a month");

  // Pending, sent 4 days ago, starts in 10 days, ₹12,000 a month: 15 + 10 + 8 = 33, Calm.
  const b = proposalHeat({ bucket: "pending", pay: null, offerDetails: intern("2026-12-08", 12000), currency: "INR", createdAt: ago(4) }, now)!;
  assert.equal(b.score, WEIGHTS.pending + WEIGHTS.startIn14Days + WEIGHTS.noReply3Days);
  assert.equal(b.level, "calm");
  assert.equal(b.why, "Starts in 10 days · no reply in 4 days · ₹12,000 a month");

  // Pending full-time, sent 8 days ago, starts in 5 days: 15 + 25 + 15 + 10 = 65, Warm.
  const c = proposalHeat({ bucket: "pending", pay: null, offerDetails: { startDate: "2026-12-03", fullTimeOffer: { jobTitle: "SDE", annualCtcMinor: 70000000 } }, currency: "INR", createdAt: ago(8) }, now)!;
  assert.equal(c.score, 65);
  assert.equal(c.level, "warm");
  assert.match(c.why, /^Starts in 5 days · no reply in 8 days · full-time, ₹7,00,000 CTC$/);

  // Payment under way, starts tomorrow: the start day adds nothing (it never expires). 5 + 5 = 10, Calm.
  const d = proposalHeat({ bucket: "accepted", pay: "processing", offerDetails: intern("2026-11-29", 30000), currency: "INR", createdAt: ago(3) }, now)!;
  assert.equal(d.score, WEIGHTS.paymentUnderWay + WEIGHTS.bigStipend);
  assert.equal(d.why, "Payment under way · ₹30,000 a month");
});

test("days to start count India days", () => {
  assert.equal(daysToStart({ startDate: "2026-11-30" }, now), 2);
  assert.equal(daysToStart({ startDate: "2026-11-28" }, new Date("2026-11-27T19:00:00Z")), 0); // 00:30 IST on the 28th
  assert.equal(daysToStart({}, now), null);
});

test("heat order: hottest first, closed rows last and newest first; bands cover every row once", async () => {
  const { sortByHeat, heatBand, HEAT_BANDS } = await import("./proposal-heat.ts");
  const h = (score: number) => ({ score, level: score >= 70 ? ("hot" as const) : score >= 40 ? ("warm" as const) : ("calm" as const), why: "" });
  const rows = [
    { id: "c-old", heat: null, createdAt: new Date("2026-11-01") },
    { id: "warm", heat: h(55), createdAt: new Date("2026-11-02") },
    { id: "c-new", heat: null, createdAt: new Date("2026-11-20") },
    { id: "hot", heat: h(80), createdAt: new Date("2026-11-03") },
    { id: "calm", heat: h(20), createdAt: new Date("2026-11-04") },
  ];
  assert.deepEqual(sortByHeat(rows).map((r) => r.id), ["hot", "warm", "calm", "c-new", "c-old"]);
  assert.deepEqual(sortByHeat(rows, "asc").map((r) => r.id), ["calm", "warm", "hot", "c-new", "c-old"]);
  const counts = Object.fromEntries(HEAT_BANDS.map((b) => [b, rows.filter((r) => heatBand(r.heat) === b).length]));
  assert.deepEqual(counts, { hot: 1, warm: 1, calm: 1, closed: 2 });
});
