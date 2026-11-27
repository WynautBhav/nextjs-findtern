import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDriveBoard, meetNudgeKind, type DriveStudentRef, type MeetingRow } from "./drive-board.ts";
import { nudgeHref, planNudge } from "./nudge-plan.ts";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000);
const stu = (id: string): DriveStudentRef => ({ userId: id, name: `Student ${id}`, rollNo: null, year: 4, branch: "CSE", phone: null, openToWork: id !== "e" });
const students = ["a", "b", "c", "d", "e"].map(stu);
const meet = (userId: string, status: string, startsInMin: number): MeetingRow => ({ userId, company: "Acme", status, createdAt: at(60), startsAt: new Date(NOW + startsInMin * 60_000) });

test("a meet request the student has not answered gets the meeting nudge; a booked one still ahead gets the reminder; the rest none", () => {
  assert.equal(meetNudgeKind(meet("a", "requested", 5), NOW), "meeting");
  assert.equal(meetNudgeKind({ ...meet("a", "requested", 0), startsAt: undefined }, NOW), "meeting");
  assert.equal(meetNudgeKind(meet("a", "requested", -11), NOW), null, "lapsed after the grace");
  assert.equal(meetNudgeKind(meet("a", "accepted", 90), NOW), "meeting_reminder");
  assert.equal(meetNudgeKind(meet("a", "accepted", -10), NOW), "meeting_reminder", "running now");
  assert.equal(meetNudgeKind(meet("a", "accepted", -30), NOW), null, "already over");
  for (const s of ["completed", "missed", "declined", "expired", "cancelled"]) assert.equal(meetNudgeKind(meet("a", s, 60), NOW), null, s);
});

test("every list that shows a student with a waiting or booked meet offers that student a nudge", () => {
  const b = buildDriveBoard({
    students,
    meetings: [meet("a", "requested", 5), meet("b", "accepted", 90), meet("c", "accepted", -60), meet("d", "requested", 3), meet("d", "accepted", 120)],
    offers: [],
    offline: [],
    now: NOW,
  });
  const kind = (list: "called" | "meetings", id: string) => b.lists[list].find((s) => s.userId === id)?.meetNudge;
  assert.equal(kind("called", "a"), "meeting");
  assert.equal(kind("called", "b"), "meeting_reminder");
  assert.equal(kind("called", "c"), undefined, "its meet is over");
  assert.equal(kind("called", "d"), "meeting", "an unanswered request outranks a booked one");
  assert.equal(kind("meetings", "b"), "meeting_reminder");
  assert.equal(kind("meetings", "c"), undefined);
});

test("a nudge shows how often it was sent: open to work, meeting and reminder rows carry 'Nudged N times · last ...'", () => {
  const b = buildDriveBoard({
    students,
    meetings: [meet("a", "requested", 5), meet("b", "accepted", 90)],
    offers: [],
    offline: [],
    nudges: [
      { userId: "e", kind: "open_to_work", createdAt: at(300) },
      { userId: "e", kind: "open_to_work", createdAt: at(120) },
      { userId: "e", kind: "open_to_work", createdAt: at(200) },
      { userId: "a", kind: "meeting", createdAt: at(20) },
      { userId: "b", kind: "meeting_reminder", createdAt: at(30) },
    ],
    now: NOW,
  });
  assert.equal(b.lists.notOpen[0].detail, "Open to work is off · Nudged 3 times · last 2 h ago");
  assert.match(b.lists.meetingsWaiting[0].detail, /· Nudged 1 time · last 20 min ago$/);
  assert.match(b.lists.called.find((s) => s.userId === "b")!.detail, /· Nudged 1 time · last 30 min ago$/);
  assert.equal(b.nudgeCounts.nudgedMeet, 1, "reminders are not counted as meet requests");
});

test("the reminder is its own kind: own copy, bell link on the dashboard, same 10-minute cooldown", () => {
  const plan = planNudge({ kind: "meeting_reminder", collegeName: "JKLU", now: new Date(NOW), lastSameKindAt: null, link: (p) => `https://x.in${p}` });
  assert.equal(plan.cooldown, false);
  if (plan.cooldown) return;
  assert.match(plan.copy.message, /booked/i);
  assert.equal(plan.copy.url, nudgeHref("meeting_reminder"));
  assert.equal(planNudge({ kind: "meeting_reminder", collegeName: "JKLU", now: new Date(NOW), lastSameKindAt: new Date(NOW - 60_000), link: () => null }).cooldown, true);
});
