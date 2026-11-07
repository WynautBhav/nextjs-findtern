import assert from "node:assert/strict";
import { test } from "node:test";

import type { PayoutRow } from "../../../lib/journey.ts";
import { engagementPhase, orderEngagements, stipendPlan, stipendTotalsLine, totalsByCurrency } from "./months.ts";

const row = (o: Partial<PayoutRow>): PayoutRow => ({
  id: Math.random().toString(36),
  amountMinor: 0,
  currency: "INR",
  status: "paid",
  referenceId: null,
  notes: null,
  paidAt: null,
  createdAt: new Date("2026-10-08T00:00:00Z"),
  ...o,
});

test("one payment worth two months covers both, and names the same payment", () => {
  const big = row({ amountMinor: 2_500_000, paidAt: new Date("2026-10-07T05:41:00Z"), referenceId: "UTR1" });
  const plan = stipendPlan({ months: 3, monthlyMinor: 1_250_000, startDate: "2026-10-11", payouts: [big], now: new Date("2026-10-29T06:00:00Z") });
  assert.deepEqual(plan.months.map((m) => m.state), ["paid", "paid", "upcoming"]);
  assert.equal(plan.months[1].paidBy[0], big);
  assert.equal(plan.paidMinor, 2_500_000);
  assert.equal(plan.toComeMinor, 1_250_000);
  assert.equal(plan.months[0].current, true);
  assert.equal(plan.months[0].to?.toISOString().slice(0, 10), "2026-11-10");
});

test("pending fills after paid, carries its scheduled date; other currencies stay out", () => {
  const plan = stipendPlan({
    months: 2,
    monthlyMinor: 100,
    startDate: "2026-01-31",
    payouts: [
      row({ amountMinor: 60 }),
      row({ amountMinor: 40, status: "pending", raw: { scheduledFor: "2026-03-05" } }),
      row({ amountMinor: 999, currency: "USD" }),
    ],
  });
  assert.equal(plan.months[0].state, "pending");
  assert.equal(plan.months[0].scheduledAt?.toISOString().slice(0, 10), "2026-03-05");
  assert.equal(plan.months[1].state, "upcoming");
  assert.equal(plan.months[1].from?.toISOString().slice(0, 10), "2026-02-28");
  assert.equal(plan.paidMinor, 60);
});

test("totals never add across currencies", () => {
  const t = totalsByCurrency([row({ amountMinor: 100 }), row({ amountMinor: 5, currency: "USD" }), row({ amountMinor: 7, status: "failed" })], "paid");
  assert.deepEqual(t, [{ currency: "INR", minor: 100 }, { currency: "USD", minor: 5 }]);
});

test("the stipend totals line prints zero as ₹0 (never 'Free') and adds scheduled only when there is some", () => {
  const plan = (paidMinor: number, pendingMinor: number, toComeMinor: number) => ({ months: [], totalMinor: paidMinor + pendingMinor + toComeMinor, paidMinor, pendingMinor, toComeMinor });
  const line = stipendTotalsLine([plan(0, 0, 3_960_000), null, plan(0, 0, 1_500_000)]);
  assert.match(line, /^₹0 paid · ₹54,600 still to come$/);
  assert.doesNotMatch(line, /Free/);
  assert.match(stipendTotalsLine([plan(1_320_000, 1_320_000, 0)]), /^₹13,200 paid · ₹13,200 scheduled · ₹0 still to come$/);
});

test("internships list running first, then upcoming by start date, then finished newest first", () => {
  const now = new Date("2026-11-07T06:00:00Z");
  const c = (id: string, startDate: string | null, months = 3) => ({ id, startDate, months });
  const out = orderEngagements([c("old", "2026-01-01"), c("later", "2027-02-01"), c("run", "2026-10-01"), c("soon", "2026-12-26"), c("older", "2025-06-01"), c("none", null)], now);
  assert.deepEqual(out.map((x) => x.id), ["run", "soon", "later", "none", "old", "older"]);
  assert.equal(engagementPhase("2026-08-07", 3, now), 2); // ended on the 7th, today is past the last day
  assert.equal(engagementPhase("2026-11-07", 1, now), 0);
});
