import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canMarkCompleted,
  canMarkMissed,
  displayInterviewStatus,
  hasDuplicateSlots,
  isBlockingInterview,
  isMeetingLinkLive,
  isMeetingOver,
  isStaleInterview,
  meetingTime,
} from "./employer-interview-rules.ts";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const h = (hours: number) => new Date(NOW + hours * 3_600_000);

test("pending interview with every slot past is stale and stops blocking", () => {
  const iv = { status: "pending", slot1: h(-5), slot2: h(-3), slot3: null };
  assert.equal(isStaleInterview(iv, NOW), true);
  assert.equal(isBlockingInterview(iv, NOW), false);
  assert.equal(displayInterviewStatus(iv, NOW), "expired");
});

test("one future slot keeps a pending interview blocking", () => {
  const iv = { status: "pending", slot1: h(-5), slot2: h(3), slot3: null };
  assert.equal(isStaleInterview(iv, NOW), false);
  assert.equal(isBlockingInterview(iv, NOW), true);
});

test("closed interviews are never stale or blocking", () => {
  const iv = { status: "completed", slot1: h(-5), slot2: null, slot3: null };
  assert.equal(isStaleInterview(iv, NOW), false);
  assert.equal(isBlockingInterview(iv, NOW), false);
});

test("meeting time falls back to the first non-empty slot", () => {
  const iv = { status: "scheduled", slot1: null, slot2: h(2), slot3: h(4), selectedSlot: null };
  assert.equal(meetingTime(iv), h(2).getTime());
});

test("link hides an hour after the start; missed needs 15 minutes", () => {
  const iv = { status: "scheduled", slot1: h(-0.5), slot2: null, slot3: null, selectedSlot: 1 };
  assert.equal(isMeetingLinkLive(iv, NOW), true);
  assert.equal(canMarkMissed(iv, NOW), true);
  const early = { ...iv, slot1: h(-0.1) };
  assert.equal(canMarkMissed(early, NOW), false);
  const late = { ...iv, slot1: h(-2) };
  assert.equal(isMeetingLinkLive(late, NOW), false);
});

test("duplicate slots are detected", () => {
  assert.equal(hasDuplicateSlots([h(1), h(1)]), true);
  assert.equal(hasDuplicateSlots([h(1), h(2), h(3)]), false);
});

test("slots start on the quarter hour", async () => {
  const { isQuarterHourWall } = await import("./employer-interview-rules.ts");
  assert.equal(isQuarterHourWall("2026-11-03T15:30"), true);
  assert.equal(isQuarterHourWall("2026-11-03T15:00"), true);
  assert.equal(isQuarterHourWall("2026-11-03T10:07"), false);
});

test("suggested slots: the next quarter hour, then +1h and +2h", async () => {
  const { suggestedSlots } = await import("./employer-interview-rules.ts");
  // Bug sheet 7 (Sheet2 r2): 12:34 -> 12:45, 13:45, 14:45.
  // 12:34 IST on 19 Oct 2026 = 07:04 UTC.
  assert.deepEqual(suggestedSlots(Date.UTC(2026, 9, 19, 7, 4), "Asia/Kolkata"), ["2026-10-19T12:45", "2026-10-19T13:45", "2026-10-19T14:45"]);
  // 10:07 IST -> 10:15; 10:14 IST -> 10:15; 10:16 IST -> 10:30.
  const now = Date.UTC(2026, 9, 19, 4, 37);
  assert.deepEqual(suggestedSlots(now, "Asia/Kolkata"), ["2026-10-19T10:15", "2026-10-19T11:15", "2026-10-19T12:15"]);
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 4, 44), "Asia/Kolkata")[0], "2026-10-19T10:15");
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 4, 46), "Asia/Kolkata")[0], "2026-10-19T10:30");
  // New York, from the employer's own zone (Sheet2 r3): 12:34 EDT -> 12:45.
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 16, 34), "America/New_York")[0], "2026-10-19T12:45");
  // Exactly on a quarter moves to the next one; crosses midnight cleanly.
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 18, 0), "Asia/Kolkata")[0], "2026-10-19T23:45"); // 23:30 IST
  const late = Date.UTC(2026, 9, 19, 18, 15); // 23:45 IST
  assert.deepEqual(suggestedSlots(late, "Asia/Kolkata"), ["2026-10-20T00:00", "2026-10-20T01:00", "2026-10-20T02:00"]);
});

test("a picked meeting blocks a new booking until its 30 minutes are over", () => {
  const iv = { status: "scheduled", slot1: h(-0.25), slot2: h(1), slot3: h(2), selectedSlot: 1 };
  assert.equal(isBlockingInterview(iv, NOW), true, "15 minutes in");
  assert.equal(isBlockingInterview(iv, NOW + 20 * 60_000), false, "35 minutes in");
});

test("feedback opens only once the meeting is over", () => {
  const scheduled = { status: "scheduled", slot1: h(-0.25), slot2: null, slot3: null, selectedSlot: 1 };
  assert.equal(isMeetingOver(scheduled, NOW), false);
  assert.equal(isMeetingOver(scheduled, NOW + 20 * 60_000), true);
  assert.equal(isMeetingOver({ status: "pending", slot1: h(-5), slot2: null, slot3: null }, NOW), false);
  assert.equal(isMeetingOver({ status: "completed", slot1: h(5), slot2: null, slot3: null }, NOW), true);
});

test("a booked meeting whose time is over reads completed, an unpicked one expired", () => {
  assert.equal(displayInterviewStatus({ status: "scheduled", slot1: h(-2), slot2: null, slot3: null, selectedSlot: 1 }, NOW), "completed");
  assert.equal(displayInterviewStatus({ status: "pending", slot1: h(-2), slot2: null, slot3: null }, NOW), "expired");
});

test("interview stage drives the schedule's actions", async () => {
  const { interviewStage, canLeaveFeedback, normalizeMeetingLink, stageRank } = await import("./employer-interview-rules.ts");
  const at = (status: string, slot: Date, selectedSlot: number | null = 1) => ({ status, slot1: slot, slot2: null, slot3: null, selectedSlot });
  assert.equal(interviewStage(at("pending", h(2), null), NOW), "awaiting_pick");
  assert.equal(interviewStage(at("pending", h(-2), null), NOW), "expired");
  assert.equal(interviewStage(at("scheduled", h(1)), NOW), "upcoming");
  assert.equal(interviewStage(at("scheduled", h(-0.25)), NOW), "live");
  assert.equal(interviewStage(at("scheduled", h(-1)), NOW), "over");
  assert.equal(interviewStage(at("missed", h(-1)), NOW), "missed");
  assert.equal(interviewStage(at("cancelled", h(-1)), NOW), "closed");
  assert.equal(canLeaveFeedback(at("missed", h(-1)), NOW), true);
  assert.equal(canLeaveFeedback(at("scheduled", h(1)), NOW), false);
  assert.ok(stageRank("upcoming") < stageRank("awaiting_pick"));
  assert.ok(stageRank("awaiting_pick") < stageRank("expired"));
  assert.ok(stageRank("expired") < stageRank("over"));
  assert.equal(normalizeMeetingLink("meet.google.com/abc"), "https://meet.google.com/abc");
  assert.equal(normalizeMeetingLink("http://x.test"), "http://x.test");
  assert.equal(normalizeMeetingLink("  "), null);
});

test("mark completed: a booked meeting from its start time on, never before (bug sheet 8)", () => {
  const booked = (at: Date) => ({ status: "scheduled", slot1: at, slot2: null, slot3: null, selectedSlot: 1 });
  assert.equal(canMarkCompleted(booked(h(1)), NOW), false);
  assert.equal(canMarkCompleted(booked(h(0)), NOW), true);
  assert.equal(canMarkCompleted({ status: "pending", slot1: h(-1), slot2: null, slot3: null }, NOW), false);
  const done = { ...booked(h(-0.1)), status: "completed" };
  assert.equal(isBlockingInterview(done, NOW), false, "a completed meeting frees the candidate");
  assert.equal(isMeetingOver(done, NOW), true);
});
