import assert from "node:assert/strict";
import { test } from "node:test";

import { computeAnalytics, filterCompanies, filterHires, isHire, type AnalyticsInput } from "./analytics.ts";

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

test("application status buckets follow legacy's seven groups, all time, largest first", () => {
  const p = (id: string, status: string, offerDetails: unknown = {}) => ({
    id, employerId: "e1", internId: "i" + id, projectId: "p1", status, offerDetails, currency: "INR" as const, createdAt: d("2024-05-01"), hiredAt: null,
  });
  const input: AnalyticsInput = {
    since: d("2026-01-01"),
    until: d("2026-04-01"),
    interns: [],
    onboarding: [],
    employers: [{ id: "e1", companyName: "Acme", createdAt: d("2025-01-02") }],
    projects: [],
    // Created long before the range: legacy counted every proposal ever, whatever the period.
    proposals: [
      p("1", "hired", { monthlyAmount: 100, duration: "1m" }),
      p("2", "accepted", { monthlyAmount: 100, duration: "1m" }),
      p("3", "hired", { fullTimeOffer: { ctc: 600000 } }),
      p("4", "sent"),
      p("5", "draft"),
      p("6", "mystery"),
      p("7", "interview_scheduled"),
      p("8", "interviewed"),
      p("9", "under_review"),
      p("10", "reviewing"),
      p("11", "rejected"),
      p("12", "expired"),
      p("13", ""),
    ],
    interviews: [],
    employerPayments: [],
    internPayments: [],
  };
  const a = computeAnalytics(input);
  assert.deepEqual(a.applicationStatus, [
    { name: "Sent", value: 2 },
    { name: "Under Review", value: 2 },
    { name: "Interviewed", value: 2 },
    { name: "Hired (Internship)", value: 2 },
    { name: "Hired (Full-time)", value: 1 },
    { name: "Rejected", value: 1 },
    { name: "Withdrawn", value: 1 },
  ]);
});

test("the monthly trend also counts new interns and new companies (legacy growth chart)", () => {
  const input: AnalyticsInput = {
    since: d("2026-01-01"),
    until: d("2026-03-01"),
    interns: [],
    onboarding: [
      { userId: "a", createdAt: d("2026-01-05"), meaningful: true, feePaid: false, score: null },
      { userId: "b", createdAt: d("2026-01-25"), meaningful: false, feePaid: false, score: null },
      { userId: "c", createdAt: d("2026-02-02"), meaningful: false, feePaid: false, score: null },
      { userId: "old", createdAt: d("2025-12-31"), meaningful: false, feePaid: false, score: null },
    ],
    employers: [
      { id: "e1", companyName: "Acme", createdAt: d("2026-02-10") },
      { id: "e2", companyName: "Beta", createdAt: d("2025-06-10") },
    ],
    projects: [],
    proposals: [],
    interviews: [],
    employerPayments: [],
    internPayments: [],
  };
  const a = computeAnalytics(input);
  assert.deepEqual(a.trend.map((t) => [t.interns, t.companies]), [[2, 0], [1, 1]]);
});

test("cities: top rows plus an Others row, shares of everyone who gave a city", () => {
  const a = computeAnalytics({
    since: null, until: null, interns: [], onboarding: [], employers: [], projects: [], proposals: [], interviews: [], employerPayments: [], internPayments: [],
    cities: [{ city: "Jaipur", count: 6 }, { city: "Delhi", count: 3 }],
    citiesTotal: 10,
  });
  assert.deepEqual(a.cities, [
    { city: "Jaipur", count: 6, percentage: 60 },
    { city: "Delhi", count: 3, percentage: 30 },
    { city: "Others", count: 1, percentage: 10 },
  ]);
  const none = computeAnalytics({ since: null, until: null, interns: [], onboarding: [], employers: [], projects: [], proposals: [], interviews: [], employerPayments: [], internPayments: [] });
  assert.deepEqual(none.cities, []);
});

test("filterCompanies: status chip and name search together", () => {
  const list = [
    { name: "Acme Labs", status: "active" as const },
    { name: "Acme Idle", status: "inactive" as const },
    { name: "Beta", status: "active" as const },
  ];
  assert.deepEqual(filterCompanies(list, { status: "active", q: "acme" }).map((c) => c.name), ["Acme Labs"]);
  assert.deepEqual(filterCompanies(list, { status: "", q: "  BETA " }).map((c) => c.name), ["Beta"]);
  assert.equal(filterCompanies(list, { status: "", q: "" }).length, 3);
});

test("drafts are not offers sent: they leave the totals, rates, trend, company counts and status groups; sent ones are unchanged", () => {
  const mk = (status: string, id: string, intern: string) => ({ id, employerId: "e1", internId: intern, projectId: "p1", status, currency: "INR", offerDetails: { monthlyAmount: 100, duration: "1m" }, createdAt: d("2026-02-01"), hiredAt: null });
  const base = {
    since: d("2026-01-01"),
    until: d("2026-04-01"),
    interns: [],
    onboarding: [{ userId: "i1", createdAt: d("2026-01-05"), meaningful: true, feePaid: false, score: null }],
    employers: [{ id: "e1", companyName: "Acme", createdAt: d("2025-01-02") }],
    projects: [],
    interviews: [],
    employerPayments: [],
    internPayments: [],
  };
  const sentOnly = computeAnalytics({ ...base, proposals: [mk("sent", "a", "i1"), mk("rejected", "b", "i2")] });
  assert.equal(sentOnly.totals.proposals, 2);
  assert.deepEqual(sentOnly.applicationStatus, [{ name: "Sent", value: 1 }, { name: "Rejected", value: 1 }]);
  const withDrafts = computeAnalytics({ ...base, proposals: [mk("sent", "a", "i1"), mk("rejected", "b", "i2"), mk("draft", "c", "i3"), mk(" Draft ", "d", "i4")] });
  assert.equal(withDrafts.totals.proposals, 2);
  assert.equal(withDrafts.rates.avgAppsPerUser, sentOnly.rates.avgAppsPerUser);
  assert.deepEqual(withDrafts.applicationStatus, sentOnly.applicationStatus);
  assert.equal(withDrafts.trend[1].proposals, 2);
  assert.equal(withDrafts.topCompanies[0].proposals, 2);
  assert.equal(withDrafts.topInterns.length, 2);
});

test("projects per company uses the range on both sides; with every project inside the range it is the same as before", () => {
  const proj = (id: string, createdAt: Date) => ({ id, employerId: "e1", status: "active", skills: [], city: null, state: null, createdAt });
  const base = {
    since: d("2026-02-01"),
    until: d("2026-03-01"),
    interns: [],
    onboarding: [],
    employers: [
      { id: "e1", companyName: "Acme", createdAt: d("2026-02-02") },
      { id: "e2", companyName: "Beta", createdAt: d("2026-02-10") },
    ],
    proposals: [],
    interviews: [],
    employerPayments: [],
    internPayments: [],
  };
  assert.equal(computeAnalytics({ ...base, projects: [proj("a", d("2026-02-03")), proj("b", d("2026-02-04")), proj("c", d("2026-02-05"))] }).rates.projectsPerCompany, 1.5);
  assert.equal(computeAnalytics({ ...base, projects: [proj("a", d("2026-02-03")), proj("b", d("2025-11-04")), proj("c", d("2025-12-05"))] }).rates.projectsPerCompany, 0.5);
});

test("a hire is a hire date or hired/completed, never a bare accepted offer; a lapsed offer is not pending", () => {
  assert.equal(isHire({ status: "accepted", hiredAt: null }), false);
  assert.equal(isHire({ status: "hired", hiredAt: null }), true);
  assert.equal(isHire({ status: "completed", hiredAt: null }), true);
  assert.equal(isHire({ status: "accepted", hiredAt: d("2026-02-02") }), true);

  const row = (id: string, internId: string, status: string, startDate: string, hiredAt: Date | null = null) => ({
    id, employerId: "e1", internId, projectId: "p1", status, currency: "INR" as string | null, offerDetails: { monthlyAmount: 100, duration: "1m", startDate }, createdAt: d("2026-02-01"), hiredAt,
  });
  const a = computeAnalytics({
    since: d("2026-01-01"),
    until: d("2026-04-01"),
    interns: [],
    onboarding: [],
    employers: [{ id: "e1", companyName: "Acme", createdAt: d("2025-01-02") }],
    projects: [],
    proposals: [
      row("a", "i1", "accepted", "2099-01-01"), // unpaid: not a hire
      row("b", "i2", "completed", "2026-02-01", d("2026-02-10")),
      row("c", "i3", "sent", "2099-01-01"), // still open: pending
      row("d", "i4", "sent", "2000-01-01"), // start day passed: lapsed, not pending
    ],
    interviews: [],
    employerPayments: [],
    internPayments: [],
  });
  assert.equal(a.totals.hires, 1);
  assert.equal(a.totals.pendingProposals, 1);
  assert.deepEqual(a.topInterns.map((i) => [i.id, i.status]).sort(), [["i1", "applied"], ["i2", "placed"], ["i3", "applied"], ["i4", "applied"]]);
});
