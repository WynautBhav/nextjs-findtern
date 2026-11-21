import { test } from "node:test";
import assert from "node:assert/strict";

import { offerState, proposalPill } from "./proposal-state.ts";
import { proposalCgpaGate } from "../../lib/cgpa-verification.ts";

// "Now" is Wed 18 Nov 2026 12:00 IST. Offers start on 25 Nov (ahead) or 10 Nov (behind).
const NOW = new Date("2026-11-18T12:00:00+05:30");
const AHEAD = { startDate: "2026-11-25", fullTime: null };
const PAST = { startDate: "2026-11-10", fullTime: null };
const H = 3_600_000;

const gateFor = (cgpa: Record<string, unknown> | null, offerDetails: Record<string, unknown>, status = "accepted") =>
  proposalCgpaGate({ status, extraData: cgpa ? { cgpaVerification: cgpa } : {}, offerDetails, updatedAt: null }, NOW);
const pending = { status: "pending", claimedScore: "8.1", scoreType: "cgpa", semester: 5 };
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * H).toISOString();

test("a plain accepted offer is To pay, exactly as before", () => {
  const s = offerState({ status: "accepted", hiredAt: null }, AHEAD, NOW);
  assert.deepEqual([s.label, s.bucket, s.canPay, s.canEdit, s.canWithdraw, s.verifying, s.expiredReason, s.closedReason, s.canSendNew], ["Accepted · payment due", "accepted", true, true, true, false, null, null, false]);
});

test("pending CGPA: not payable yet (the check is not named), still editable and withdrawable", () => {
  const gate = gateFor(pending, { acceptedAt: hoursAgo(2) });
  const s = offerState({ status: "accepted", hiredAt: null, gate }, AHEAD, NOW);
  assert.deepEqual([s.label, s.tone, s.bucket, s.canPay, s.canWithdraw, s.verifying], ["Accepted · not payable yet", "waiting", "verifying", false, true, true]);
  assert.match(s.next, /Payment opens once Findtern's final checks are done \(usually 24-48 h\)/);
  assert.doesNotMatch(`${s.label} ${s.next}`, /CGPA|verif/i);
  assert.equal(s.gate?.state, "pending");
});

test("overdue CGPA (49 h) is still not payable, with the same neutral wording", () => {
  const gate = gateFor(pending, { acceptedAt: hoursAgo(49) });
  const s = offerState({ status: "accepted", hiredAt: null, gate }, AHEAD, NOW);
  assert.equal(s.gate?.state, "overdue");
  assert.deepEqual([s.bucket, s.canPay, s.label], ["verifying", false, "Accepted · not payable yet"]);
  assert.doesNotMatch(`${s.label} ${s.next}`, /CGPA|verif/i);
});

test("incorrect and unconfirmed: a correction notice with the two scores, no pay, withdraw open", () => {
  const gate = gateFor({ ...pending, status: "incorrect", correctedScore: "7.4", decidedAt: hoursAgo(1) }, { acceptedAt: hoursAgo(30) });
  const s = offerState({ status: "accepted", hiredAt: null, gate }, AHEAD, NOW);
  assert.deepEqual([s.label, s.bucket, s.canPay, s.canWithdraw], ["CGPA corrected · confirm", "verifying", false, true]);
  assert.match(s.next, /corrected the candidate's CGPA from 8\.1 to 7\.4/);
});

test("incorrect and confirmed, or verified, or never flagged: payable again", () => {
  const acked = gateFor({ ...pending, status: "incorrect", correctedScore: "7.4", decidedAt: hoursAgo(5) }, { acceptedAt: hoursAgo(30), cgpaAckAt: hoursAgo(1) });
  const verified = gateFor({ ...pending, status: "verified" }, { acceptedAt: hoursAgo(30) });
  const none = gateFor(null, { acceptedAt: hoursAgo(30) });
  for (const gate of [acked, verified, none]) {
    const s = offerState({ status: "accepted", hiredAt: null, gate }, AHEAD, NOW);
    assert.deepEqual([s.bucket, s.canPay, s.verifying, s.gate], ["accepted", true, false, null]);
  }
});

test("accepted and unpaid past its start day: Expired, never a Pay button, a new proposal can be sent", () => {
  const s = offerState({ status: "accepted", hiredAt: null, offerDetails: { startDate: "2026-11-10" } }, PAST, NOW);
  assert.deepEqual([s.label, s.tone, s.bucket, s.canPay, s.canEdit, s.expiredReason, s.closedReason, s.canSendNew], ["Expired · not paid before start", "closed", "closed", false, false, "unpaid_past_start", "expired_unpaid", true]);
  assert.equal(s.lapsed, false, "lapsed stays the unanswered-offer flag");
  assert.match(s.next, /Send a new proposal/);
});

test("expiry beats the CGPA gate: an expired offer is not 'verifying'", () => {
  const gate = gateFor(pending, { acceptedAt: hoursAgo(60) });
  const s = offerState({ status: "accepted", hiredAt: null, gate }, PAST, NOW);
  assert.deepEqual([s.bucket, s.verifying, s.canPay], ["closed", false, false]);
});

test("an open payment order freezes expiry: still To pay (settlement will hire it)", () => {
  const s = offerState({ status: "accepted", hiredAt: null, hasOpenOrder: true }, PAST, NOW);
  assert.deepEqual([s.bucket, s.canPay, s.expiredReason], ["accepted", true, null]);
});

test("processing and hired never expire and never verify", () => {
  const gate = gateFor(pending, { acceptedAt: hoursAgo(60) }, "accepted");
  for (const status of ["processing", "hired"]) {
    const s = offerState({ status, hiredAt: status === "hired" ? "2026-11-12T00:00:00Z" : null, gate }, PAST, NOW);
    assert.equal(s.expiredReason, null, status);
    assert.equal(s.verifying, false, status);
  }
});

test("unanswered past start: Expired · no reply before start, can send a new proposal", () => {
  const s = offerState({ status: "sent", hiredAt: null }, PAST, NOW);
  assert.deepEqual([s.label, s.lapsed, s.bucket, s.closedReason, s.canSendNew, s.canWithdraw], ["Expired · no reply before start", true, "closed", "expired_no_reply", true, false]);
});

test("stored expired rows read by their reason; a row with none is the legacy 'accepted another offer'", () => {
  const legacy = offerState({ status: "expired", hiredAt: null, offerDetails: {} }, AHEAD, NOW);
  assert.deepEqual([legacy.label, legacy.closedReason, legacy.canSendNew], ["Closed · accepted elsewhere", "accepted_elsewhere", false]);
  const unpaid = offerState({ status: "expired", hiredAt: null, offerDetails: { expiredReason: "unpaid_past_start" } }, PAST, NOW);
  assert.deepEqual([unpaid.label, unpaid.closedReason, unpaid.canSendNew, unpaid.canPay, unpaid.canWithdraw], ["Expired · not paid before start", "expired_unpaid", true, false, false]);
  const admin = offerState({ status: "expired", hiredAt: null, offerDetails: { expiredReason: "admin_closed" } }, AHEAD, NOW);
  assert.equal(admin.label, "Closed by Findtern");
  const junk = offerState({ status: "expired", hiredAt: null, offerDetails: { expiredReason: "toString" } }, AHEAD, NOW);
  assert.equal(junk.closedReason, "accepted_elsewhere");
});

test("states that did not change keep their label, tone and actions", () => {
  const rows: [string, string, string, boolean, boolean, boolean][] = [
    ["draft", "Draft", "neutral", true, true, false],
    ["sent", "Waiting on candidate", "waiting", true, true, false],
    ["interview_scheduled", "Interview booked", "waiting", true, true, false],
    ["processing", "Payment in progress", "waiting", false, false, false],
    ["hired", "Hired", "live", false, false, false],
    ["rejected", "Declined", "closed", false, false, false],
    ["withdrawn", "Withdrawn", "closed", false, false, false],
  ];
  for (const [status, label, tone, canEdit, canWithdraw, canPay] of rows) {
    const s = offerState({ status, hiredAt: status === "hired" ? "2026-11-12" : null }, AHEAD, NOW);
    assert.deepEqual([s.label, s.tone, s.canEdit, s.canWithdraw, s.canPay], [label, tone, canEdit, canWithdraw, canPay], status);
  }
});

test("the candidate-card pill keeps a short 'Closed' for a stored expired row", () => {
  assert.deepEqual(proposalPill("expired"), { label: "Closed", tone: "closed" });
  assert.equal(proposalPill("accepted").label, "Accepted · payment due");
});
