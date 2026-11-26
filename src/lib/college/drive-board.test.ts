import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDriveBoard, closedDriveFinding, matchInvites, type DriveStudentRef } from "./drive-board.ts";

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
  assert.equal(b.lists.meetingsWaiting[0].detail, "Beta, Acme asked for a meet · 3 min ago");
  assert.deepEqual(b.lists.offersWaiting.map((s) => s.userId), ["c"]);
  assert.match(b.lists.offersWaiting[0].detail, /^Offer from Acme · sent 1 h ago$/);
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
  assert.equal(b.lists.offers.find((s) => s.userId === "a")?.detail, "2 internship offers · Beta, Acme");
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

test("invites: walk-ins counted once, even when two invites match one company", () => {
  const came = [
    { employerId: "e1", company: "Acme", contact: null, email: "hr@acme.in", phone: null, joinedAt: at(5) },
    { employerId: "e2", company: "Walk-in Co", contact: null, email: "x@walk.in", phone: null, joinedAt: at(4) },
  ];
  const r = matchInvites([{ company: "Acme", email: "hr@acme.in" }, { company: "Acme India", email: "hr@acme.in" }], came);
  assert.equal(r.arrived.length, 2);
  assert.equal(r.walkIns, 1);
});

test("pipeline stages: called counts any call request, hired counts each student once", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Acme", status: "declined", createdAt: at(9) },
      { userId: "a", company: "Beta", status: "requested", createdAt: at(8) },
      { userId: "b", company: "Acme", status: "accepted", createdAt: at(7) },
    ],
    offers: [
      { userId: "c", company: "Acme", status: "hired", hired: true, fullTime: false, createdAt: at(6) },
      { userId: "c", company: "Beta", status: "completed", hired: false, fullTime: true, createdAt: at(5) },
    ],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.lists.called.map((s) => s.userId).sort(), ["a", "b"]);
  assert.deepEqual(b.lists.hired.map((s) => s.userId), ["c"]);
  assert.match(b.lists.hired[0].detail, /^Full-time with /);
});

test("a call request past its 10-minute lapse is not waiting on the student any more", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      // Starts in 5 minutes: still answerable.
      { userId: "a", company: "Acme", status: "requested", createdAt: at(2), startsAt: new Date(NOW + 5 * 60_000) },
      // Started 9 minutes ago: inside the 10-minute grace.
      { userId: "b", company: "Acme", status: "requested", createdAt: at(15), startsAt: at(9) },
      // Started 11 minutes ago: lapsed, the student can no longer accept it.
      { userId: "c", company: "Acme", status: "requested", createdAt: at(40), startsAt: at(11) },
    ],
    offers: [],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.lists.meetingsWaiting.map((s) => s.userId).sort(), ["a", "b"]);
});

test("the closed-drive sentence counts students, so it agrees with the pipeline", () => {
  const b = buildDriveBoard({
    students,
    offline: null,
    // a has an internship and a full-time offer (two rows), b has one: 2 students, not 3 offers.
    offers: [
      { userId: "a", company: "Acme", status: "hired", hired: true, fullTime: false, createdAt: at(30) },
      { userId: "a", company: "Beta", status: "sent", hired: false, fullTime: true, createdAt: at(20) },
      { userId: "b", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(10) },
    ],
    meetings: [],
    now: NOW,
  });
  assert.equal(b.lists.offers.length, 2);
  assert.equal(closedDriveFinding(b.lists), "2 students got an offer, 0 students had a meet and 1 student was hired in this drive.");
});

test("an unanswered offer whose start day began is lapsed, not 'Offers not answered' (master data: deadline missed)", () => {
  const b = buildDriveBoard({
    students,
    meetings: [],
    offers: [
      { userId: "a", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(60), pastStart: true },
      { userId: "b", company: "Beta", status: "sent", hired: false, fullTime: false, createdAt: at(50), pastStart: false },
    ],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.lists.offersWaiting.map((s) => s.userId), ["b"]);
  assert.equal(b.offerCount, 2, "a lapsed offer still counts as an offer received");
});

test("a meet request the company cancelled is not 'asked to meet' (like a withdrawn offer is not an offer)", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Acme", status: "cancelled", createdAt: at(30), startsAt: at(25) },
      { userId: "b", company: "Beta", status: "accepted", createdAt: at(30), startsAt: at(25) },
    ],
    offers: [],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.lists.called.map((s) => s.userId), ["b"]);
});

test("INT-07: board times read like the rest of the console (shared ago): under a minute is 'just now', a day later is 'yesterday'", () => {
  const b = buildDriveBoard({
    students,
    meetings: [{ userId: "a", company: "Acme", status: "requested", createdAt: new Date(NOW - 30_000) }],
    offers: [{ userId: "c", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: new Date(NOW - 27 * 3_600_000) }],
    offline: [],
    now: NOW,
  });
  assert.equal(b.lists.meetingsWaiting[0].detail, "Acme asked for a meet · just now");
  assert.match(b.lists.offersWaiting[0].detail, /sent yesterday$/);
});

const four = ["a", "b", "c", "d"].map(stu);

test("not open to work, online and total: only an explicit off counts; online is the drive minus offline", () => {
  const roster = [{ ...stu("a"), openToWork: false }, { ...stu("b"), openToWork: true }, stu("c")];
  const b = buildDriveBoard({ students: roster, meetings: [], offers: [], offline: [{ userId: "b" }], now: NOW });
  assert.deepEqual(b.lists.notOpen.map((s) => s.userId), ["a"]);
  assert.deepEqual(b.lists.online.map((s) => s.userId), ["a", "c"]);
  assert.deepEqual(b.lists.offline.map((s) => s.userId), ["b"]);
  assert.equal(b.lists.all.length, 3);
  const upcoming = buildDriveBoard({ students: roster, meetings: [], offers: [], offline: null, now: NOW });
  assert.equal(upcoming.lists.online.length, 0, "online is unknown unless the drive is live");
  assert.equal(upcoming.lists.notOpen.length, 1, "open to work does not depend on presence");
});

test("offer outcomes: didn't accept any, didn't answer any, and the internship / full-time split", () => {
  const b = buildDriveBoard({
    students: four,
    meetings: [],
    offers: [
      { userId: "a", company: "Acme", status: "rejected", hired: false, fullTime: false, createdAt: at(60) },
      { userId: "a", company: "Beta", status: "sent", hired: false, fullTime: true, createdAt: at(55), pastStart: true },
      { userId: "b", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(50) },
      { userId: "b", company: "Gamma", status: "expired", hired: false, fullTime: false, createdAt: at(45) },
      { userId: "c", company: "Acme", status: "rejected", hired: false, fullTime: false, createdAt: at(40) },
      { userId: "c", company: "Beta", status: "accepted", hired: false, fullTime: true, createdAt: at(35) },
      { userId: "d", company: "Acme", status: "hired", hired: true, fullTime: false, createdAt: at(30) },
    ],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.lists.declinedAll.map((s) => s.userId), ["a"], "a declined one and no yes");
  assert.equal(b.lists.declinedAll[0].detail, "Declined Acme · no reply to Beta");
  assert.deepEqual(b.lists.unanswered.map((s) => s.userId), ["b"], "all still sent or lapsed");
  assert.equal(b.lists.unanswered[0].detail, "No reply to 2 offers: Gamma, Acme");
  assert.equal(b.offerCount, 7);
  assert.deepEqual(b.offerSplit, { internship: 5, fullTime: 2 });
  assert.deepEqual(b.lists.hired.map((s) => s.userId), ["d"]);
  assert.equal(b.lists.offers.length, 4);
});

test("nudge history: counted per kind and per student, newest nudge shown, only the drive's students", () => {
  const b = buildDriveBoard({
    students,
    meetings: [{ userId: "a", company: "Acme", status: "requested", createdAt: at(30) }],
    offers: [],
    offline: [{ userId: "b" }],
    nudges: [
      { userId: "b", kind: "online", createdAt: at(300) },
      { userId: "b", kind: "online", createdAt: at(120) },
      { userId: "b", kind: "online", createdAt: at(200) },
      { userId: "c", kind: "online", createdAt: at(10) },
      { userId: "a", kind: "meeting", createdAt: at(20) },
      { userId: "a", kind: "open_to_work", createdAt: at(5) },
      { userId: "a", kind: "interview", createdAt: at(5) },
      { userId: "outsider", kind: "online", createdAt: at(1) },
    ],
    now: NOW,
  });
  assert.deepEqual(b.nudgeCounts, { nudgedOnline: 4, nudgedOpenToWork: 1, nudgedMeet: 1, nudgedOffer: 0 });
  assert.deepEqual(b.lists.nudgedOnline.map((s) => s.userId), ["b", "c"], "most nudged first");
  assert.equal(b.lists.nudgedOnline[0].detail, "Nudged 3 times · last 2 h ago");
  assert.equal(b.lists.nudgedOnline[1].detail, "Nudged 1 time · last 10 min ago");
  // Nudge again only for who still needs it: b is offline, c came online.
  assert.deepEqual(b.lists.nudgedOnline.map((s) => s.again), [true, false]);
  assert.equal(b.lists.nudgedMeet[0].again, true, "the meet request is still unanswered");
  assert.equal(b.lists.nudgedOpenToWork[0].again, false, "a is open to work (not off)");
});

test("a past drive keeps the nudge history but offers no nudge again", () => {
  const b = buildDriveBoard({ students, meetings: [], offers: [], offline: null, nudges: [{ userId: "a", kind: "offer", createdAt: at(900) }], now: NOW });
  assert.equal(b.nudgeCounts.nudgedOffer, 1);
  assert.equal(b.lists.nudgedOffer[0].again, false);
});

test("meetings: sent, accepted, completed (slot over) and expired (no reply past start + grace), counted one by one", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      // a: accepted, its 20-minute slot ended 10 min ago -> accepted and completed
      { userId: "a", company: "Acme", status: "accepted", createdAt: at(40), startsAt: at(30) },
      // a: accepted, starts in 5 min -> accepted, not completed
      { userId: "a", company: "Beta", status: "accepted", createdAt: at(2), startsAt: at(-5) },
      // b: never answered, started 15 min ago (past the 10-min grace) -> expired
      { userId: "b", company: "Acme", status: "requested", createdAt: at(20), startsAt: at(15) },
      // b: already marked expired
      { userId: "b", company: "Gamma", status: "expired", createdAt: at(90), startsAt: at(80) },
      // c: declined -> sent only; and a cancelled one that never counts
      { userId: "c", company: "Acme", status: "declined", createdAt: at(10), startsAt: at(5) },
      { userId: "c", company: "Beta", status: "cancelled", createdAt: at(10), startsAt: at(5) },
    ],
    offers: [],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.meetCounts, { sent: 5, accepted: 2, completed: 1, expired: 2, declined: 1, cancelled: 1, waiting: 0 });
  assert.deepEqual(b.lists.called.map((s) => s.userId).sort(), ["a", "b", "c"]);
  assert.deepEqual(b.lists.meetings.map((s) => s.userId), ["a"]);
  assert.deepEqual(b.lists.meetCompleted.map((s) => s.userId), ["a"]);
  assert.equal(b.lists.meetCompleted[0].detail, "Meet with Acme");
  assert.deepEqual(b.lists.meetExpired.map((s) => s.userId), ["b"]);
  assert.equal(b.lists.meetExpired[0].detail, "2 meets expired · Acme, Gamma");
});

test("interviews count as meets: picked-slot ones are accepted, marked completed count as completed, missed do not, unpicked wait", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Amazon", status: "completed", createdAt: at(300) },
      { userId: "b", company: "Amazon", status: "missed", createdAt: at(300) },
      { userId: "c", company: "Amazon", status: "requested", createdAt: at(5) }, // invite, no slot picked yet
    ],
    offers: [],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.meetCounts, { sent: 3, accepted: 2, completed: 1, expired: 0, declined: 0, cancelled: 0, waiting: 1 });
  assert.deepEqual(b.lists.meetCompleted.map((s) => s.userId), ["a"]);
  assert.deepEqual(b.lists.meetingsWaiting.map((s) => s.userId), ["c"]);
  assert.deepEqual(b.lists.called.map((s) => s.userId).sort(), ["a", "b", "c"]);
});

// Bug sheet 26 Nov: every meet status is shown (declined and cancelled too), withdrawn offers have their own list
// (and never count as offers), and the drive shows who was shortlisted.
test("26 Nov: declined and cancelled meets, withdrawn offers and shortlists are counted and listed", () => {
  const b = buildDriveBoard({
    students,
    meetings: [
      { userId: "a", company: "Acme", status: "declined", createdAt: at(50) },
      { userId: "a", company: "Beta", status: "cancelled", createdAt: at(40) },
      { userId: "b", company: "Acme", status: "accepted", createdAt: at(30) },
      { userId: "zz", company: "Acme", status: "declined", createdAt: at(20) },
    ],
    offers: [
      { userId: "b", company: "Acme", status: "withdrawn", hired: false, fullTime: false, createdAt: at(25) },
      { userId: "c", company: "Acme", status: "sent", hired: false, fullTime: false, createdAt: at(10) },
    ],
    shortlist: [
      { userId: "a", company: "Acme", createdAt: at(60) },
      { userId: "a", company: "Beta", createdAt: at(55) },
      { userId: "c", company: "Acme", createdAt: at(5) },
      { userId: "zz", company: "Acme", createdAt: at(5) },
    ],
    offline: null,
    now: NOW,
  });
  assert.deepEqual(b.meetCounts, { sent: 2, accepted: 1, completed: 0, expired: 0, declined: 1, cancelled: 1, waiting: 0 });
  assert.deepEqual(b.lists.meetDeclined.map((s) => s.userId), ["a"]);
  assert.equal(b.lists.meetDeclined[0].detail, "Declined a meet with Acme");
  assert.deepEqual(b.lists.meetCancelled.map((s) => s.userId), ["a"]);
  assert.equal(b.lists.meetCancelled[0].detail, "Meet with Beta cancelled");
  assert.equal(b.offerCount, 1);
  assert.equal(b.withdrawnCount, 1);
  assert.deepEqual(b.lists.offersWithdrawn.map((s) => s.userId), ["b"]);
  assert.equal(b.lists.offersWithdrawn[0].detail, "Acme withdrew an internship offer");
  assert.deepEqual(b.lists.offers.map((s) => s.userId), ["c"]);
  assert.equal(b.shortlistCount, 2);
  assert.deepEqual(b.lists.shortlisted.map((s) => s.userId), ["c", "a"]);
  assert.equal(b.lists.shortlisted[1].detail, "Shortlisted by Beta, Acme");
});
