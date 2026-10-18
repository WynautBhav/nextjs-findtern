import assert from "node:assert/strict";
import { test } from "node:test";

import { wallTimeToUtc } from "./timezones.ts";

test("IST wall time converts to UTC", () => {
  assert.equal(wallTimeToUtc("2026-11-03T15:30", "Asia/Kolkata").toISOString(), "2026-11-03T10:00:00.000Z");
});

test("New York respects DST", () => {
  assert.equal(wallTimeToUtc("2026-07-01T09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(wallTimeToUtc("2026-12-01T09:00", "America/New_York").toISOString(), "2026-12-01T14:00:00.000Z");
});
