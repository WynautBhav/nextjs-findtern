import assert from "node:assert/strict";
import test from "node:test";

import { buildDriveSummary, STRONG_SCORE } from "./drive-summary.ts";

const T0 = new Date("2026-11-20T04:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const stu = (id: string, score: number | null = 7) => ({ userId: id, name: id.toUpperCase(), branch: "CSE", year: 3, phone: null, score });

function base(over: Partial<Parameters<typeof buildDriveSummary>[0]> = {}) {
  return buildDriveSummary({
    open: true,
    driveHref: "/college/drives/d1",
    window: { start: T0, end: at(60 * 24 * 5) },
    trackingSince: new Date(T0.getTime() - 1),
    students: [stu("a"), stu("b"), stu("c", 9), stu("d", 8.5)],
    meetings: [
      { userId: "a", employerId: "e1", status: "accepted", createdAt: at(10), respondedAt: at(14) },
      { userId: "b", employerId: "e1", status: "declined", createdAt: at(20), respondedAt: at(40) },
      { userId: "b", employerId: "e2", status: "requested", createdAt: at(30), respondedAt: null },
    ],
    offers: [
      { userId: "a", employerId: "e1", status: "hired", hired: true, createdAt: at(100), answeredAt: at(160) },
      { userId: "b", employerId: "e2", status: "sent", hired: false, createdAt: at(120), answeredAt: null },
    ],
    nudges: [
      { userId: "b", kind: "meeting", createdAt: at(25) },
      { userId: "b", kind: "offer", createdAt: at(130) },
      { userId: "c", kind: "online", createdAt: at(5) },
      { userId: "d", kind: "online", createdAt: at(5) },
    ],
    minutes: new Map([["a", 120], ["b", 30], ["c", 10], ["e1", 90]]),
    onlineAt: (id) => id === "c",
    employers: [
      { employerId: "e1", company: "Acme", joinedAt: at(1), shortlisted: 3 },
      { employerId: "e2", company: "Beta", joinedAt: at(2), shortlisted: 1 },
    ],
    invitedCount: 0,
    ...over,
  });
}

test("funnel counts unique students and the share of the step before", () => {
  const s = base();
  assert.deepEqual(
    s.funnel.map((f) => [f.key, f.value, f.share, f.of, f.notThrough]),
    [["all", 4, null, null, 0], ["called", 2, 50, "of the drive", 2], ["met", 1, 50, "of those asked", 1], ["offers", 2, 50, "of the drive", 2], ["hired", 1, 50, "of those offered", 1]],
  );
  assert.equal(s.funnel[1].href, "/college/drives/d1?show=called#board");
});

test("a nudge worked when the asked-for thing happened after it", () => {
  const s = base();
  const by = Object.fromEntries(s.nudges.byKind.map((k) => [k.kind, [k.sent, k.worked]]));
  assert.deepEqual(by, { online: [2, 1], meeting: [1, 1], offer: [1, 0] });
  assert.equal(s.nudges.rows.find((r) => r.kind === "meeting")?.outcome, "Declined the meet");
  assert.deepEqual(s.nudges.again, { offer: ["b"], online: ["d"] });
});

test("online time: average over every student, never-online named while open", () => {
  const s = base();
  assert.equal(s.online.studentsAvg, 40);
  assert.equal(s.online.neverOnlineCount, 1);
  assert.deepEqual(s.online.neverOnline.map((x) => x.userId), ["d"]);
  assert.equal(s.online.employers.find((e) => e.employerId === "e1")?.minutes, 90);
  assert.equal(s.online.employers.find((e) => e.employerId === "e2")?.minutes, 0);
});

test("before any tracking, online time is unknown rather than zero", () => {
  const s = base({ trackingSince: null });
  assert.equal(s.tracked, "none");
  assert.equal(s.online.studentsAvg, null);
  assert.equal(s.employers[0].minutes, null);
  assert.equal(s.nudges.rows.find((r) => r.kind === "online")?.worked, null);
  assert.ok(!s.health.signals.some((x) => x.key === "online"));
});

test("tracking that began after the drive started is partial; after it ended, none", () => {
  assert.equal(base({ trackingSince: at(30) }).tracked, "partial");
  const late = base({ trackingSince: at(60 * 24 * 6) });
  assert.equal(late.tracked, "none");
  assert.equal(late.online.studentsAvg, null);
});

test("reply speed is the median, in minutes for meets and hours for offers", () => {
  const s = base();
  assert.equal(s.speed.meetMedianMin, 12);
  assert.equal(s.speed.offerMedianHours, 1);
  assert.deepEqual(s.speed.slowMeet.map((x) => [x.userId, x.minutes]), [["b", 20], ["a", 4]]);
});

test("missed: strong students with no meet and no offer, strongest first", () => {
  const s = base();
  assert.ok(STRONG_SCORE <= 8.5);
  assert.deepEqual(s.missed.rows.map((r) => r.userId), ["c", "d"]);
});

test("per company: meets, offers and hires", () => {
  assert.deepEqual(
    base().employers.map((e) => [e.company, e.meets, e.offers, e.hires]),
    [["Acme", 2, 1, 1], ["Beta", 1, 1, 0]],
  );
});

test("C12: a closed drive keeps every figure and drops every name", () => {
  const s = base({ open: false });
  assert.equal(s.nudges.total, 4);
  assert.deepEqual(s.nudges.rows, []);
  assert.deepEqual(s.nudges.again, {});
  assert.deepEqual(s.online.neverOnline, []);
  assert.equal(s.online.neverOnlineCount, 1);
  assert.deepEqual(s.online.most, []);
  assert.deepEqual(s.speed.slowMeet, []);
  assert.deepEqual(s.missed.rows, []);
  assert.equal(s.missed.count, 2);
  assert.ok(s.funnel.every((f) => f.href === null));
  assert.ok(!JSON.stringify(s).includes('"name"'));
});

test("health names the weak signals", () => {
  const s = base();
  // Meets 2 of 3 answered (67% < 70), offers 1 of 2 (50% < 60), reach 50%, 2 companies (< 3), online 3 of 4.
  assert.equal(s.health.verdict, "poor");
  assert.equal(s.health.line, "Below target: meet requests answered 67%, offers answered 50%, companies in the drive 2.");
});

test("nudges outside the drive window or for other students are left out", () => {
  const s = base({ nudges: [{ userId: "zz", kind: "online", createdAt: at(5) }, { userId: "a", kind: "online", createdAt: new Date(T0.getTime() - 60_000) }] });
  assert.equal(s.nudges.total, 0);
});
