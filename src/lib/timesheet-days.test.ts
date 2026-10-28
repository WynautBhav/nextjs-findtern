import assert from "node:assert/strict";
import { test } from "node:test";

import { periodDays, todayIst, weekdayOf } from "./timesheet-days.ts";

test("a stored one-month period has exactly its calendar days (no phantom day in IST)", () => {
  // As the create route stores it: start T00:00Z, end T23:59:59.999Z.
  const start = new Date("2026-10-12T00:00:00.000Z");
  const end = new Date("2026-11-11T23:59:59.999Z");
  const days = periodDays(start, end);
  assert.equal(days.length, 31);
  assert.equal(days[0], "2026-10-12");
  assert.equal(days.at(-1), "2026-11-11");
});

test("ISO strings from the page and plain dates walk the same way", () => {
  assert.deepEqual(periodDays("2026-10-30T00:00:00.000Z", "2026-11-02T23:59:59.999Z"), [
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
  ]);
  assert.deepEqual(periodDays("2026-02-27", "2026-03-01"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.deepEqual(periodDays(null, "2026-03-01"), []);
});

test("weekday and India-today are calendar-based", () => {
  assert.equal(weekdayOf("2026-10-19"), 1); // Monday
  // 20:00 UTC on the 18th is already the 19th in India.
  assert.equal(todayIst(new Date("2026-10-18T20:00:00Z")), "2026-10-19");
});

test("a period reads by its calendar days, whatever the server's zone", async () => {
  const { formatPeriodDays } = await import("./timesheet-days.ts");
  // Stored bounds: the end at 23:59:59.999Z must not roll into the next day.
  assert.equal(formatPeriodDays(new Date("2026-10-18T00:00:00.000Z"), new Date("2026-11-17T23:59:59.999Z")), "18 Oct – 17 Nov 2026");
  assert.equal(formatPeriodDays("2026-10-01", "2026-10-31"), "1 – 31 Oct 2026");
  assert.equal(formatPeriodDays("2026-10-18", "2026-10-18"), "18 Oct 2026", "QA-152: one day is one date");
  assert.equal(formatPeriodDays("2026-12-18", "2027-01-17"), "18 Dec 2026 – 17 Jan 2027");
  assert.equal(formatPeriodDays(null, "2027-01-17"), "");
});
