import assert from "node:assert/strict";
import { test } from "node:test";

import { EXPIRY_LABEL, acceptedUnpaidExpired, expiredStamp, expiryOf, type ExpiryInput, type ExpiryReason } from "./proposal-expiry.ts";

const START = "2026-11-23"; // a Monday; the offer closes at 00:00 IST on it
const BEFORE = new Date("2026-11-22T18:29:59Z"); // 23:59:59 IST on Sunday 22 Nov
const AT = new Date("2026-11-22T18:30:00Z"); // 00:00:00 IST on Monday 23 Nov
const AFTER = new Date("2026-11-25T10:00:00Z");

const offer = (startDate: string | null = START, extra: Record<string, unknown> = {}) => ({ startDate, ...extra });
const row = (over: Partial<ExpiryInput> = {}): ExpiryInput => ({ status: "accepted", hiredAt: null, offerDetails: offer(), ...over });

test("accepted, unpaid, no order: expires at 00:00 IST on the start date, not a second before", () => {
  assert.equal(acceptedUnpaidExpired(row(), BEFORE), false);
  assert.equal(acceptedUnpaidExpired(row(), AT), true);
  assert.equal(acceptedUnpaidExpired(row(), AFTER), true);
});

test("an open order freezes expiry", () => {
  assert.equal(acceptedUnpaidExpired(row({ hasOpenOrder: true }), AFTER), false);
  assert.deepEqual(expiryOf(row({ hasOpenOrder: true }), AFTER), { expired: false, reason: null, at: null });
});

test("processing and hired never expire, whatever the date", () => {
  for (const status of ["processing", "hired"]) {
    assert.equal(acceptedUnpaidExpired(row({ status }), AFTER), false, status);
    assert.deepEqual(expiryOf(row({ status }), AFTER), { expired: false, reason: null, at: null }, status);
  }
});

test("an accepted row that already has hiredAt never expires", () => {
  assert.equal(acceptedUnpaidExpired(row({ hiredAt: new Date("2026-11-20T10:00:00Z") }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ hiredAt: "2026-11-20T10:00:00Z" }), AFTER), false);
  assert.equal(expiryOf(row({ hiredAt: "2026-11-20T10:00:00Z" }), AFTER).expired, false);
});

test("no start date, a malformed one, or a future one: not expired", () => {
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: offer(null) }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: {} }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: null }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: "garbage" }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: offer("soon") }), AFTER), false);
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: offer("2027-01-04") }), AFTER), false);
});

test("a start date stored with a time still reads as that day", () => {
  assert.equal(acceptedUnpaidExpired(row({ offerDetails: offer("2026-11-23T00:00:00.000Z") }), AT), true);
});

test("only status accepted is accepted-unpaid", () => {
  for (const status of ["draft", "sent", "interview_scheduled", "rejected", "withdrawn", "expired", null]) {
    assert.equal(acceptedUnpaidExpired(row({ status }), AFTER), false, String(status));
  }
});

test("reason unpaid_past_start, with the moment the start day began in India", () => {
  assert.deepEqual(expiryOf(row(), AFTER), { expired: true, reason: "unpaid_past_start", at: "2026-11-22T18:30:00.000Z" });
  assert.deepEqual(expiryOf(row(), BEFORE), { expired: false, reason: null, at: null });
});

test("reason no_reply_past_start: sent or interview_scheduled and the start day has begun", () => {
  for (const status of ["sent", "interview_scheduled"]) {
    assert.deepEqual(expiryOf(row({ status }), AFTER), { expired: true, reason: "no_reply_past_start", at: "2026-11-22T18:30:00.000Z" }, status);
    assert.equal(expiryOf(row({ status }), BEFORE).expired, false, status);
  }
  // A draft was never sent, so it cannot have gone unanswered.
  assert.equal(expiryOf(row({ status: "draft" }), AFTER).expired, false);
});

test("a sent offer is not held open by an open order (orders only exist for accepted offers)", () => {
  assert.equal(expiryOf(row({ status: "sent", hasOpenOrder: true }), AFTER).reason, "no_reply_past_start");
});

test("a persisted expiry reports its stored reason and time", () => {
  for (const reason of Object.keys(EXPIRY_LABEL) as ExpiryReason[]) {
    const p = row({ status: "expired", offerDetails: offer(START, { expiredReason: reason, expiredAt: "2026-11-23T05:00:00.000Z" }) });
    assert.deepEqual(expiryOf(p, BEFORE), { expired: true, reason, at: "2026-11-23T05:00:00.000Z" }, reason);
  }
});

test("status expired with no stored reason is the legacy 'accepted another offer'", () => {
  assert.deepEqual(expiryOf(row({ status: "expired", offerDetails: offer() }), AFTER), { expired: true, reason: "accepted_elsewhere", at: null });
  assert.deepEqual(expiryOf(row({ status: "expired", offerDetails: null }), AFTER), { expired: true, reason: "accepted_elsewhere", at: null });
  assert.equal(expiryOf(row({ status: "expired", offerDetails: offer(START, { expiredReason: "bogus" }) }), AFTER).reason, "accepted_elsewhere");
});

test("withdrawn is its own status, not an expiry", () => {
  assert.deepEqual(expiryOf(row({ status: "withdrawn" }), AFTER), { expired: false, reason: null, at: null });
});

test("expiredStamp: the reason plus the moment, ISO, never lapsedAt", () => {
  const now = new Date("2026-11-23T05:00:00.000Z");
  const stamp = expiredStamp("unpaid_past_start", now);
  assert.deepEqual(stamp, { expiredReason: "unpaid_past_start", expiredAt: "2026-11-23T05:00:00.000Z" });
  assert.equal("lapsedAt" in stamp, false);
  assert.equal(expiredStamp("admin_closed").expiredReason, "admin_closed");
  assert.ok(!Number.isNaN(Date.parse(expiredStamp("withdrawn").expiredAt)));
});

test("EXPIRY_LABEL has one non-empty label per reason", () => {
  assert.deepEqual(Object.keys(EXPIRY_LABEL).sort(), ["accepted_elsewhere", "admin_closed", "no_reply_past_start", "unpaid_past_start", "withdrawn"]);
  for (const v of Object.values(EXPIRY_LABEL)) assert.ok(v.length > 0);
  assert.equal(EXPIRY_LABEL.unpaid_past_start, "Expired · not paid before start");
});
