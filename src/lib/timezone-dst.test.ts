import test from "node:test";
import assert from "node:assert/strict";

import { isKnownTimezone, projectZone, wallTimeToUtc } from "./timezones.ts";
import { formatIst, formatIstClock, formatIstDay } from "./format.ts";

/**
 * Owner's rule: interns see India time; employers see the project's zone; an
 * employer-chosen wall time is converted to the right UTC instant ON THAT
 * DATE (IANA zones through Intl, never a fixed offset), so DST is right,
 * including on and around the switch days.
 *
 * Decisions pinned here:
 *  - a wall time that does not exist (the hour skipped on spring-forward day)
 *    is shifted FORWARD by the gap: 02:30 → 03:30 local;
 *  - an ambiguous wall time (the hour repeated on fall-back day) is the FIRST
 *    occurrence (the daylight-time one).
 */
const utc = (local: string, tz: string) => wallTimeToUtc(local, tz).toISOString();
const ist = (local: string, tz: string) => formatIst(wallTimeToUtc(local, tz));

test("America/New_York 10:00 across spring-forward 2026-03-08 (switch 02:00 EST → 03:00 EDT)", () => {
  assert.equal(utc("2026-03-07T10:00", "America/New_York"), "2026-03-07T15:00:00.000Z"); // EST
  assert.equal(utc("2026-03-08T10:00", "America/New_York"), "2026-03-08T14:00:00.000Z"); // EDT
  assert.equal(utc("2026-03-09T10:00", "America/New_York"), "2026-03-09T14:00:00.000Z");
  assert.equal(ist("2026-03-07T10:00", "America/New_York"), "Sat 7 Mar, 8:30 PM IST");
  assert.equal(ist("2026-03-08T10:00", "America/New_York"), "Sun 8 Mar, 7:30 PM IST");
});

test("America/New_York 10:00 across fall-back 2026-11-01 (switch 02:00 EDT → 01:00 EST)", () => {
  assert.equal(utc("2026-10-31T10:00", "America/New_York"), "2026-10-31T14:00:00.000Z"); // EDT
  assert.equal(utc("2026-11-01T10:00", "America/New_York"), "2026-11-01T15:00:00.000Z"); // EST
  assert.equal(utc("2026-11-02T10:00", "America/New_York"), "2026-11-02T15:00:00.000Z");
  assert.equal(ist("2026-10-31T10:00", "America/New_York"), "Sat 31 Oct, 7:30 PM IST");
  assert.equal(ist("2026-11-01T10:00", "America/New_York"), "Sun 1 Nov, 8:30 PM IST");
});

test("America/New_York on ordinary days: summer 4h, winter 5h behind UTC", () => {
  assert.equal(utc("2026-06-15T10:00", "America/New_York"), "2026-06-15T14:00:00.000Z");
  assert.equal(utc("2026-01-15T10:00", "America/New_York"), "2026-01-15T15:00:00.000Z");
  assert.equal(ist("2026-06-15T10:00", "America/New_York"), "Mon 15 Jun, 7:30 PM IST");
  assert.equal(ist("2026-01-15T10:00", "America/New_York"), "Thu 15 Jan, 8:30 PM IST");
});

test("Europe/London across the last Sundays of March (29th) and October (25th), 2026", () => {
  assert.equal(utc("2026-03-28T10:00", "Europe/London"), "2026-03-28T10:00:00.000Z"); // GMT
  assert.equal(utc("2026-03-29T10:00", "Europe/London"), "2026-03-29T09:00:00.000Z"); // BST
  assert.equal(utc("2026-10-24T10:00", "Europe/London"), "2026-10-24T09:00:00.000Z"); // BST
  assert.equal(utc("2026-10-25T10:00", "Europe/London"), "2026-10-25T10:00:00.000Z"); // GMT
  assert.equal(ist("2026-03-28T10:00", "Europe/London"), "Sat 28 Mar, 3:30 PM IST");
  assert.equal(ist("2026-03-29T10:00", "Europe/London"), "Sun 29 Mar, 2:30 PM IST");
  assert.equal(ist("2026-10-24T10:00", "Europe/London"), "Sat 24 Oct, 2:30 PM IST");
  assert.equal(ist("2026-10-25T10:00", "Europe/London"), "Sun 25 Oct, 3:30 PM IST");
});

test("Australia/Sydney (southern hemisphere): DST starts 2026-10-04, ends 2026-04-05", () => {
  assert.equal(utc("2026-10-03T10:00", "Australia/Sydney"), "2026-10-03T00:00:00.000Z"); // AEST +10
  assert.equal(utc("2026-10-04T10:00", "Australia/Sydney"), "2026-10-03T23:00:00.000Z"); // AEDT +11
  assert.equal(utc("2026-04-04T10:00", "Australia/Sydney"), "2026-04-03T23:00:00.000Z"); // AEDT
  assert.equal(utc("2026-04-05T10:00", "Australia/Sydney"), "2026-04-05T00:00:00.000Z"); // AEST
  assert.equal(ist("2026-10-03T10:00", "Australia/Sydney"), "Sat 3 Oct, 5:30 AM IST");
  assert.equal(ist("2026-10-04T10:00", "Australia/Sydney"), "Sun 4 Oct, 4:30 AM IST");
  assert.equal(ist("2026-04-05T10:00", "Australia/Sydney"), "Sun 5 Apr, 5:30 AM IST");
});

test("zones without DST never move: Asia/Dubai (+4) and Asia/Kolkata (+5:30)", () => {
  for (const day of ["2026-01-15", "2026-03-08", "2026-07-01", "2026-11-01"]) {
    assert.equal(utc(`${day}T10:00`, "Asia/Dubai"), `${day}T06:00:00.000Z`);
    assert.equal(utc(`${day}T10:00`, "Asia/Kolkata"), `${day}T04:30:00.000Z`);
    assert.match(ist(`${day}T10:00`, "Asia/Dubai"), /11:30 AM IST$/);
    assert.match(ist(`${day}T10:00`, "Asia/Kolkata"), /10:00 AM IST$/);
  }
});

test("a wall time that does not exist (spring-forward gap) is shifted forward by the gap", () => {
  assert.equal(utc("2026-03-08T02:30", "America/New_York"), "2026-03-08T07:30:00.000Z"); // = 03:30 EDT
  assert.equal(utc("2026-03-29T01:30", "Europe/London"), "2026-03-29T01:30:00.000Z"); // = 02:30 BST
  assert.equal(utc("2026-10-04T02:30", "Australia/Sydney"), "2026-10-03T16:30:00.000Z"); // = 03:30 AEDT
});

test("an ambiguous wall time (fall-back repeat) is the first occurrence, the daylight-time one", () => {
  assert.equal(utc("2026-11-01T01:30", "America/New_York"), "2026-11-01T05:30:00.000Z"); // EDT, not 06:30Z
  assert.equal(utc("2026-10-25T01:30", "Europe/London"), "2026-10-25T00:30:00.000Z"); // BST, not 01:30Z
  assert.equal(utc("2026-04-05T02:30", "Australia/Sydney"), "2026-04-04T15:30:00.000Z"); // AEDT
});

test("the intern reads the same slot in India time; the employer in the project's zone, both DST-right", () => {
  const slot = wallTimeToUtc("2026-03-08T10:00", "America/New_York"); // spring-forward day
  assert.equal(formatIst(slot), "Sun 8 Mar, 7:30 PM IST"); // intern
  assert.equal(formatIstClock(slot), "7:30 PM IST");
  assert.equal(formatIstDay(slot), "Sun 8 Mar");
  assert.equal(formatIst(slot, { zone: "America/New_York" }), "Sun 8 Mar, 10:00 AM EDT"); // employer
  assert.equal(formatIstClock(slot, "America/New_York"), "10:00 AM EDT");
  // a late-evening New York slot is already the next morning in India
  const late = wallTimeToUtc("2026-11-01T20:00", "America/New_York"); // EST → 01:00Z Nov 2
  assert.equal(formatIst(late), "Mon 2 Nov, 6:30 AM IST");
  assert.equal(formatIst(late, { zone: "America/New_York" }), "Sun 1 Nov, 8:00 PM EST");
});

test("a fixed-offset 'zone' (no DST) is never accepted as a project zone", () => {
  assert.equal(isKnownTimezone("+05:30"), false);
  assert.equal(isKnownTimezone("-05:00"), false);
  assert.equal(isKnownTimezone("America/New_York"), true);
  assert.equal(projectZone("+05:30", "America/New_York"), "America/New_York");
  assert.equal(projectZone("GMT+5:30"), "Asia/Kolkata");
});
