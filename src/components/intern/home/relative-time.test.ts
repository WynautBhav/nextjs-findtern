import assert from "node:assert/strict";
import { test } from "node:test";

import { relativeDay } from "./relative-time.ts";

const now = new Date("2026-11-07T10:00:00Z");

test("relativeDay", () => {
  assert.equal(relativeDay(new Date("2026-11-07T01:00:00Z"), now), "Today");
  assert.equal(relativeDay(new Date("2026-11-06T09:00:00Z"), now), "Yesterday");
  assert.equal(relativeDay(new Date("2026-11-03T09:00:00Z"), now), "4 days ago");
  assert.equal(relativeDay(new Date("2026-10-30T09:00:00Z"), now), "Last week");
  assert.match(relativeDay(new Date("2026-09-01T09:00:00Z"), now), /1 Sept?/);
});
