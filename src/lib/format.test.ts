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
  assert.equal(formatJoiningDate("2026-10-24", now), "24 Oct 2026 · in 5 days");
  assert.equal(formatJoiningDate("2026-10-20", now), "20 Oct 2026 · tomorrow");
  assert.equal(formatJoiningDate("2026-12-01", now), "1 Dec 2026");
  assert.equal(formatJoiningDate(null, now), "To be agreed");
});
