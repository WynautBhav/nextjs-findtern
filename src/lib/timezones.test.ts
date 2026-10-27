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

test("offer hours are shown in IST for the intern, DST included (EMH-31)", async () => {
  const { shiftInIst } = await import("./timezones.ts");
  // New York 09:00-17:00 on 1 Dec (EST, UTC-5) = 7:30 pm - 3:30 am IST.
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-12-01"), "7:30 pm – 3:30 am (next day) IST");
  // In July (EDT, UTC-4) the same hours are an hour earlier in India.
  assert.equal(shiftInIst("09:00", "17:00", "America/New_York", "2026-07-01"), "6:30 pm – 2:30 am (next day) IST");
  assert.equal(shiftInIst("10:00", "19:00", "Asia/Dubai", "2026-12-01"), "11:30 am – 8:30 pm IST");
  assert.equal(shiftInIst("09:00", "18:00", "Asia/Kolkata", "2026-12-01"), null);
  assert.equal(shiftInIst("flexible", "flexible", "Asia/Dubai"), null);
});
