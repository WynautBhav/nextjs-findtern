import assert from "node:assert/strict";
import { test } from "node:test";

import { businessStartDate, istDay, weekendStartDate } from "../../e2e/lib/start-date.mjs";
import { isBusinessDay, startDateProblem } from "./business-days.ts";

/** A moment given as an India wall-clock time. */
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

// 2026-11-16 is a Monday; sweep three weeks so every weekday is a send day, at the edges of the India day.
const SEND_DAYS = Array.from({ length: 21 }, (_, i) => istDay(i, ist("2026-11-16", "00:00")));

test("the e2e helper returns a start date the server accepts, whichever weekday the run happens on", () => {
  for (const day of SEND_DAYS) {
    for (const hhmm of ["00:00", "12:00", "23:30", "23:59"]) {
      const now = ist(day, hhmm);
      for (const ahead of [0, 1, 2, 3, 7, 14, 30]) {
        const start = businessStartDate(ahead, now);
        assert.equal(isBusinessDay(start), true, `${start} is a weekday (sent ${day} ${hhmm}, ahead ${ahead})`);
        assert.equal(startDateProblem(start, now), null, `${start} accepted (sent ${day} ${hhmm}, ahead ${ahead})`);
        assert.ok(start >= istDay(Math.max(2, ahead), now), `${start} is at least ${ahead} days ahead`);
        // The first such day: the day before is either too early or a weekend.
        const before = istDay(-1, ist(start, "12:00"));
        assert.ok(before < istDay(Math.max(2, ahead), now) || !isBusinessDay(before), `${start} is the first one`);
      }
    }
  }
});

test("the helper is a plain pass-through when the target already lands on a weekday", () => {
  assert.equal(businessStartDate(7, ist("2026-11-16", "10:00")), "2026-11-23"); // Mon + 7 = Mon
  assert.equal(businessStartDate(7, ist("2026-11-17", "10:00")), "2026-11-24"); // Tue + 7 = Tue
});

test("the helper rolls a weekend forward to Monday", () => {
  assert.equal(businessStartDate(7, ist("2026-11-14", "10:00")), "2026-11-23"); // Sat + 7 = Sat -> Mon
  assert.equal(businessStartDate(7, ist("2026-11-15", "10:00")), "2026-11-23"); // Sun + 7 = Sun -> Mon
  assert.equal(businessStartDate(0, ist("2026-11-19", "10:00")), "2026-11-23"); // Thu: two days is Sat -> Mon
});

test("the India day decides, not UTC: 23:30 IST on a Friday is still Friday", () => {
  assert.equal(istDay(0, ist("2026-11-20", "23:30")), "2026-11-20");
  assert.equal(businessStartDate(0, ist("2026-11-20", "23:30")), "2026-11-23");
  assert.equal(istDay(0, ist("2026-11-21", "00:15")), "2026-11-21");
});

test("weekendStartDate is a Saturday the server refuses", () => {
  for (const day of SEND_DAYS) {
    const now = ist(day, "12:00");
    const sat = weekendStartDate(7, now);
    assert.equal(isBusinessDay(sat), false);
    assert.ok(sat >= istDay(7, now));
    assert.match(startDateProblem(sat, now) ?? "", /weekday/);
  }
});
