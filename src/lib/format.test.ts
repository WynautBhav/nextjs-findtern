import assert from "node:assert/strict";
import { test } from "node:test";

import { companyInitials, formatDayLabel } from "./format.ts";

test("company initials: two letters, legal suffixes skipped", () => {
  assert.equal(companyInitials("Northwind Labs"), "NL");
  assert.equal(companyInitials("Acme"), "AC");
  assert.equal(companyInitials("Zeta Pvt. Ltd."), "ZE");
  assert.equal(companyInitials("The Hindu"), "HI");
  assert.equal(companyInitials("R&D Works"), "RD");
  assert.equal(companyInitials(""), "?");
  assert.equal(companyInitials(null), "?");
});
test("future dates are labelled ahead, not as Today", () => {
  const now = new Date("2026-10-19T06:00:00Z"); // 11:30 IST
  assert.equal(formatDayLabel("2026-10-19", now), "Today");
  assert.equal(formatDayLabel("2026-10-20", now), "Tomorrow");
  assert.equal(formatDayLabel("2026-10-24", now), "In 5 days");
  assert.match(formatDayLabel("2026-11-02", now), /2 Nov 2026/);
  assert.equal(formatDayLabel("2026-10-18T06:00:00Z", now), "Yesterday");
});

test("joining dates are absolute, with a hint when close", async () => {
  const { formatJoiningDate } = await import("./format.ts");
  const now = new Date("2026-10-19T06:00:00Z");
  assert.equal(formatJoiningDate("2026-10-24", now), "24/10/2026 · in 5 days");
  assert.equal(formatJoiningDate("2026-10-20", now), "20/10/2026 · tomorrow");
  assert.equal(formatJoiningDate("2026-12-01", now), "01/12/2026");
  assert.equal(formatJoiningDate(null, now), "To be agreed");
});

/* Bug sheet 7, S2 r7: an employer books in their own zone, the intern sees
 * the same instant in IST, labelled, with the employer's DST respected. */
test("employer slots convert to IST, DST-correct and labelled", async () => {
  const { formatIst, formatIstClock, formatIstDay } = await import("./format.ts");
  const { wallTimeToUtc } = await import("./timezones.ts");
  const ist = (wall: string, tz: string) => formatIst(wallTimeToUtc(wall, tz));

  // Dubai is UTC+4 all year: 10:00 GST is 11:30 IST.
  assert.equal(ist("2026-07-10T10:00", "Asia/Dubai"), "Fri 10 Jul, 11:30 AM IST");
  assert.equal(ist("2026-01-15T10:00", "Asia/Dubai"), "Thu 15 Jan, 11:30 AM IST");
  // New York: EDT (UTC-4) in summer, EST (UTC-5) in winter.
  assert.equal(ist("2026-07-10T10:00", "America/New_York"), "Fri 10 Jul, 7:30 PM IST");
  assert.equal(ist("2026-01-15T10:00", "America/New_York"), "Thu 15 Jan, 8:30 PM IST");
  // The Sunday the clocks go back (1 Nov 2026): 10:00 is already EST.
  assert.equal(ist("2026-11-01T10:00", "America/New_York"), "Sun 1 Nov, 8:30 PM IST");
  // An evening slot in New York is the next morning in India.
  assert.equal(ist("2026-07-10T20:00", "America/New_York"), "Sat 11 Jul, 5:30 AM IST");
  // London on BST.
  assert.equal(ist("2026-07-10T09:00", "Europe/London"), "Fri 10 Jul, 1:30 PM IST");
  // India to India is unchanged.
  assert.equal(ist("2026-07-10T15:45", "Asia/Kolkata"), "Fri 10 Jul, 3:45 PM IST");

  const midnight = new Date("2026-07-10T18:30:00Z");
  assert.equal(formatIstClock(midnight), "12:00 AM IST");
  assert.equal(formatIstDay(midnight), "Sat 11 Jul");
  assert.equal(formatIst(midnight, { year: true }), "Sat 11 Jul 2026, 12:00 AM IST");
  assert.equal(formatIst(null), "Time to be confirmed");
  assert.equal(formatIst("not a date"), "Time to be confirmed");
});
