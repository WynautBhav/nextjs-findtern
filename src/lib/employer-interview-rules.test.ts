import { test } from "node:test";
import assert from "node:assert/strict";

import {
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

test("suggested slots: nearest quarter hour at least 15 min out, then +1h and +2h", async () => {
  const { suggestedSlots } = await import("./employer-interview-rules.ts");
  // 10:07 IST on 19 Oct 2026 = 04:37 UTC -> 10:22 rounds up to 10:30.
  const now = Date.UTC(2026, 9, 19, 4, 37);
  assert.deepEqual(suggestedSlots(now, "Asia/Kolkata"), ["2026-10-19T10:30", "2026-10-19T11:30", "2026-10-19T12:30"]);
  // 10:14 IST -> 10:29 rounds to 10:30; 10:16 IST -> 10:31 rounds to 10:45.
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 4, 44), "Asia/Kolkata")[0], "2026-10-19T10:30");
  assert.equal(suggestedSlots(Date.UTC(2026, 9, 19, 4, 46), "Asia/Kolkata")[0], "2026-10-19T10:45");
  // Exactly on a quarter, 15 minutes ahead stays on it; crosses midnight cleanly.
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
