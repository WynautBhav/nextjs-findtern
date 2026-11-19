import assert from "node:assert/strict";
import { test } from "node:test";

import { engagementDayLabel } from "./engagement-day.ts";

const now = new Date("2026-11-19T06:00:00Z"); // 11:30 IST, 19 Nov

test("before the start date it says when it starts, never day 1", () => {
  assert.equal(engagementDayLabel("2026-11-24", new Date("2026-11-18T10:00:00Z"), now), "starts 24 Nov");
});

test("the start date itself is day 1 and it counts up from there", () => {
  assert.equal(engagementDayLabel("2026-11-19", new Date("2026-11-10T10:00:00Z"), now), "day 1");
  assert.equal(engagementDayLabel("2026-11-15", null, now), "day 5");
});

test("IST midnight: 18:30 UTC is already the next day", () => {
  assert.equal(engagementDayLabel("2026-11-20", null, new Date("2026-11-19T18:45:00Z")), "day 1");
});

test("without a start date it falls back to the hire date; with neither, no label", () => {
  assert.equal(engagementDayLabel(null, new Date("2026-11-17T06:00:00Z"), now), "day 3");
  assert.equal(engagementDayLabel("", new Date("2026-11-25T06:00:00Z"), now), null);
  assert.equal(engagementDayLabel(undefined, null, now), null);
});
