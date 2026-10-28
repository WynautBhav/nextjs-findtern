import test from "node:test";
import assert from "node:assert/strict";

import { shortDate, shortDateTime } from "./format.ts";

test("three-letter months: September is Sep in dates and date-times", () => {
  const d = new Date("2026-09-03T06:30:00Z");
  assert.equal(shortDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }), "3 Sep 2026");
  assert.match(shortDateTime(d, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }), /^3 Sep, 12:00/i);
  assert.equal(shortDate(new Date("2026-10-03T00:00:00Z"), { day: "numeric", month: "short", timeZone: "UTC" }), "3 Oct");
});
