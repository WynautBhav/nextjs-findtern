import assert from "node:assert/strict";
import { test } from "node:test";

import { activeToggle, matchesView, payLines, paySummary, projectStatus, restoresToActive, viewCounts, type ViewRow } from "./projects-board-pure.ts";

const down = new Date("2026-11-20T10:00:00Z");

test("projectStatus: active, deactivated, then the employer's status in plain words", () => {
  assert.equal(projectStatus({ status: "published", takenDownAt: null }).label, "Active");
  assert.equal(projectStatus({ status: "active", takenDownAt: null }).label, "Active");
  assert.equal(projectStatus({ status: "", takenDownAt: null }).label, "Active");
  assert.equal(projectStatus({ status: null, takenDownAt: null }).key, "active");
  assert.equal(projectStatus({ status: "published", takenDownAt: down }).label, "Deactivated");
  assert.equal(projectStatus({ status: "closed", takenDownAt: down }).key, "deactivated");
  assert.equal(projectStatus({ status: "paused", takenDownAt: null }).label, "Paused");
  assert.equal(projectStatus({ status: "inactive", takenDownAt: null }).label, "Paused");
  assert.equal(projectStatus({ status: "archived", takenDownAt: null }).label, "Closed");
  assert.equal(projectStatus({ status: "draft", takenDownAt: null }).label, "Draft");
  assert.equal(projectStatus({ status: "pending_review", takenDownAt: null }).label, "Pending review");
  assert.equal(projectStatus({ status: "rejected", takenDownAt: null }).label, "Rejected");
  assert.equal(projectStatus({ status: "weird", takenDownAt: null }).label, "Closed");
});

test("activeToggle: deactivate when open, activate when taken down, locked with a reason otherwise, hidden without write", () => {
  assert.deepEqual(activeToggle({ status: "published", takenDownAt: null }, true), { show: true, on: true, action: "deactivate" });
  assert.deepEqual(activeToggle({ status: "closed", takenDownAt: down }, true), { show: true, on: false, action: "activate" });
  assert.deepEqual(activeToggle({ status: "closed", takenDownAt: null }, true), { show: true, on: false, action: null, reason: "Closed by the employer" });
  assert.deepEqual(activeToggle({ status: "paused", takenDownAt: null }, true), { show: true, on: false, action: null, reason: "Paused by the employer" });
  assert.deepEqual(activeToggle({ status: "published", takenDownAt: null }, false), { show: false });
  assert.equal(restoresToActive("active"), true);
  assert.equal(restoresToActive("closed"), false);
});

test("viewCounts: each view's count equals the length of the list it filters (not 1 of 1)", () => {
  const rows: ViewRow[] = [
    { status: "published", takenDownAt: null, fullTimeOffer: true },
    { status: "active", takenDownAt: null, fullTimeOffer: false },
    { status: "", takenDownAt: null, fullTimeOffer: null },
    { status: "published", takenDownAt: down, fullTimeOffer: true },
    { status: "closed", takenDownAt: down, fullTimeOffer: false },
    { status: "paused", takenDownAt: null, fullTimeOffer: true },
    { status: "draft", takenDownAt: null, fullTimeOffer: false },
  ];
  const counts = viewCounts(rows);
  assert.deepEqual(counts, { all: 7, active: 3, deactivated: 2, full_time: 3 });
  for (const v of ["all", "active", "deactivated", "full_time"] as const) {
    assert.equal(counts[v], rows.filter((r) => matchesView(r, v)).length);
  }
  // Every active row's badge says Active, every deactivated row's says Deactivated.
  assert.equal(rows.filter((r) => projectStatus(r).key === "active").length, counts.active);
  assert.equal(rows.filter((r) => projectStatus(r).key === "deactivated").length, counts.deactivated);
});

test("paySummary: stipend and months from internship offers, CTC from full-time ones, drafts skipped", () => {
  const s = paySummary([
    { status: "sent", currency: "INR", offerDetails: { internStipendMonthly: 8000, duration: "3m" } },
    { status: "hired", currency: "INR", offerDetails: { internStipendMonthly: 15000, duration: "6m" } },
    { status: "accepted", currency: "INR", offerDetails: { fullTimeOffer: { annualCtc: 650000 } } },
    { status: "draft", currency: "INR", offerDetails: { internStipendMonthly: 99000, duration: "1m" } },
  ]);
  assert.equal(s.offers, 3);
  assert.deepEqual(s.stipend, { min: 800000, max: 1500000 });
  assert.deepEqual(s.months, { min: 3, max: 6 });
  assert.deepEqual(s.ctc, { min: 65000000, max: 65000000 });
  assert.deepEqual(payLines(s), ["Stipend ₹8,000–₹15,000 a month · 3–6 months", "CTC ₹6.5L a year"]);
  assert.deepEqual(payLines(paySummary([])), []);
  assert.deepEqual(payLines(paySummary([{ status: "sent", currency: "INR", offerDetails: { internStipendMonthly: 0, duration: "1m" } }])), ["Unpaid · 1 month"]);
});

test("exportRows: one row per project in screen order, company name carried", async () => {
  const { exportRows } = await import("./projects-board-export.ts");
  const mk = (id: string) => ({ id }) as never;
  const rows = exportRows([
    { employerId: "b", companyName: "Beta", projects: [mk("b1"), mk("b2"), mk("b3")] },
    { employerId: "a", companyName: "Alpha", projects: [mk("a1"), mk("a2")] },
  ]);
  assert.deepEqual(rows.map((r) => `${r.companyName}:${r.id}`), ["Beta:b1", "Beta:b2", "Beta:b3", "Alpha:a1", "Alpha:a2"]);
});

test("a padded or upper-case status reads the same as a clean one (SQL twins trim too)", () => {
  assert.equal(projectStatus({ status: " active ", takenDownAt: null }).key, "active");
  assert.equal(projectStatus({ status: "Published\n", takenDownAt: null }).key, "active");
  assert.equal(projectStatus({ status: "  ", takenDownAt: null }).key, "active");
  assert.equal(projectStatus({ status: " Paused ", takenDownAt: null }).key, "paused");
  assert.equal(projectStatus({ status: "closed ", takenDownAt: null }).key, "closed");
  const rows: ViewRow[] = [
    { status: " active ", takenDownAt: null, fullTimeOffer: false },
    { status: "PUBLISHED", takenDownAt: null, fullTimeOffer: true },
    { status: " paused", takenDownAt: null, fullTimeOffer: false },
  ];
  assert.deepEqual(viewCounts(rows), { all: 3, active: 2, deactivated: 0, full_time: 1 });
});
