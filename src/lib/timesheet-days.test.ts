import assert from "node:assert/strict";
import { test } from "node:test";

import { clearFutureDays, duplicateDay, mergeEntriesByDate, periodDays, todayIst, weekdayOf } from "./timesheet-days.ts";

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
  assert.equal(formatPeriodDays(new Date("2026-10-26T00:00:00.000Z"), new Date("2026-11-25T23:59:59.999Z")), "26 Oct – 25 Nov 2026", "B5: IST must not roll the end to 26 Nov");
  assert.equal(formatPeriodDays(null, "2027-01-17"), "");
});

test("month-end send rule: period end day, IST boundary", async () => {
  const { canSendOn, periodSendableFrom } = await import("./timesheet-days.ts");
  const end = new Date("2026-11-25T23:59:59.999Z"); // stored end bound
  assert.equal(periodSendableFrom(end), "2026-11-25");
  assert.equal(canSendOn("2026-11-24", end), false); // day before
  assert.equal(canSendOn("2026-11-25", end), true); // last day
  assert.equal(canSendOn("2026-11-26", end), true);
  // 23:30 IST on the 24th is 18:00Z the 24th: still the 24th in India; 00:30 IST on the 25th is 19:00Z on the 24th.
  assert.equal(canSendOn(todayIst(new Date("2026-11-24T18:00:00Z")), end), false);
  assert.equal(canSendOn(todayIst(new Date("2026-11-24T19:00:00Z")), end), true);
  // Future vs today
  assert.equal("2026-11-25" > todayIst(new Date("2026-11-24T18:00:00Z")), true);
  assert.equal("2026-11-25" > todayIst(new Date("2026-11-24T19:00:00Z")), false);
});

test("clearFutureDays blanks status, hours and note after today only", () => {
  const e = (date: string) => ({ date, status: "Fixed off", hours: 8, note: "x" });
  const out = clearFutureDays([e("2026-11-03"), e("2026-11-04"), e("2026-11-05")], "2026-11-04");
  assert.deepEqual(out[0], e("2026-11-03"));
  assert.deepEqual(out[1], e("2026-11-04"));
  assert.deepEqual(out[2], { date: "2026-11-05", status: "", hours: 0, note: "" });
});

test("duplicateDay finds a date sent twice", () => {
  assert.equal(duplicateDay([{ date: "2026-10-12" }, { date: "2026-10-13" }]), null);
  assert.equal(duplicateDay([{ date: "2026-10-12" }, { date: "2026-10-13" }, { date: "2026-10-12" }]), "2026-10-12");
});

test("mergeEntriesByDate replaces sent days and keeps the days a short payload leaves out", () => {
  const existing = [{ date: "2026-10-12", hours: 8 }, { date: "2026-10-13", hours: 8 }, { date: "2026-10-14", hours: 8 }];
  const merged = mergeEntriesByDate(existing, [{ date: "2026-10-13", hours: 0 }, { date: "2026-10-15", hours: 4 }]);
  assert.deepEqual(merged, [
    { date: "2026-10-12", hours: 8 },
    { date: "2026-10-13", hours: 0 },
    { date: "2026-10-14", hours: 8 },
    { date: "2026-10-15", hours: 4 },
  ]);
});
