import test from "node:test";
import assert from "node:assert/strict";

import { defaultDayStatus, holidayName, isWeekendISO } from "./holidays.ts";

test("gazetted holidays resolve by date", () => {
  assert.equal(holidayName("2026-01-26"), "Republic Day");
  assert.equal(holidayName("2026-10-02"), "Gandhi Jayanti");
  assert.equal(holidayName("2026-12-25"), "Christmas Day");
  assert.equal(holidayName("2026-10-12"), null);
});

test("weekends are Saturday and Sunday", () => {
  assert.equal(isWeekendISO("2026-10-11"), true); // Sunday
  assert.equal(isWeekendISO("2026-10-10"), true); // Saturday
  assert.equal(isWeekendISO("2026-10-12"), false); // Monday
});

test("fresh days default to Holiday / Fixed off / blank", () => {
  assert.equal(defaultDayStatus("2026-01-26"), "Holiday");
  assert.equal(defaultDayStatus("2026-10-11"), "Fixed off");
  assert.equal(defaultDayStatus("2026-10-12"), "");
});
