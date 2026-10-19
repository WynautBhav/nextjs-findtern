import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAnalytics, type AnalyticsInput } from "./analytics.ts";

const d = (s: string) => new Date(s);

test("rates, funnel and INR revenue from a small dataset", () => {
  const input: AnalyticsInput = {
    since: d("2026-01-01"),
    until: d("2026-04-01"),
    interns: [
      { id: "i1", firstName: "Asha", lastName: "K", createdAt: d("2026-01-05") },
      { id: "i2", firstName: "Ravi", lastName: "M", createdAt: d("2026-02-05") },
    ],
    onboarding: [
      { userId: "i1", createdAt: d("2026-01-05"), meaningful: true, feePaid: true, score: 7 },
      { userId: "i2", createdAt: d("2026-02-05"), meaningful: false, feePaid: false, score: null },
    ],
    employers: [{ id: "e1", companyName: "Acme", createdAt: d("2026-01-02") }],
    projects: [{ id: "p1", employerId: "e1", status: "active", skills: ["React", "Node"], city: "Jaipur", state: "Rajasthan", createdAt: d("2026-01-03") }],
    proposals: [
      { id: "x1", employerId: "e1", internId: "i1", projectId: "p1", status: "hired", currency: "USD", offerDetails: { monthlyAmount: 200, duration: "2m" }, createdAt: d("2026-02-01"), hiredAt: d("2026-02-11") },
      { id: "x2", employerId: "e1", internId: "i2", projectId: "p1", status: "sent", currency: "INR", offerDetails: { monthlyAmount: 10000, duration: "1m" }, createdAt: d("2026-03-01"), hiredAt: null },
    ],
    interviews: [{ internId: "i1", employerId: "e1", status: "completed", createdAt: d("2026-01-20") }],
    employerPayments: [{ amountMinor: 40_000, currency: "USD", status: "paid", paidAt: d("2026-02-11"), createdAt: null }],
    internPayments: [{ amountMinor: 249_900, currency: "INR", status: "paid", paidAt: d("2026-01-06"), createdAt: null }],
  };
  const a = computeAnalytics(input);
  assert.equal(a.totals.signups, 2);
  assert.equal(a.totals.hires, 1);
  assert.equal(a.totals.revenueMinor, 4_000_000 + 249_900);
  assert.equal(a.rates.successRate, 50);
  assert.equal(a.rates.interviewRate, 50);
  assert.equal(a.rates.avgHireTimeDays, 10);
  assert.deepEqual(a.funnel.map((f) => f.value), [2, 1, 1, 1, 2, 1]);
  assert.equal(a.topCompanies[0].hires, 1);
  assert.equal(a.highestPayingSkills[0].avgMonthlyMinor, Math.round((2_000_000 + 1_000_000) / 2));
  assert.equal(a.hiredList[0].internName, "Asha K");
  assert.equal(a.trend.length, 3);
});
