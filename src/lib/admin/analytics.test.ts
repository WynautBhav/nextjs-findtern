import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAnalytics, filterHires, type AnalyticsInput } from "./analytics.ts";

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

test("employer behaviour ratios, company status and hire filters (ADM-15, ADM-16)", () => {
  const input: AnalyticsInput = {
    since: d("2026-01-01"),
    until: d("2026-04-01"),
    interns: [{ id: "i1", firstName: "Asha", lastName: "K", createdAt: d("2026-01-05") }],
    onboarding: [],
    employers: [
      { id: "e1", companyName: "Acme", createdAt: d("2025-01-02") },
      { id: "e2", companyName: "Beta", createdAt: d("2025-01-02") },
      { id: "e3", companyName: "Idle", createdAt: d("2025-01-02") },
      { id: "e4", companyName: "Offers only", createdAt: d("2025-01-02") },
    ],
    projects: [
      { id: "p1", employerId: "e1", status: "active", skills: [], city: null, state: null, createdAt: d("2026-01-03") },
      { id: "p2", employerId: "e2", status: "closed", skills: [], city: null, state: null, createdAt: d("2026-02-03") },
      { id: "p3", employerId: "e2", status: null, skills: [], city: null, state: null, createdAt: d("2026-02-04") },
    ],
    proposals: [
      { id: "x1", employerId: "e4", internId: "i1", projectId: "p1", status: "hired", currency: "INR", offerDetails: { fullTimeOffer: { ctc: 600000 } }, createdAt: d("2026-02-01"), hiredAt: d("2026-02-11") },
      { id: "x2", employerId: "e1", internId: "i1", projectId: "p1", status: "hired", currency: "INR", offerDetails: { monthlyAmount: 10000, duration: "1m" }, createdAt: d("2026-02-01"), hiredAt: d("2026-03-05") },
    ],
    interviews: [],
    employerPayments: [
      { employerId: "e1", amountMinor: 100, currency: "INR", status: "paid", paidAt: d("2026-02-11"), createdAt: null },
      { employerId: "e1", amountMinor: 100, currency: "INR", status: "paid", paidAt: d("2026-03-11"), createdAt: null },
      { employerId: "e2", amountMinor: 100, currency: "INR", status: "paid", paidAt: d("2026-03-11"), createdAt: null },
      { employerId: "test-employer", amountMinor: 100, currency: "INR", status: "paid", paidAt: d("2026-03-11"), createdAt: null },
      { employerId: "test-employer", amountMinor: 100, currency: "INR", status: "paid", paidAt: d("2026-03-12"), createdAt: null },
    ],
    internPayments: [],
  };
  const a = computeAnalytics(input);
  assert.equal(a.totals.activeEmployers, 3); // e1, e2 (projects), e4 (offer)
  assert.equal(a.totals.repeatEmployers, 1); // e1 only; test employers never count
  assert.equal(a.rates.activeEmployerRate, 75);
  assert.equal(a.rates.repeatEmployerRate, 33.3);
  assert.equal(a.totals.activeProjects, 2); // "active" and blank status
  assert.equal(a.rates.activeProjectRate, 66.7);
  assert.deepEqual(
    a.topCompanies.map((c) => [c.name, c.status]),
    [
      ["Acme", "active"],
      ["Offers only", "inactive"],
      ["Beta", "active"],
    ],
  );

  assert.deepEqual(filterHires(a.hiredList, { kind: "full-time", from: "", to: "", q: "" }).map((h) => h.companyName), ["Offers only"]);
  assert.deepEqual(filterHires(a.hiredList, { kind: "", from: "2026-03-01", to: "2026-03-31", q: "" }).map((h) => h.companyName), ["Acme"]);
  assert.equal(filterHires(a.hiredList, { kind: "", from: "", to: "", q: "acme" }).length, 1);
});
