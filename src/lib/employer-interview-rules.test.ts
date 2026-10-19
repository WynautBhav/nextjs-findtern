import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canMarkMissed,
  displayInterviewStatus,
  hasDuplicateSlots,
  isBlockingInterview,
  isMeetingLinkLive,
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

test("suggested slots: next quarter hour at least an hour out, then +1h and +2h", async () => {
  const { suggestedSlots } = await import("./employer-interview-rules.ts");
  // 10:07 IST on 19 Oct 2026 = 04:37 UTC.
  const now = Date.UTC(2026, 9, 19, 4, 37);
  assert.deepEqual(suggestedSlots(now, "Asia/Kolkata"), ["2026-10-19T11:15", "2026-10-19T12:15", "2026-10-19T13:15"]);
  // Exactly on a quarter, one hour ahead stays on it; crosses midnight cleanly.
  const late = Date.UTC(2026, 9, 19, 17, 15); // 22:45 IST
  assert.deepEqual(suggestedSlots(late, "Asia/Kolkata"), ["2026-10-19T23:45", "2026-10-20T00:45", "2026-10-20T01:45"]);
});
