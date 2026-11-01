import test from "node:test";
import assert from "node:assert/strict";

import { GAZETTED_HOLIDAYS_2027, defaultDayStatus, holidayName, isWeekendISO } from "./holidays.ts";

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

test("2027 gazetted holidays (DoP&T O.M. dated 16.07.2026) are pre-marked", () => {
  assert.equal(holidayName("2027-01-26"), "Republic Day");
  assert.equal(holidayName("2027-10-29"), "Diwali");
  assert.equal(holidayName("2027-08-15"), "Independence Day and Milad-un-Nabi");
  assert.equal(holidayName("2027-03-10"), "Id-ul-Fitr");
  assert.equal(defaultDayStatus("2027-03-23"), "Holiday"); // Holi, a Tuesday
  assert.equal(defaultDayStatus("2027-03-24"), ""); // the day after is an ordinary weekday
  assert.equal(holidayName("2028-01-26"), null, "no list for 2028 yet: nothing is guessed");
});

test("the 2027 list has the 16 distinct dates of the 17 holidays, each a real date", () => {
  const dates = Object.keys(GAZETTED_HOLIDAYS_2027);
  assert.equal(dates.length, 16);
  for (const d of dates) assert.ok(!Number.isNaN(new Date(`${d}T12:00:00Z`).getTime()) && d.startsWith("2027-"), d);
});
