import assert from "node:assert/strict";
import test from "node:test";

import { PAY_GATE_CODE, PAY_GATE_MESSAGE, payGateFor, payGateRefusal } from "./pay-gate.ts";

/**
 * payGateFor: the one answer to "may the employer start paying for this offer right now?", combining the
 * unpaid-past-start expiry (proposal-expiry.ts) with the CGPA check (cgpa-verification.ts). Pure.
 */

const NOW = new Date("2026-11-25T10:00:00Z"); // 15:30 IST on Wed 25 Nov
const START_FUTURE = "2026-11-30";
const START_TODAY = "2026-11-25"; // already begun (00:00 IST today)
const START_PAST = "2026-11-20";

const offer = (startDate: string, extra: Record<string, unknown> = {}) => ({ startDate, ...extra });
const pending = { cgpaVerification: { status: "pending", claimedScore: "8.1", scoreType: "cgpa", semester: 5 } };
const accepted = (startDate: string, extra: Partial<Parameters<typeof payGateFor>[0]> = {}) => ({
  status: "accepted",
  hiredAt: null,
  offerDetails: offer(startDate, { acceptedAt: "2026-11-24T10:00:00Z" }),
  extraData: null,
  updatedAt: "2026-11-24T10:00:00Z",
  ...extra,
});

test("an accepted unpaid offer before its start with no CGPA flag is payable", () => {
  assert.deepEqual(payGateFor(accepted(START_FUTURE), NOW), { payable: true, reason: null });
});

test("accepted, unpaid, start day begun, no open order: expired", () => {
  assert.deepEqual(payGateFor(accepted(START_PAST), NOW), { payable: false, reason: "expired" });
  assert.deepEqual(payGateFor(accepted(START_TODAY), NOW), { payable: false, reason: "expired" });
});

test("expiry begins at 00:00 IST on the start day, not at 00:00 UTC", () => {
  // 2026-11-25 18:29:59Z = 23:59:59 IST on the 25th; 18:30:00Z = 00:00 IST on the 26th.
  assert.equal(payGateFor(accepted("2026-11-26"), new Date("2026-11-25T18:29:59Z")).payable, true);
  assert.equal(payGateFor(accepted("2026-11-26"), new Date("2026-11-25T18:30:00Z")).reason, "expired");
});

test("an open order freezes expiry: still payable", () => {
  assert.deepEqual(payGateFor(accepted(START_PAST, { hasOpenOrder: true }), NOW), { payable: true, reason: null });
});

test("processing and hired never expire, however old the start date", () => {
  assert.equal(payGateFor(accepted(START_PAST, { status: "processing" }), NOW).payable, true);
  assert.equal(payGateFor(accepted(START_PAST, { status: "hired", hiredAt: "2026-11-21T00:00:00Z" }), NOW).payable, true);
  assert.equal(payGateFor(accepted(START_PAST, { hiredAt: "2026-11-21T00:00:00Z" }), NOW).payable, true);
});

test("a stored expiry of any kind (status expired) is not payable", () => {
  assert.equal(payGateFor(accepted(START_FUTURE, { status: "expired", offerDetails: offer(START_FUTURE, { expiredReason: "unpaid_past_start" }) }), NOW).reason, "expired");
  // legacy: status expired with no reason = the candidate accepted another offer
  assert.equal(payGateFor(accepted(START_FUTURE, { status: "expired" }), NOW).reason, "expired");
});

test("CGPA pending and overdue both block with cgpa_pending", () => {
  assert.deepEqual(payGateFor(accepted(START_FUTURE, { extraData: pending }), NOW), { payable: false, reason: "cgpa_pending" });
  const overdue = accepted(START_FUTURE, { extraData: pending, offerDetails: offer(START_FUTURE, { acceptedAt: "2026-11-20T00:00:00Z" }) });
  assert.deepEqual(payGateFor(overdue, NOW), { payable: false, reason: "cgpa_pending" });
});

test("CGPA corrected and not yet confirmed blocks; confirmed or verified does not", () => {
  const incorrect = { cgpaVerification: { status: "incorrect", claimedScore: "9.0", correctedScore: "8.0", scoreType: "cgpa", semester: 5, decidedAt: "2026-11-24T12:00:00Z" } };
  assert.deepEqual(payGateFor(accepted(START_FUTURE, { extraData: incorrect }), NOW), { payable: false, reason: "cgpa_incorrect_unacked" });
  const acked = accepted(START_FUTURE, { extraData: incorrect, offerDetails: offer(START_FUTURE, { acceptedAt: "2026-11-24T10:00:00Z", cgpaAckAt: "2026-11-24T13:00:00Z" }) });
  assert.deepEqual(payGateFor(acked, NOW), { payable: true, reason: null });
  const verified = { cgpaVerification: { status: "verified", claimedScore: "8.1", scoreType: "cgpa", semester: 5 } };
  assert.deepEqual(payGateFor(accepted(START_FUTURE, { extraData: verified }), NOW), { payable: true, reason: null });
});

test("expired wins over a CGPA block (the offer cannot be revived by verification)", () => {
  assert.equal(payGateFor(accepted(START_PAST, { extraData: pending }), NOW).reason, "expired");
});

test("an open order does not lift a CGPA block", () => {
  assert.equal(payGateFor(accepted(START_FUTURE, { extraData: pending, hasOpenOrder: true }), NOW).reason, "cgpa_pending");
});

test("a legacy intern (no cgpaVerification) and a hired monthly due line are never gated", () => {
  assert.equal(payGateFor(accepted(START_FUTURE, { extraData: { academics: {} } }), NOW).payable, true);
  assert.equal(payGateFor(accepted(START_PAST, { status: "hired", hiredAt: "2026-11-01T00:00:00Z", extraData: pending }), NOW).payable, true);
});

test("an unreadable or missing start date does not expire an offer", () => {
  assert.equal(payGateFor(accepted(""), NOW).payable, true);
  assert.equal(payGateFor(accepted("soon"), NOW).payable, true);
  assert.equal(payGateFor({ status: "accepted", hiredAt: null, offerDetails: null, extraData: null }, NOW).payable, true);
});

test("codes and messages are the contract the routes and the UI share", () => {
  assert.deepEqual(PAY_GATE_CODE, { expired: "offer_expired", cgpa_pending: "cgpa_verification_pending", cgpa_incorrect_unacked: "cgpa_incorrect_unacked" });
  assert.equal(PAY_GATE_MESSAGE.cgpa_pending, "Findtern is still confirming the candidate's CGPA (usually 24-48 h). You can pay once it is confirmed.");
  assert.match(PAY_GATE_MESSAGE.expired, /expired/);
  assert.match(PAY_GATE_MESSAGE.expired, /new proposal/);
  assert.match(PAY_GATE_MESSAGE.cgpa_incorrect_unacked, /Confirm and continue/);
});

test("payGateRefusal: null when payable, a 409 body with the code otherwise", () => {
  assert.equal(payGateRefusal({ payable: true, reason: null }), null);
  assert.deepEqual(payGateRefusal({ payable: false, reason: "expired" }), { error: PAY_GATE_MESSAGE.expired, code: "offer_expired" });
  assert.deepEqual(payGateRefusal({ payable: false, reason: "cgpa_pending" }), { error: PAY_GATE_MESSAGE.cgpa_pending, code: "cgpa_verification_pending" });
});

/** splitByPayGate: the checkout's partition. Nothing gated = the same array back, so money for ordinary offers cannot move. */
import { splitByPayGate } from "./pay-gate.ts";

type Row = { id: string } & Parameters<typeof payGateFor>[0];
const row = (id: string, startDate: string, extra: Partial<Row> = {}): Row => ({ id, ...accepted(startDate), ...extra });

test("splitByPayGate: all payable returns the very same array", () => {
  const items = [row("a", START_FUTURE), row("b", START_FUTURE, { status: "hired", hiredAt: "2026-11-01T00:00:00Z" })];
  const out = splitByPayGate(items, (r) => r, NOW);
  assert.equal(out.payable, items);
  assert.deepEqual(out.expired, []);
  assert.deepEqual(out.gated, []);
});

test("splitByPayGate: expired and CGPA-blocked rows leave the payable list, order kept", () => {
  const items = [row("a", START_FUTURE), row("b", START_PAST), row("c", START_FUTURE, { extraData: pending }), row("d", START_FUTURE), row("e", START_PAST, { hasOpenOrder: true })];
  const out = splitByPayGate(items, (r) => r, NOW);
  assert.deepEqual(out.payable.map((r) => r.id), ["a", "d", "e"]);
  assert.deepEqual(out.expired.map((r) => r.id), ["b"]);
  assert.deepEqual(out.gated.map((g) => [g.item.id, g.reason]), [["c", "cgpa_pending"]]);
});
