import test from "node:test";
import assert from "node:assert/strict";

import { projectZone, wallTimeToUtc } from "./timezones.ts";
import { formatSlotTime } from "./format.ts";

test("the project's own zone wins over the interview's and the company's", () => {
  assert.equal(projectZone("America/New_York", "Asia/Kolkata", "Europe/London"), "America/New_York");
});

test("fallbacks apply in order only when the project sets none", () => {
  assert.equal(projectZone(null, "Europe/Berlin", "Asia/Tokyo"), "Europe/Berlin");
  assert.equal(projectZone("", undefined, "Asia/Tokyo"), "Asia/Tokyo");
});

test("a blank, group header or unknown zone is skipped, ending at India", () => {
  assert.equal(projectZone("group-asia", "Not/AZone", "  "), "Asia/Kolkata");
  assert.equal(projectZone("Mars/Base", "Australia/Sydney"), "Australia/Sydney");
  assert.equal(projectZone(null), "Asia/Kolkata");
});

test("two projects with different zones show the same instant on their own clocks", () => {
  const slot = wallTimeToUtc("2026-11-20T10:00", "America/New_York"); // 15:00Z
  const ny = formatSlotTime(slot, projectZone("America/New_York"));
  const ist = formatSlotTime(slot, projectZone("Asia/Kolkata"));
  assert.match(ny, /10:00 am/i);
  assert.match(ist, /8:30 pm/i);
  assert.notEqual(ny, ist);
});

import { formatIst, formatIstClock, formatIstDay } from "./format.ts";

test("the labelled helpers read a slot on the zone passed, defaulting to India", () => {
  const slot = new Date("2026-11-20T15:00:00Z");
  assert.equal(formatIstClock(slot), "8:30 PM IST");
  assert.equal(formatIstClock(slot, "Asia/Kolkata"), "8:30 PM IST");
  assert.match(formatIstClock(slot, "America/New_York"), /^10:00 AM (EST|GMT-5)$/);
  assert.equal(formatIst(slot, { year: true }), "Fri 20 Nov 2026, 8:30 PM IST");
  assert.match(formatIst(slot, { year: true, zone: "America/New_York" }), /^Fri 20 Nov 2026, 10:00 AM /);
});

test("the day follows the zone: a late-evening India slot is still the same morning in New York", () => {
  const slot = new Date("2026-11-20T21:00:00Z"); // 02:30 on 21 Nov in India
  assert.equal(formatIstDay(slot), "Sat 21 Nov");
  assert.equal(formatIstDay(slot, "America/New_York"), "Fri 20 Nov");
});
