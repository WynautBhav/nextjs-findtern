import assert from "node:assert/strict";
import { test } from "node:test";

import { filterInterviews, filterProposals, matchesSearch, paginate, parseIstDay, proposalTimezone, sortBy } from "./tracker.ts";

const none = { from: null, to: null, company: "", intern: "", tz: "" };
const p = (over: Record<string, unknown>) => ({
  id: "p",
  status: "sent",
  flowType: "direct",
  currency: "INR",
  offerDetails: {},
  createdAt: new Date("2026-10-10T10:00:00Z"),
  hiredAt: null,
  internId: "i1",
  employerId: "e1",
  projectTimezone: null,
  ...over,
});

test("timezone comes from the offer, then full-time block, then project", () => {
  assert.equal(proposalTimezone(p({ offerDetails: { timezone: "America/New_York" } })), "America/New_York");
  assert.equal(proposalTimezone(p({ offerDetails: { fullTimeOffer: { timezone: "Europe/London" } } })), "Europe/London");
  assert.equal(proposalTimezone(p({ projectTimezone: "Asia/Dubai" })), "Asia/Dubai");
  assert.equal(proposalTimezone(p({})), null);
});

test("exact company / candidate ids and timezone filter (ADP-12)", () => {
  const rows = [p({ id: "a" }), p({ id: "b", employerId: "e2" }), p({ id: "c", internId: "i2", offerDetails: { timezone: "Asia/Kolkata" } })];
  assert.deepEqual(filterProposals(rows, { ...none, company: "e1" }).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterProposals(rows, { ...none, intern: "i2" }).map((r) => r.id), ["c"]);
  assert.deepEqual(filterProposals(rows, { ...none, tz: "Asia/Kolkata" }).map((r) => r.id), ["c"]);
  const iv = [
    { id: "x", status: "scheduled", createdAt: null, internId: "i1", employerId: "e1", timezone: null },
    { id: "y", status: "scheduled", createdAt: null, internId: "i1", employerId: "e1", timezone: "America/New_York" },
  ];
  // A missing interview timezone is IST (legacy default).
  assert.deepEqual(filterInterviews(iv, { ...none, tz: "Asia/Kolkata" }).map((r) => r.id), ["x"]);
});

test("IST day bounds are inclusive", () => {
  const from = parseIstDay("2026-10-10");
  const to = parseIstDay("2026-10-10", true);
  const rows = [p({ id: "in", createdAt: new Date("2026-10-10T18:00:00Z") }), p({ id: "out", createdAt: new Date("2026-10-10T18:31:00Z") })];
  assert.deepEqual(filterProposals(rows, { ...none, from, to }).map((r) => r.id), ["in"]);
  assert.equal(parseIstDay("10/10/2026"), null);
});

test("search, sort and pagination helpers", () => {
  assert.equal(matchesSearch(["Asha Rao", "acme"], "asha acme"), true);
  assert.equal(matchesSearch(["Asha Rao"], "asha acme"), false);
  assert.deepEqual(sortBy([{ v: 2 }, { v: null }, { v: 1 }], (r) => r.v, "asc").map((r) => r.v), [1, 2, null]);
  const pg = paginate([1, 2, 3, 4, 5], 9, 2);
  assert.deepEqual([pg.rows, pg.page, pg.pages, pg.total], [[5], 3, 3, 5]);
});
