import { test } from "node:test";
import assert from "node:assert/strict";

import { meetingHeat, MEETING_HEAT_GUIDE, WEIGHTS } from "./meeting-heat.ts";
import { feedbackOrReason, listMeetings, slotsCsv, statusText, zoneNote, type MeetingRow, type MeetingStage } from "./meeting-stage.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const H = 3_600_000;
const iso = (offsetH: number) => new Date(NOW + offsetH * H).toISOString();
const row = (id: string, stage: MeetingStage, o: Partial<MeetingRow> = {}): MeetingRow => ({
  id, kind: "interview", stage, outcome: "waiting", internId: `i-${id}`, candidate: `Student ${id}`, employerId: "e1", company: "Acme", projectId: null,
  project: null, track: "internship", campus: false, driveTitle: null, round: 1, status: "scheduled", slots: [], startsAt: null, timezone: null,
  proposedBy: "employer", respondBy: null, meetingLink: null, employerJoinedAt: null, cancelledBy: null, cancelReason: null, notes: null, reason: null,
  feedback: null, proposalId: null, createdAt: iso(-1), updatedAt: null, ...o,
});

test("guide: every weight appears in the written rules, and every rule's points come from a weight", () => {
  const written = MEETING_HEAT_GUIDE.factors.flatMap((f) => [...f.points.matchAll(/\d+/g)].map((m) => Number(m[0])));
  for (const [k, v] of Object.entries(WEIGHTS)) assert.ok(written.includes(v), `${k} (${v}) missing from the guide`);
  for (const n of written) assert.ok(Object.values(WEIGHTS).includes(n as never), `guide number ${n} is not a weight`);
});

test("worked examples score exactly as the guide adds up", () => {
  // Booked, no link, starts in 5 h: 40 + 30 = 70 -> Hot.
  const a = meetingHeat(row("a", "accepted", { slots: [iso(5)], startsAt: iso(5) }), NOW)!;
  assert.deepEqual([a.score, a.level, a.why], [WEIGHTS.noLink + WEIGHTS.startsWithin24h, "hot", "No meeting link · Starts in 5 h"]);
  // Booked with a link, starts in 2 days, full-time: 15 + 10 = 25 -> Calm.
  const b = meetingHeat(row("b", "accepted", { slots: [iso(48)], startsAt: iso(48), meetingLink: "https://meet.x", track: "full_time" }), NOW)!;
  assert.deepEqual([b.score, b.level, b.why], [WEIGHTS.startsWithin3d + WEIGHTS.fullTime, "calm", "Starts in 2 days · Full-time role"]);
  // Waiting 6 days, reply due in 10 h: 40 + 30 = 70 -> Hot.
  const c = meetingHeat(row("c", "sent", { status: "pending", slots: [iso(30)], respondBy: iso(10), createdAt: iso(-6 * 24) }), NOW)!;
  assert.deepEqual([c.score, c.level, c.why], [WEIGHTS.replyDueWithin24h + 6 * WEIGHTS.perDayWaiting, "hot", "Reply due in 10 h · Waiting 6 days for the student"]);
  // Waiting 10 days: the days cap at 30; reply due in 2 days: + 15 -> 45 Warm.
  const d = meetingHeat(row("d", "sent", { status: "pending", slots: [iso(60)], respondBy: iso(48), createdAt: iso(-10 * 24) }), NOW)!;
  assert.deepEqual([d.score, d.level], [WEIGHTS.replyDueWithin3d + WEIGHTS.maxDaysWaiting, "warm"]);
});

test("closed meetings have no heat and sort after the open ones, newest first", () => {
  for (const s of ["completed", "expired", "withdrawn"] as const) assert.equal(meetingHeat(row(s, s), NOW), null);
  const all = [
    row("old-closed", "completed", { createdAt: iso(-100) }),
    row("calm", "accepted", { slots: [iso(200)], startsAt: iso(200), meetingLink: "x" }),
    row("new-closed", "expired", { createdAt: iso(-2) }),
    row("hot", "accepted", { slots: [iso(5)], startsAt: iso(5) }),
    row("warm", "accepted", { slots: [iso(200)], startsAt: iso(200) }),
  ];
  const { listed } = listMeetings(all, {}, { key: "heat", dir: "desc" }, NOW);
  assert.deepEqual(listed.map((r) => r.id), ["hot", "warm", "calm", "new-closed", "old-closed"]);
  // The Heat filter shows exactly the rows of each level, and the levels add up to the list.
  const n = (heat: string) => listMeetings(all, { heat }, { key: "heat", dir: "desc" }, NOW).listed.length;
  assert.deepEqual([n("hot"), n("warm"), n("calm"), n("closed")], [1, 1, 1, 2]);
  assert.equal(n("hot") + n("warm") + n("calm") + n("closed"), all.length);
});

test("slots, time zone, status and feedback-or-reason lines", () => {
  const r = row("s", "accepted", { slots: [iso(5), iso(29)], startsAt: iso(29), timezone: "Europe/London" });
  assert.equal(slotsCsv(r), "28 Nov, 10:30 PM IST; 29 Nov, 10:30 PM IST (picked) · Meeting time zone: Europe/London (5:00 PM GMT there)");
  assert.equal(zoneNote({ timezone: "Asia/Kolkata", startsAt: iso(5) }), null);
  assert.equal(slotsCsv(row("u", "sent", { slots: [iso(5)] })), "28 Nov, 10:30 PM IST · Not picked yet");
  assert.equal(statusText(row("x", "expired", { outcome: "not_accepted" })), "Expired · Not accepted");
  assert.equal(feedbackOrReason(row("w", "withdrawn", { reason: "Withdrawn by the employer: Role filled" })), "Withdrawn by the employer: Role filled");
  assert.equal(feedbackOrReason(row("c", "completed", { feedback: "Strong React" })), "Strong React");
  assert.equal(feedbackOrReason(row("e", "expired", { cancelReason: " Busy with exams " })), "Busy with exams");
  assert.equal(feedbackOrReason(row("a", "accepted", { cancelReason: "x" })), null);
});

test("reply due = the lifecycle's lapse: the earlier of respond-by and the last offered slot", () => {
  // Respond-by in 5 days, but the last offered slot starts in 3 h: the invite lapses in 3 h.
  const r = row("due", "sent", { status: "pending", slots: [iso(1), iso(3)], respondBy: iso(5 * 24), createdAt: iso(-1) });
  const h = meetingHeat(r, NOW)!;
  assert.equal(h.score, WEIGHTS.replyDueWithin24h);
  assert.match(h.why, /^Reply due in 3 h/);
});

test("the why line names who owes the reply; old requests with no times get only the capped days", () => {
  const byIntern = meetingHeat(row("p", "sent", { status: "proposed", proposedBy: "intern", slots: [iso(100)], createdAt: iso(-2 * 24) }), NOW)!;
  assert.match(byIntern.why, /Waiting 2 days for the company/);
  const byEmployer = meetingHeat(row("e", "sent", { status: "pending", proposedBy: "employer", slots: [iso(100)], createdAt: iso(-2 * 24) }), NOW)!;
  assert.match(byEmployer.why, /Waiting 2 days for the student/);
  const old = meetingHeat(row("o", "sent", { status: "pending", slots: [], respondBy: null, createdAt: iso(-40 * 24) }), NOW)!;
  assert.deepEqual([old.score, old.level], [WEIGHTS.maxDaysWaiting, "calm"]);
  assert.ok(MEETING_HEAT_GUIDE.factors.some((f) => /company when the student proposed/.test(f.label)));
  assert.match(MEETING_HEAT_GUIDE.noHeat + MEETING_HEAT_GUIDE.factors.map((f) => f.label).join(" "), /no offered times and no reply-by date/);
});

test("slots: a closed meeting with no pick says 'Not picked'; an open one 'Not picked yet'", () => {
  assert.match(slotsCsv(row("x", "expired", { slots: [iso(-5)] })), /· Not picked$/);
  assert.match(slotsCsv(row("w", "withdrawn", { slots: [iso(5)] })), /· Not picked$/);
  assert.match(slotsCsv(row("s", "sent", { slots: [iso(5)] })), /· Not picked yet$/);
});
