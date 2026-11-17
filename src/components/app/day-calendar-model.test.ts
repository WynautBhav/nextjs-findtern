import assert from "node:assert/strict";
import { test } from "node:test";

import { clampMonth, isoOf, monthGrid, monthLabel, moveDay, nextOpenDay, weekdayLabel } from "./day-calendar-model.ts";

test("monthGrid: Monday-first weeks, blanks outside the month, every day once", () => {
  const weeks = monthGrid(2026, 11); // November 2026 starts on a Sunday
  assert.equal(weeks.length, 6);
  for (const w of weeks) assert.equal(w.length, 7);
  assert.deepEqual(weeks[0], [null, null, null, null, null, null, "2026-11-01"]);
  assert.deepEqual(weeks[1], ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.deepEqual(weeks[5], ["2026-11-30", null, null, null, null, null, null]);
  const days = weeks.flat().filter(Boolean);
  assert.equal(days.length, 30);
  assert.equal(new Set(days).size, 30);
});

test("monthGrid: a month that starts on Monday and one that ends on Sunday", () => {
  const feb = monthGrid(2027, 2); // Mon 1 Feb 2027 .. Sun 28 Feb 2027
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0], "2027-02-01");
  assert.equal(feb[3][6], "2027-02-28");
  const leap = monthGrid(2028, 2);
  assert.equal(leap.flat().filter(Boolean).length, 29);
});

test("the weekend is always the last two columns", () => {
  for (const [y, m] of [[2026, 11], [2026, 12], [2027, 1], [2027, 2]] as const) {
    for (const w of monthGrid(y, m)) {
      for (const [col, day] of w.entries()) {
        if (!day) continue;
        const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
        assert.equal(col >= 5, wd === 0 || wd === 6, day);
      }
    }
  }
  assert.deepEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], [0, 1, 2, 3, 4, 5, 6].map(weekdayLabel));
});

test("moveDay: arrows, weeks, month ends, year ends", () => {
  assert.equal(moveDay("2026-11-30", 1), "2026-12-01");
  assert.equal(moveDay("2026-12-01", -1), "2026-11-30");
  assert.equal(moveDay("2026-12-28", 7), "2027-01-04");
  assert.equal(moveDay("2026-11-23", -7), "2026-11-16");
});

test("moveDay by month keeps the day of the month, clamped to the shorter month", () => {
  assert.equal(moveDay("2026-10-31", 0, 1), "2026-11-30");
  assert.equal(moveDay("2026-12-15", 0, 1), "2027-01-15");
  assert.equal(moveDay("2027-01-15", 0, -1), "2026-12-15");
  assert.equal(moveDay("2028-01-31", 0, 1), "2028-02-29");
});

test("nextOpenDay: the first day, from a start, that the rule does not disable", () => {
  const weekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  assert.equal(nextOpenDay("2026-11-21", weekend), "2026-11-23");
  assert.equal(nextOpenDay("2026-11-23", weekend), "2026-11-23");
  // Nothing open at all: the start itself, so the calendar still opens somewhere sensible.
  assert.equal(nextOpenDay("2026-11-21", () => true), "2026-11-21");
});

test("clampMonth, isoOf and the labels", () => {
  assert.deepEqual(clampMonth(2026, 13), { year: 2027, month: 1 });
  assert.deepEqual(clampMonth(2026, 0), { year: 2025, month: 12 });
  assert.equal(isoOf(2026, 3, 4), "2026-03-04");
  assert.equal(monthLabel(2026, 11), "November 2026");
});
