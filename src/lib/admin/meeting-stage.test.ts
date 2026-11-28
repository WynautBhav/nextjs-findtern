import { test } from "node:test";
import assert from "node:assert/strict";

import { filterMeetings, inStage, meetingStage, MEETING_STAGES, needsMeetingLink, stageCounts, type MeetingInput, type MeetingRow, type MeetingStage } from "./meeting-stage.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const MIN = 60_000;
const at = (offsetMin: number) => new Date(NOW + offsetMin * MIN);
const iv = (status: string, o: Partial<Extract<MeetingInput, { kind: "interview" }>> = {}): MeetingInput => ({
  kind: "interview", status, slot1: at(60), slot2: null, slot3: null, selectedSlot: null, respondBy: null, cancelledBy: null, ...o,
});
const call = (status: string, startMin: number, cancelledBy: string | null = null): MeetingInput => ({ kind: "call", status, startsAt: at(startMin), cancelledBy });

test("meetingStage: a picked interview whose time passed unmarked reads expired, not waiting (the dashboard bug)", () => {
  // The dashboard fed raw interviews.status into meetOutcome: "scheduled" fell to its default and read as waiting.
  assert.equal(meetingStage(iv("scheduled", { slot1: at(-120), selectedSlot: 1 }), NOW), "expired");
  assert.equal(meetingStage(iv("scheduled", { slot1: at(120), selectedSlot: 1 }), NOW), "accepted");
});

test("meetingStage: invites wait for a reply until they lapse", () => {
  assert.equal(meetingStage(iv("pending"), NOW), "sent");
  assert.equal(meetingStage(iv("proposed", { slot1: at(30), slot2: at(90) }), NOW), "sent");
  assert.equal(meetingStage(iv("pending", { respondBy: at(-5) }), NOW), "expired");
  assert.equal(meetingStage(iv("pending", { slot1: at(-90), slot2: at(-30) }), NOW), "expired");
});

test("meetingStage: decided interviews keep their meaning; declined is its own stage", () => {
  assert.equal(meetingStage(iv("completed", { slot1: at(-600), selectedSlot: 1 }), NOW), "completed");
  assert.equal(meetingStage(iv("missed", { slot1: at(-600), selectedSlot: 1 }), NOW), "expired");
  assert.equal(meetingStage(iv("declined"), NOW), "declined");
  assert.equal(meetingStage(iv("cancelled", { cancelledBy: "intern" }), NOW), "withdrawn");
  assert.equal(meetingStage(iv("cancelled", { cancelledBy: "employer" }), NOW), "withdrawn");
  // A rescheduled invite was replaced by a new one, which is the meeting: it is not counted.
  assert.equal(meetingStage(iv("rescheduled"), NOW), null);
});

test("meetingStage: drive calls", () => {
  assert.equal(meetingStage(call("requested", 5), NOW), "sent");
  assert.equal(meetingStage(call("requested", -30), NOW), "expired");
  assert.equal(meetingStage(call("accepted", 5), NOW), "accepted");
  assert.equal(meetingStage(call("accepted", -60), NOW), "expired");
  assert.equal(meetingStage(call("declined", 5), NOW), "declined");
  assert.equal(meetingStage(call("expired", -60), NOW), "expired");
  assert.equal(meetingStage(call("cancelled", 5), NOW), "withdrawn");
});

test("stageCounts: every card equals the length of the list it filters, and the stages add up to the total", () => {
  const inputs: MeetingInput[] = [
    iv("scheduled", { slot1: at(-120), selectedSlot: 1 }),
    iv("scheduled", { slot1: at(-300), selectedSlot: 1 }),
    iv("scheduled", { slot1: at(120), selectedSlot: 1 }),
    iv("scheduled", { slot1: at(240), selectedSlot: 1 }),
    iv("scheduled", { slot1: at(360), selectedSlot: 1 }),
    iv("pending"),
    iv("pending"),
    iv("completed", { slot1: at(-600), selectedSlot: 1 }),
    iv("completed", { slot1: at(-900), selectedSlot: 1 }),
    iv("declined"),
    iv("cancelled"),
    call("requested", 5),
    call("declined", 5),
    call("accepted", -60),
  ];
  const rows = inputs.map((m, i) => ({ id: `m${i}`, stage: meetingStage(m, NOW)! }));
  const counts = stageCounts(rows);
  assert.equal(counts.total, rows.length);
  assert.deepEqual(
    { sent: counts.sent, accepted: counts.accepted, completed: counts.completed, declined: counts.declined, expired: counts.expired, withdrawn: counts.withdrawn },
    { sent: 3, accepted: 3, completed: 2, declined: 2, expired: 3, withdrawn: 1 },
  );
  for (const s of MEETING_STAGES) assert.equal(counts[s], inStage(rows, s).length, s);
  assert.equal(MEETING_STAGES.reduce((t, s) => t + counts[s], 0), counts.total);
  // Disjoint: no row is in two stages.
  const seen = MEETING_STAGES.flatMap((s) => inStage(rows, s).map((r) => r.id));
  assert.equal(new Set(seen).size, rows.length);
});

test("filterMeetings: with filters on, each stage card still equals the rows its press shows", () => {
  const row = (id: string, stage: MeetingStage, o: Partial<MeetingRow> = {}): MeetingRow => ({
    id, kind: "interview", stage, internId: `i-${id}`, candidate: `Student ${id}`, employerId: "e1", company: "Acme", projectId: null, project: "Backend",
    track: "internship", campus: false, driveTitle: null, round: 1, status: "scheduled", slots: [], startsAt: null, timezone: null, proposedBy: "employer",
    respondBy: null, meetingLink: null, employerJoinedAt: null, cancelledBy: null, cancelReason: null, notes: null, reason: null, feedback: null,
    proposalId: null, createdAt: `2026-11-0${id.length}T00:00:00Z`, updatedAt: null, ...o,
  });
  const rows = [
    row("a", "expired", { campus: true }),
    row("b", "expired", { campus: true, track: "full_time" }),
    row("c", "expired", { campus: true }),
    row("d", "accepted", { campus: true }),
    row("e", "accepted"),
    row("f", "completed", { campus: true, employerId: "e2", company: "Globex" }),
    row("g", "sent", { campus: true, candidate: "Riya Sen" }),
  ];
  const campus = filterMeetings(rows, { source: "campus" });
  const c = stageCounts(campus);
  assert.equal(c.total, 6);
  assert.equal(c.expired, 3);
  for (const s of MEETING_STAGES) assert.equal(c[s], inStage(campus, s).length);
  assert.equal(filterMeetings(rows, { source: "campus", type: "internship" }).length, 5);
  assert.equal(filterMeetings(rows, { company: "e2" }).length, 1);
  assert.deepEqual(filterMeetings(rows, { q: "riya" }).map((r) => r.id), ["g"]);
  assert.equal(stageCounts(filterMeetings(rows, { source: "direct" })).accepted, 1);
});

test("needsMeetingLink: booked upcoming interviews with no link; never calls, unpicked invites or finished meetings", () => {
  const base = { kind: "interview" as const, stage: "accepted" as const, startsAt: "2026-12-01T10:00:00Z", meetingLink: null };
  assert.equal(needsMeetingLink(base), true);
  assert.equal(needsMeetingLink({ ...base, meetingLink: "  " }), true);
  assert.equal(needsMeetingLink({ ...base, meetingLink: "https://meet.google.com/x" }), false);
  assert.equal(needsMeetingLink({ ...base, startsAt: null }), false);
  assert.equal(needsMeetingLink({ ...base, kind: "call" }), false);
  assert.equal(needsMeetingLink({ ...base, stage: "expired" }), false);
});
