import assert from "node:assert/strict";
import { test } from "node:test";

import { HIRING_LEAD_DAYS, earliestStartDate, formatStartDay, isBusinessDay, istWeekday, startDateProblem, validStartDates } from "./business-days.ts";

/** A moment given as an India wall-clock time ("2026-11-16", "23:30"). */
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

// 2026-11-16 is a Monday.
const WEEK = [
  { day: "2026-11-16", name: "Mon", wd: 1, earliest: "2026-11-18" },
  { day: "2026-11-17", name: "Tue", wd: 2, earliest: "2026-11-19" },
  { day: "2026-11-18", name: "Wed", wd: 3, earliest: "2026-11-20" },
  { day: "2026-11-19", name: "Thu", wd: 4, earliest: "2026-11-23" },
  { day: "2026-11-20", name: "Fri", wd: 5, earliest: "2026-11-23" },
  { day: "2026-11-21", name: "Sat", wd: 6, earliest: "2026-11-23" },
  { day: "2026-11-22", name: "Sun", wd: 0, earliest: "2026-11-24" },
];

test("the lead is two calendar days", () => {
  assert.equal(HIRING_LEAD_DAYS, 2);
});

test("istWeekday: 0 Sunday to 6 Saturday, from a calendar day", () => {
  for (const w of WEEK) assert.equal(istWeekday(w.day), w.wd, w.name);
  assert.ok(Number.isNaN(istWeekday("nope")));
});

test("isBusinessDay: Monday to Friday only, and only real days", () => {
  for (const w of WEEK) assert.equal(isBusinessDay(w.day), w.wd >= 1 && w.wd <= 5, w.name);
  assert.equal(isBusinessDay("2026-02-30"), false);
  assert.equal(isBusinessDay(""), false);
});

// The Q9 table, for each weekday, at both ends of the India day (00:00 and 23:59:59).
for (const w of WEEK) {
  test(`earliestStartDate: sent ${w.name} (IST) -> ${w.earliest}, at 00:00 and 23:59 IST`, () => {
    assert.equal(earliestStartDate(ist(w.day, "00:00")), w.earliest, "00:00 IST");
    assert.equal(earliestStartDate(ist(w.day, "12:00")), w.earliest, "noon IST");
    assert.equal(earliestStartDate(new Date(ist(w.day, "23:59").getTime() + 59_000)), w.earliest, "23:59:59 IST");
    assert.equal(isBusinessDay(w.earliest), true);
  });
}

test("the 18:30-24:00 UTC window is already the next day in India", () => {
  // 18:29:59 UTC Friday is 23:59:59 IST Friday -> Monday; one second later it is Saturday 00:00 IST -> still Monday.
  assert.equal(earliestStartDate(new Date("2026-11-20T18:29:59Z")), "2026-11-23");
  assert.equal(earliestStartDate(new Date("2026-11-20T18:30:00Z")), "2026-11-23");
  // 18:29:59 UTC Sunday is Sunday IST -> Tuesday; 18:30:00 UTC Sunday is Monday 00:00 IST -> Wednesday.
  assert.equal(earliestStartDate(new Date("2026-11-22T18:29:59Z")), "2026-11-24");
  assert.equal(earliestStartDate(new Date("2026-11-22T18:30:00Z")), "2026-11-25");
  // 23:30 UTC Monday is 05:00 IST Tuesday -> Thursday, not Wednesday.
  assert.equal(earliestStartDate(new Date("2026-11-16T23:30:00Z")), "2026-11-19");
});

test("the 00:00-05:30 IST window is the previous UTC day but the same India day", () => {
  // 01:00 IST Wednesday is 19:30 UTC Tuesday.
  const at = new Date("2026-11-17T19:30:00Z");
  assert.equal(at.getUTCDay(), 2);
  assert.equal(earliestStartDate(at), "2026-11-20");
});

test("the server's time zone does not matter: a Friday 23:30 IST send is Friday", () => {
  assert.equal(earliestStartDate(ist("2026-11-20", "23:30")), "2026-11-23");
  assert.equal(earliestStartDate(ist("2026-11-19", "23:30")), "2026-11-23");
});

test("month and year ends roll correctly", () => {
  assert.equal(earliestStartDate(ist("2026-12-30", "10:00")), "2027-01-01"); // Wed -> Fri
  assert.equal(earliestStartDate(ist("2026-12-31", "10:00")), "2027-01-04"); // Thu -> Mon
});

test("startDateProblem: null for the earliest day and any later weekday", () => {
  const sent = ist("2026-11-21", "10:00"); // Saturday
  assert.equal(startDateProblem("2026-11-23", sent), null);
  assert.equal(startDateProblem("2026-11-24", sent), null);
  assert.equal(startDateProblem("2027-03-10", sent), null);
});

test("startDateProblem copy: not a date", () => {
  const sent = ist("2026-11-16", "10:00");
  assert.equal(startDateProblem("", sent), "Pick a start date.");
  assert.equal(startDateProblem("2026-13-45", sent), "Pick a start date.");
  assert.equal(startDateProblem("23/11/2026", sent), "Pick a start date.");
});

test("startDateProblem copy: too early names the earliest day", () => {
  const sent = ist("2026-11-16", "10:00"); // Monday -> earliest Wed 18 Nov
  const copy = "The earliest start date is Wed 18 Nov (2 days after sending, weekdays only).";
  assert.equal(startDateProblem("2026-11-16", sent), copy);
  assert.equal(startDateProblem("2026-11-17", sent), copy);
  assert.equal(startDateProblem("2026-11-01", sent), copy);
});

test("startDateProblem copy: Thursday send makes Friday too early and names Monday", () => {
  const sent = ist("2026-11-19", "10:00");
  assert.equal(startDateProblem("2026-11-20", sent), "The earliest start date is Mon 23 Nov (2 days after sending, weekdays only).");
  assert.equal(startDateProblem("2026-11-21", sent), "The earliest start date is Mon 23 Nov (2 days after sending, weekdays only).");
});

test("startDateProblem copy: a weekend after the earliest day", () => {
  const sent = ist("2026-11-16", "10:00");
  assert.equal(startDateProblem("2026-11-21", sent), "The start date must be a weekday (Monday to Friday).");
  assert.equal(startDateProblem("2026-11-22", sent), "The start date must be a weekday (Monday to Friday).");
});

test("startDateProblem uses the India day of the send time", () => {
  // 20:00 UTC Sunday is Monday 01:30 IST -> earliest Wednesday 25 Nov, so Tuesday 24 Nov is too early.
  const sent = new Date("2026-11-22T20:00:00Z");
  assert.equal(startDateProblem("2026-11-24", sent), "The earliest start date is Wed 25 Nov (2 days after sending, weekdays only).");
  assert.equal(startDateProblem("2026-11-25", sent), null);
});

test("formatStartDay: short weekday, day and month", () => {
  assert.equal(formatStartDay("2026-11-23"), "Mon 23 Nov");
  assert.equal(formatStartDay("2027-01-01"), "Fri 1 Jan");
});

test("validStartDates: the next weekdays from the earliest, skipping weekends", () => {
  assert.deepEqual(validStartDates(ist("2026-11-19", "10:00"), 6), ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30"]);
  assert.deepEqual(validStartDates(ist("2026-11-16", "10:00"), 4), ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23"]);
  assert.deepEqual(validStartDates(ist("2026-11-16", "10:00"), 0), []);
  for (const d of validStartDates(ist("2026-11-22", "10:00"), 30)) assert.equal(isBusinessDay(d), true, d);
  assert.equal(validStartDates(ist("2026-11-22", "10:00"), 30).length, 30);
});

test("every valid start date passes startDateProblem and the day before the first does not", () => {
  for (const w of WEEK) {
    const sent = ist(w.day, "09:00");
    const dates = validStartDates(sent, 10);
    for (const d of dates) assert.equal(startDateProblem(d, sent), null, `${w.name} ${d}`);
    assert.notEqual(startDateProblem(dates[0].replace(/\d\d$/, (n) => String(Number(n) - 1).padStart(2, "0")), sent), null);
  }
});
