import assert from "node:assert/strict";
import { test } from "node:test";

import { timezoneForLocation, wallTimeToUtc } from "./timezones.ts";

test("IST wall time converts to UTC", () => {
  assert.equal(wallTimeToUtc("2026-11-03T15:30", "Asia/Kolkata").toISOString(), "2026-11-03T10:00:00.000Z");
});

test("New York respects DST", () => {
  assert.equal(wallTimeToUtc("2026-07-01T09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(wallTimeToUtc("2026-12-01T09:00", "America/New_York").toISOString(), "2026-12-01T14:00:00.000Z");
});

test("employer timezone follows the company's country, and state where it spans zones", () => {
  assert.equal(timezoneForLocation({ country: "India", state: "Karnataka" }), "Asia/Kolkata");
  assert.equal(timezoneForLocation({ country: "united kingdom" }), "Europe/London");
  assert.equal(timezoneForLocation({ country: "United States", state: "California" }), "America/Los_Angeles");
  assert.equal(timezoneForLocation({ country: "United States", state: "New York" }), "America/New_York");
  assert.equal(timezoneForLocation({ country: null }), "Asia/Kolkata");
});
