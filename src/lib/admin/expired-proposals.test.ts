import assert from "node:assert/strict";
import { test } from "node:test";

import { EXPIRED_REASONS, HEADLINE_REASONS, expiredCounts, expiredProposals, filterExpired, headlineCount, parseExpiredFilters, type ExpiredFilters, type ExpiredSource } from "./tracker.ts";

const START = "2026-11-23"; // closes at 00:00 IST on it
const BEFORE = new Date("2026-11-22T18:29:59Z");
const AT = new Date("2026-11-22T18:30:00Z");
const NOW = new Date("2026-11-26T04:30:00Z"); // 3 days after the boundary
const UPDATED = new Date("2026-11-24T05:00:00Z");

const src = (over: Partial<ExpiredSource> = {}): ExpiredSource => ({
  id: "p1",
  status: "sent",
  currency: "INR",
  offerDetails: { startDate: START, monthlyAmount: 10000, duration: "3m" },
  hiredAt: null,
  updatedAt: UPDATED,
  internId: "i1",
  internFirstName: "Asha",
  internLastName: "Rao",
  internEmail: "asha@example.com",
  employerId: "e1",
  companyName: "Acme",
  projectId: "pr1",
  projectName: "Landing page",
  projectTimezone: null,
  ...over,
});
const none: ExpiredFilters = { reason: "", q: "", company: "", intern: "", tz: "", since: null, until: null };
const reasonOf = (s: ExpiredSource, now = NOW, open: string[] = []) => expiredProposals([s], now, new Set(open))[0]?.reason ?? null;

test("each reason, from the stored row or computed on read", () => {
  assert.equal(reasonOf(src({ status: "sent" })), "no_reply_past_start");
  assert.equal(reasonOf(src({ status: "interview_scheduled" })), "no_reply_past_start");
  assert.equal(reasonOf(src({ status: "accepted" })), "unpaid_past_start");
  assert.equal(reasonOf(src({ status: "expired", offerDetails: { startDate: START, expiredReason: "unpaid_past_start", expiredAt: "2026-11-22T18:31:00.000Z" } })), "unpaid_past_start");
  assert.equal(reasonOf(src({ status: "expired", offerDetails: { startDate: START } })), "accepted_elsewhere");
  assert.equal(reasonOf(src({ status: "expired", offerDetails: { startDate: START, expiredReason: "admin_closed", expiredAt: "2026-11-24T00:00:00.000Z" } })), "admin_closed");
  assert.equal(reasonOf(src({ status: "withdrawn" })), "withdrawn");
  assert.equal(reasonOf(src({ status: "expired", offerDetails: { expiredReason: "withdrawn", expiredAt: "2026-11-24T00:00:00.000Z" } })), "withdrawn");
});

test("the boundary is 00:00 IST on the start date: not a second before", () => {
  assert.equal(reasonOf(src({ status: "sent" }), BEFORE), null);
  assert.equal(reasonOf(src({ status: "sent" }), AT), "no_reply_past_start");
  assert.equal(reasonOf(src({ status: "accepted" }), BEFORE), null);
  assert.equal(reasonOf(src({ status: "accepted" }), AT), "unpaid_past_start");
});

test("an unpersisted expiry is dated at the start boundary; a stored one at its own stamp", () => {
  const computed = expiredProposals([src({ status: "accepted" })], NOW)[0];
  assert.equal(computed.at?.toISOString(), "2026-11-22T18:30:00.000Z");
  assert.equal(computed.atApprox, false);
  assert.equal(computed.persisted, false);
  const stored = expiredProposals([src({ status: "expired", offerDetails: { startDate: START, expiredReason: "admin_closed", expiredAt: "2026-11-24T00:00:00.000Z" } })], NOW)[0];
  assert.equal(stored.at?.toISOString(), "2026-11-24T00:00:00.000Z");
  assert.equal(stored.persisted, true);
});

test("a legacy expired row with no stamp (and withdrawn) is dated by updatedAt and marked approximate", () => {
  for (const s of [src({ status: "expired", offerDetails: { startDate: START } }), src({ status: "withdrawn" })]) {
    const r = expiredProposals([s], NOW)[0];
    assert.equal(r.at?.getTime(), UPDATED.getTime());
    assert.equal(r.atApprox, true);
  }
  assert.equal(expiredProposals([src({ status: "withdrawn", updatedAt: null })], NOW)[0].at, null);
});

test("hired, processing, not yet started, and an open order are not expired", () => {
  assert.equal(reasonOf(src({ status: "hired" })), null);
  assert.equal(reasonOf(src({ status: "processing" })), null);
  assert.equal(reasonOf(src({ status: "accepted", hiredAt: new Date("2026-11-20T00:00:00Z") })), null);
  assert.equal(reasonOf(src({ status: "sent", offerDetails: { startDate: "2026-12-30" } })), null);
  assert.equal(reasonOf(src({ status: "rejected" })), null);
  // An unpaid order in its 30-minute window freezes an accepted offer (same rule as the sweeper).
  assert.equal(reasonOf(src({ status: "accepted" }), NOW, ["p1"]), null);
  assert.equal(reasonOf(src({ status: "accepted" }), NOW, ["other"]), "unpaid_past_start");
  // ...but only an accepted one: an unanswered offer is not payable, so an order id changes nothing.
  assert.equal(reasonOf(src({ status: "sent" }), NOW, ["p1"]), "no_reply_past_start");
});

test("headline counts the three self-lapsed reasons only; withdrawn and admin-closed are their own chips", () => {
  assert.deepEqual(HEADLINE_REASONS, ["no_reply_past_start", "unpaid_past_start", "accepted_elsewhere"]);
  assert.deepEqual(EXPIRED_REASONS, ["no_reply_past_start", "unpaid_past_start", "accepted_elsewhere", "admin_closed", "withdrawn"]);
  const rows = expiredProposals(
    [
      src({ id: "a", status: "sent" }),
      src({ id: "b", status: "accepted" }),
      src({ id: "c", status: "expired", offerDetails: { startDate: START } }),
      src({ id: "d", status: "expired", offerDetails: { expiredReason: "admin_closed", expiredAt: "2026-11-24T00:00:00.000Z" } }),
      src({ id: "e", status: "withdrawn" }),
      src({ id: "f", status: "withdrawn" }),
    ],
    NOW,
  );
  assert.deepEqual(expiredCounts(rows), { no_reply_past_start: 1, unpaid_past_start: 1, accepted_elsewhere: 1, admin_closed: 1, withdrawn: 2 });
  assert.equal(headlineCount(expiredCounts(rows)), 3);
});

test("filters: reason, exact company and candidate, timezone, search, expiry date range", () => {
  const rows = expiredProposals(
    [
      src({ id: "a", status: "sent" }),
      src({ id: "b", status: "accepted", employerId: "e2", companyName: "Globex, Inc.", internId: "i2", internFirstName: "Zoë", internLastName: "\"Z\" Khan", offerDetails: { startDate: START, timezone: "Asia/Dubai" } }),
      src({ id: "c", status: "withdrawn", updatedAt: new Date("2026-11-10T10:00:00Z") }),
    ],
    NOW,
  );
  const ids = (f: Partial<ExpiredFilters>) => filterExpired(rows, { ...none, ...f }).map((r) => r.id).sort();
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ reason: "unpaid_past_start" }), ["b"]);
  assert.deepEqual(ids({ company: "e2" }), ["b"]);
  assert.deepEqual(ids({ intern: "i1" }), ["a", "c"]);
  assert.deepEqual(ids({ tz: "Asia/Dubai" }), ["b"]);
  assert.deepEqual(ids({ q: "globex" }), ["b"]);
  assert.deepEqual(ids({ q: "zoë khan" }), ["b"]);
  assert.deepEqual(ids({ q: "landing acme" }), ["a", "c"]);
  // Range: since inclusive, until exclusive (a, b expired at 2026-11-22T18:30Z; c at 2026-11-10).
  assert.deepEqual(ids({ since: new Date("2026-11-22T18:30:00Z") }), ["a", "b"]);
  assert.deepEqual(ids({ until: new Date("2026-11-22T18:30:00Z") }), ["c"]);
  assert.deepEqual(ids({ since: new Date("2026-11-01T00:00:00Z"), until: new Date("2026-11-11T00:00:00Z") }), ["c"]);
});

test("a row with no known expiry time never matches a date range", () => {
  const rows = expiredProposals([src({ status: "withdrawn", updatedAt: null })], NOW);
  assert.equal(filterExpired(rows, none).length, 1);
  assert.equal(filterExpired(rows, { ...none, since: new Date("2000-01-01") }).length, 0);
});

test("filters from the URL: IST days, to is the whole day, junk ignored", () => {
  const f = parseExpiredFilters({ reason: "withdrawn", q: " acme ", company: "e1", from: "2026-11-01", to: "2026-11-10", tz: "Asia/Kolkata" });
  assert.equal(f.reason, "withdrawn");
  assert.equal(f.q, "acme");
  assert.equal(f.since?.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(f.until?.toISOString(), "2026-11-10T18:30:00.000Z");
  const g = parseExpiredFilters({ reason: "nope", from: "not-a-date", to: "2026-13-45" });
  assert.equal(g.reason, "");
  assert.equal(g.since, null);
  assert.equal(g.until, null);
});
