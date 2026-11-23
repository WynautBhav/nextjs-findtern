import assert from "node:assert/strict";
import test from "node:test";

import { maskMeetingViews, NO_LONGER_IN_DRIVE, type MeetingView } from "./meeting-views.ts";

const NOW = Date.parse("2026-11-23T10:00:00Z");
const view = (over: Partial<MeetingView> = {}): MeetingView => ({
  id: "m1", driveId: "d1", employerId: "e1", userId: "u1", startsAt: "2026-11-23T10:05:00.000Z", status: "accepted", meetingLink: "https://meet.example.com/x", ...over,
});
const live = new Set(["u1"]);
const gone = new Set<string>();

test("a live member's call is shown as stored, even if the drive's eligibility no longer lists them (excluded, raised cutoff)", () => {
  for (const status of ["requested", "accepted"]) {
    const [v] = maskMeetingViews([view({ status })], live, undefined, NOW);
    assert.equal(v.status, status);
    assert.equal(v.noLongerInDrive, undefined);
  }
  assert.equal(maskMeetingViews([view()], live, undefined, NOW)[0].meetingLink, "https://meet.example.com/x");
});

test("a student who left: an open request or an accepted call yet to happen reads cancelled, link removed", () => {
  for (const status of ["requested", "accepted"]) {
    const [v] = maskMeetingViews([view({ status })], gone, new Map([["u1", "AM"]]), NOW);
    assert.equal(v.status, "cancelled");
    assert.equal(v.meetingLink, null);
    assert.equal(v.noLongerInDrive, true);
    assert.equal(v.studentLabel, "AM", "keeps the student's initials");
  }
});

test("a student who left: a call that already happened, a declined or expired request is history and is not rewritten", () => {
  const past = view({ startsAt: "2026-11-23T08:00:00.000Z" });
  assert.equal(maskMeetingViews([past], gone, undefined, NOW)[0].status, "accepted");
  assert.equal(maskMeetingViews([past], gone, undefined, NOW)[0].noLongerInDrive, undefined);
  for (const status of ["declined", "expired"]) assert.equal(maskMeetingViews([view({ status })], gone, undefined, NOW)[0].status, status);
});

test("a call already cancelled in the database for a student who left is flagged, so the panel can say why", () => {
  const [v] = maskMeetingViews([view({ status: "cancelled", meetingLink: null })], gone, undefined, NOW);
  assert.equal(v.status, "cancelled");
  assert.equal(v.noLongerInDrive, true);
});

test("the reason is neutral: it says nothing about why the student left", () => {
  assert.equal(NO_LONGER_IN_DRIVE, "Cancelled: no longer in this drive");
  assert.doesNotMatch(NO_LONGER_IN_DRIVE, /leave|left|excluded|removed|denied|hold|frozen|moderat/i);
});
