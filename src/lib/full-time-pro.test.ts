import assert from "node:assert/strict";
import { test } from "node:test";

import { subscriptionState } from "./employer-subscription.ts";
import { FULL_TIME_PRO_DAYS, proGrantOrderId, proGrantRow, proposalsEarningPro } from "./full-time-pro.ts";

const ft = (currency: "USD" | "INR") => ({ fullTimeOffer: { annualCtc: 60000 }, currency });

test("only USD full-time hires earn a Pro year", () => {
  const hired = [
    { id: "a", offerDetails: ft("USD"), currency: "USD" },
    { id: "b", offerDetails: ft("INR"), currency: "INR" },
    { id: "c", offerDetails: { monthlyAmount: 1000, duration: "3m" }, currency: "USD" },
    { id: "d", offerDetails: { monthlyAmount: 1000, duration: "3m" }, currency: "INR" },
  ];
  assert.deepEqual(proposalsEarningPro(hired), ["a"]);
  assert.deepEqual(proposalsEarningPro([]), []);
});

test("the grant row is a free paid subscription keyed by the proposal", () => {
  const now = new Date("2026-11-21T10:00:00Z");
  const row = proGrantRow("emp1", "p1", now);
  assert.equal(row.orderId, proGrantOrderId("p1"));
  assert.equal(row.orderId, "grant_ft_p1");
  assert.equal(row.amountMinor, 0);
  assert.equal(row.status, "paid");
  assert.equal(row.gateway, "grant");
  assert.deepEqual(row.raw, { kind: "employer_subscription", periodDays: 365, source: "full_time_hire", proposalId: "p1" });
});

test("the year lands after the Pro the company already has", () => {
  const now = new Date("2026-11-21T00:00:00Z");
  const bought = { status: "paid", paidAt: new Date("2026-10-01T00:00:00Z"), raw: { kind: "employer_subscription", periodDays: 365 } };
  const grant = proGrantRow("emp1", "p1", now);
  const alone = subscriptionState({ payments: [grant], override: null, now });
  assert.equal(alone.active, true);
  assert.equal(alone.endsAt, new Date(now.getTime() + FULL_TIME_PRO_DAYS * 86_400_000).toISOString());
  const stacked = subscriptionState({ payments: [bought, grant], override: null, now });
  // Bought on 1 Oct 2026 runs to 1 Oct 2027; the grant adds 365 days on top of that.
  assert.equal(stacked.endsAt, new Date(Date.parse("2026-10-01T00:00:00Z") + 2 * 365 * 86_400_000).toISOString());
});
