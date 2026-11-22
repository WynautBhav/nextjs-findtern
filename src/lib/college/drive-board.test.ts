import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDriveBoard, matchInvites, type DriveStudentRef } from "./drive-board.ts";

const NOW = Date.parse("2026-11-23T10:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);
const stu = (id: string): DriveStudentRef => ({ userId: id, name: `Student ${id}`, rollNo: null, year: 4, branch: "CSE", phone: null });
const students = ["a", "b", "c"].map(stu);

test("critical lists: unanswered calls, offers waiting on a reply, offline students", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Acme", status: "requested", createdAt: at(12) },
      { userId: "a", company: "Beta", status: "requested", createdAt: at(3) },
      { userId: "b", company: "Acme", status: "accepted", createdAt: at(30) },
    ],
    offers: [{ userId: "c", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(90) }],
    offline: [{ userId: "b" }, { userId: "zz-not-in-drive" }],
    now: NOW,
  });
  assert.deepEqual(b.lists.meetingsWaiting.map((s) => s.userId), ["a"]);
  assert.equal(b.lists.meetingsWaiting[0].detail, "Beta, Acme asked for a call · 3 min ago");
  assert.deepEqual(b.lists.offersWaiting.map((s) => s.userId), ["c"]);
  assert.match(b.lists.offersWaiting[0].detail, /^Offer from Acme · sent 2 h ago$/);
  assert.deepEqual(b.lists.offline.map((s) => s.userId), ["b"]);
  assert.equal(b.offlineKnown, true);
  assert.deepEqual(b.lists.meetings.map((s) => s.userId), ["b"]);
});

test("results: offers counted one by one, hires split into internship and full-time", () => {
  const b = buildDriveBoard({
    students,
    meetings: [],
    offers: [
      { userId: "a", company: "Acme", status: "hired", hired: true, fullTime: false, createdAt: at(60) },
      { userId: "a", company: "Beta", status: "declined", hired: false, fullTime: false, createdAt: at(50) },
      { userId: "b", company: "Gamma", status: "completed", hired: false, fullTime: true, createdAt: at(40) },
      { userId: "x", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(5) },
    ],
    offline: null,
    now: NOW,
  });
  assert.equal(b.offerCount, 3, "an offer to a student outside the drive does not count");
  assert.equal(b.lists.offers.length, 2);
  assert.equal(b.lists.offers.find((s) => s.userId === "a")?.detail, "2 offers · Beta, Acme");
  assert.deepEqual(b.lists.internships.map((s) => s.userId), ["a"]);
  assert.deepEqual(b.lists.fullTime.map((s) => s.userId), ["b"]);
  assert.equal(b.offlineKnown, false);
  assert.equal(b.lists.offline.length, 0);
});

test("invites: arrived by email or company name, the rest are missing", () => {
  const came = [
    { employerId: "e1", company: "Acme Pvt Ltd", contact: null, email: "hr@acme.in", phone: null, joinedAt: at(5) },
    { employerId: "e2", company: "Walk-in Co", contact: null, email: "x@walk.in", phone: null, joinedAt: at(4) },
  ];
  const r = matchInvites(
    [
      { company: "ACME", email: "talent@acme.in" },
      { company: "Beta Labs", email: "X@Walk.in" },
      { company: "Gamma", email: "jobs@gamma.io" },
    ],
    came,
  );
  assert.deepEqual(r.arrived.map((i) => i.company), ["ACME", "Beta Labs"]);
  assert.deepEqual(r.missing.map((i) => i.company), ["Gamma"]);
});
