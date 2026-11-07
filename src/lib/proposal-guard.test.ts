import test from "node:test";
import assert from "node:assert/strict";

import { pendingMeetingAtFor, sendProposalHold } from "./proposal-guard.ts";

const NOW = Date.parse("2026-11-07T06:00:00Z");
const at = (iso: string) => new Date(iso);
const booked = (iso: string, extra: object = {}) => ({
  status: "scheduled",
  slot1: at(iso),
  slot2: null,
  slot3: null,
  selectedSlot: 1,
  ...extra,
});

test("a booked future meeting is pending; the soonest wins", () => {
  const later = booked("2026-11-12T09:00:00Z");
  const sooner = booked("2026-11-09T09:00:00Z");
  assert.equal(pendingMeetingAtFor([later, sooner], { now: NOW }), "2026-11-09T09:00:00.000Z");
});

test("offered slots with no pick still hold the candidate, at the first slot", () => {
  const iv = { status: "pending", slot1: at("2026-11-10T05:00:00Z"), slot2: at("2026-11-11T05:00:00Z"), slot3: null, selectedSlot: null };
  assert.equal(pendingMeetingAtFor([iv], { now: NOW }), "2026-11-10T05:00:00.000Z");
});

test("a finished, completed, cancelled or over meeting does not hold", () => {
  assert.equal(pendingMeetingAtFor([booked("2026-11-06T09:00:00Z")], { now: NOW }), null);
  assert.equal(pendingMeetingAtFor([booked("2026-11-09T09:00:00Z", { status: "completed" })], { now: NOW }), null);
  assert.equal(pendingMeetingAtFor([booked("2026-11-09T09:00:00Z", { status: "cancelled" })], { now: NOW }), null);
  assert.equal(pendingMeetingAtFor([], { now: NOW }), null);
});

test("a meeting in progress still holds until it ends", () => {
  assert.notEqual(pendingMeetingAtFor([booked("2026-11-07T05:50:00Z")], { now: NOW }), null);
});

test("a meeting on another project does not hold this one; an unscoped one does", () => {
  const other = booked("2026-11-09T09:00:00Z", { projectId: "p2" });
  const loose = booked("2026-11-09T09:00:00Z", { projectId: null });
  assert.equal(pendingMeetingAtFor([other], { now: NOW, projectId: "p1" }), null);
  assert.notEqual(pendingMeetingAtFor([loose], { now: NOW, projectId: "p1" }), null);
  assert.notEqual(pendingMeetingAtFor([other], { now: NOW }), null);
});

test("the hold reads Meeting on <date> with the reason, or nothing", () => {
  assert.deepEqual(sendProposalHold("2026-11-09T09:00:00.000Z"), {
    label: "Meeting on 9 Nov",
    reason: "Send the offer after the interview",
  });
  assert.equal(sendProposalHold(null), null);
  assert.equal(sendProposalHold(undefined), null);
  assert.equal(sendProposalHold("garbage"), null);
});
