import assert from "node:assert/strict";
import test from "node:test";

import { expiryDedupeKey, expiryNotices, planExpiry } from "./proposal-expiry-plan.ts";

const NOW = new Date("2026-11-25T10:00:00Z"); // Wed 25 Nov, 15:30 IST

const row = (id: string, startDate: string, extra: Record<string, unknown> = {}) => ({ id, status: "accepted", hiredAt: null, offerDetails: { startDate }, ...extra });

test("planExpiry keeps only accepted, unpaid, start-day-begun offers with no open order", () => {
  const rows = [
    row("past", "2026-11-20"),
    row("today", "2026-11-25"),
    row("future", "2026-11-26"),
    row("open", "2026-11-20"),
    row("hired", "2026-11-20", { status: "hired", hiredAt: new Date("2026-11-19T00:00:00Z") }),
    row("processing", "2026-11-20", { status: "processing" }),
    row("sent", "2026-11-20", { status: "sent" }),
    row("nodate", ""),
  ];
  assert.deepEqual(planExpiry(rows, new Set(["open"]), NOW).map((r) => r.id), ["past", "today"]);
});

test("planExpiry: 00:00 IST on the start day is the boundary", () => {
  const rows = [row("a", "2026-11-26")];
  assert.equal(planExpiry(rows, new Set(), new Date("2026-11-25T18:29:59Z")).length, 0);
  assert.equal(planExpiry(rows, new Set(), new Date("2026-11-25T18:30:00Z")).length, 1);
});

test("planExpiry is idempotent: an already expired row is not planned again", () => {
  assert.equal(planExpiry([row("x", "2026-11-20", { status: "expired" })], new Set(), NOW).length, 0);
});

test("dedupe keys are per proposal and per side", () => {
  assert.equal(expiryDedupeKey("p1", "employer"), "proposal_expired_unpaid:p1:employer");
  assert.notEqual(expiryDedupeKey("p1", "intern"), expiryDedupeKey("p1", "employer"));
});

const base = { proposalId: "p1", role: "Design Intern", initials: "AK", company: "Northwind", startDate: "2026-11-20", site: "https://app.findtern.test", projectTakenDown: false };

test("employer notice: initials only, no name or pay figure, says what to do, links to proposals", () => {
  const n = expiryNotices(base);
  assert.ok(n.employer);
  assert.equal(n.employer.title, "Offer expired before payment");
  assert.match(n.employer.message, /AK/);
  assert.match(n.employer.message, /Design Intern/);
  assert.match(n.employer.message, /20 Nov 2026/);
  assert.match(n.employer.message, /new proposal/i);
  assert.doesNotMatch(JSON.stringify(n), /₹|\$|stipend|salary/i);
  assert.equal(n.employer.email?.cta?.url, "https://app.findtern.test/employer/proposals");
  assert.equal(n.employer.data.proposalId, "p1");
});

test("employer notice has no email when the site origin is unknown (never a broken link)", () => {
  assert.equal(expiryNotices({ ...base, site: null }).employer?.email, undefined);
});

test("a taken-down project: the employer is not notified, the intern still is", () => {
  const n = expiryNotices({ ...base, projectTakenDown: true });
  assert.equal(n.employer, null);
  assert.ok(n.intern.message.length > 0);
});

test("intern notice: names the company and role, asks nothing of them", () => {
  const n = expiryNotices(base);
  assert.match(n.intern.message, /Northwind/);
  assert.match(n.intern.message, /Design Intern/);
  assert.match(n.intern.message, /nothing/i);
  assert.equal(n.intern.data.proposalId, "p1");
});
