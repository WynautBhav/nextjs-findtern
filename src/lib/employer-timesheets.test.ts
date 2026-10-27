import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY_STATUSES,
  countClaimed,
  countStatuses,
  normaliseEntries,
} from "./employer-timesheets.ts";

test("fills every day of the period, not just the claimed ones", () => {
  const rows = normaliseEntries(
    [{ date: "2026-05-01", status: "Present" }],
    new Date("2026-05-01"),
    new Date("2026-05-04"),
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { date: "2026-05-01", status: "Present" });
  assert.deepEqual(rows[1], { date: "2026-05-02", status: "" });
  assert.equal(countClaimed(rows), 1);
});

test("accepts a full ISO timestamp and truncates it to a day", () => {
  const rows = normaliseEntries(
    [{ date: "2026-05-02T00:00:00.000Z", status: "Absent" }],
    new Date("2026-05-02"),
    new Date("2026-05-02"),
  );
  assert.deepEqual(rows, [{ date: "2026-05-02", status: "Absent" }]);
});

test("skips malformed rows instead of throwing", () => {
  const rows = normaliseEntries(
    [{ status: "Present" }, "nope", null, 7, { date: "", status: "Present" }],
    null,
    null,
  );
  assert.deepEqual(rows, []);
});

test("with no period, returns the rows it was given, sorted", () => {
  const rows = normaliseEntries(
    [
      { date: "2026-05-03", status: "Holiday" },
      { date: "2026-05-01", status: "Present" },
    ],
    null,
    null,
  );
  assert.deepEqual(rows, [
    { date: "2026-05-01", status: "Present" },
    { date: "2026-05-03", status: "Holiday" },
  ]);
});

test("an unexpected status becomes its own bucket rather than being coerced", () => {
  const rows = normaliseEntries(
    [{ date: "2026-05-01", status: "Bogus" }],
    new Date("2026-05-01"),
    new Date("2026-05-01"),
  );
  assert.equal(countClaimed(rows), 0);
  assert.deepEqual(countStatuses(rows), { "": 0, Bogus: 1 });
});

test("bounds the day walk so a decade-wide period cannot spin", () => {
  const rows = normaliseEntries([], new Date("2020-01-01"), new Date("2030-01-01"));
  assert.equal(rows.length, 400);
});

test("a period ending before it starts yields nothing", () => {
  assert.deepEqual(normaliseEntries([], new Date("2026-05-10"), new Date("2026-05-01")), []);
});

test("exposes exactly the five statuses the intern form writes", () => {
  assert.deepEqual([...DAY_STATUSES], ["Present", "Leave", "Absent", "Fixed off", "Holiday"]);
});

test("timesheet periods follow engagement months from the joining date", async () => {
  const { timesheetPeriod, engagementPeriods } = await import("./employer-timesheets.ts");
  assert.deepEqual(engagementPeriods("2026-03-10", 2), [
    { start: "2026-03-10", end: "2026-04-09" },
    { start: "2026-04-10", end: "2026-05-09" },
  ]);
  // By month: the period starting in it, else the one running on its 1st.
  assert.deepEqual(timesheetPeriod("2026-03", "2026-03-10", 2, "2026-10-01"), { start: "2026-03-10", end: "2026-04-09" });
  assert.deepEqual(timesheetPeriod("2026-05", "2026-03-10", 2, "2026-10-01"), { start: "2026-04-10", end: "2026-05-09" });
  assert.ok("error" in timesheetPeriod("2026-02", "2026-03-10", 2, "2026-10-01"));
  assert.ok("error" in timesheetPeriod("2026-11", "2026-03-10", 6, "2026-10-01"));
  assert.ok("error" in timesheetPeriod("2026-06", "2026-03-10", 2, "2026-10-01"));
});

test("a one-month hire that started mid-month gets one full period", async () => {
  const { timesheetPeriod } = await import("./employer-timesheets.ts");
  // QA repro: joined 18 Sep, today 19 Oct - Sep 18-30 must be loggable.
  assert.deepEqual(timesheetPeriod(null, "2026-09-18", 1, "2026-10-19"), { start: "2026-09-18", end: "2026-10-17" });
  const taken = [{ start: "2026-09-18", end: "2026-10-17" }];
  assert.ok("error" in timesheetPeriod(null, "2026-09-18", 1, "2026-10-19", taken));
});

test("without a month, the earliest unlogged started period opens", async () => {
  const { timesheetPeriod } = await import("./employer-timesheets.ts");
  const taken = [{ start: "2026-03-10", end: "2026-04-09" }];
  assert.deepEqual(timesheetPeriod(null, "2026-03-10", 3, "2026-10-01", taken), { start: "2026-04-10", end: "2026-05-09" });
  // Next period not started yet.
  assert.ok("error" in timesheetPeriod(null, "2026-09-10", 3, "2026-10-01", [{ start: "2026-09-10", end: "2026-10-09" }]));
});

test("the intern editor offers only the four legacy day statuses (INW-05)", async () => {
  const { LEGACY_DAY_STATUSES, legacyDayStatus, editableDayStatus } = await import("./employer-timesheets.ts");
  assert.deepEqual([...LEGACY_DAY_STATUSES], ["Present", "Absent", "Fixed off", "Holiday"]);
  assert.equal(legacyDayStatus("present"), "Present");
  assert.equal(legacyDayStatus(" Fixed off "), "Fixed off");
  assert.equal(legacyDayStatus("Leave"), null);
  // A stored "Leave" still reads, as time away.
  assert.equal(editableDayStatus("Leave"), "Absent");
  assert.equal(editableDayStatus("Holiday"), "Holiday");
  assert.equal(editableDayStatus("Bogus"), "");
  assert.equal(editableDayStatus(undefined), "");
});

test("a sheet is complete once every day has a legacy status, hours or not (INW-06/24)", async () => {
  const { unfilledDays } = await import("./employer-timesheets.ts");
  const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
  // No hours anywhere, and a future day marked: still complete.
  assert.deepEqual(
    unfilledDays(days, [
      { date: "2026-10-01", status: "Present", hours: 0 },
      { date: "2026-10-02T00:00:00.000Z", status: "absent" },
      { date: "2026-10-03", status: "Holiday" },
    ]),
    [],
  );
  // Blank, unknown and "Leave" days are still to fill; a missing row too.
  assert.deepEqual(
    unfilledDays(days, [
      { date: "2026-10-01", status: "" },
      { date: "2026-10-02", status: "Leave" },
    ]),
    days,
  );
  assert.deepEqual(unfilledDays(days, null), days);
});

test("a legacy calendar-month sheet never strands days of new-app periods (INW-26)", async () => {
  const { timesheetPeriod, uncoveredParts } = await import("./employer-timesheets.ts");
  // Joined 18 Sep for 2 months: periods 18 Sep-17 Oct and 18 Oct-17 Nov.
  // A legacy sheet for October (1-31 Oct) overlaps both.
  const legacyOct = [{ start: "2026-10-01", end: "2026-10-31" }];
  assert.deepEqual(uncoveredParts({ start: "2026-09-18", end: "2026-10-17" }, legacyOct), [
    { start: "2026-09-18", end: "2026-09-30" },
  ]);
  assert.deepEqual(uncoveredParts({ start: "2026-10-18", end: "2026-11-17" }, legacyOct), [
    { start: "2026-11-01", end: "2026-11-17" },
  ]);
  // The days before the legacy sheet open first...
  assert.deepEqual(timesheetPeriod(null, "2026-09-18", 2, "2026-11-20", legacyOct), {
    start: "2026-09-18",
    end: "2026-09-30",
  });
  // ...then the days after it.
  const afterFirst = [...legacyOct, { start: "2026-09-18", end: "2026-09-30" }];
  assert.deepEqual(timesheetPeriod(null, "2026-09-18", 2, "2026-11-20", afterFirst), {
    start: "2026-11-01",
    end: "2026-11-17",
  });
  // Every day covered: nothing left to open.
  const all = [...afterFirst, { start: "2026-11-01", end: "2026-11-17" }];
  assert.ok("error" in timesheetPeriod(null, "2026-09-18", 2, "2026-11-20", all));
  // A sheet inside a period splits it in two.
  assert.deepEqual(uncoveredParts({ start: "2026-10-01", end: "2026-10-31" }, [{ start: "2026-10-10", end: "2026-10-12" }]), [
    { start: "2026-10-01", end: "2026-10-09" },
    { start: "2026-10-13", end: "2026-10-31" },
  ]);
  // By month: the uncovered part of the picked period.
  assert.deepEqual(timesheetPeriod("2026-10", "2026-09-18", 2, "2026-11-20", legacyOct), {
    start: "2026-11-01",
    end: "2026-11-17",
  });
  // No joining date: the calendar month, less what a sheet holds.
  assert.deepEqual(timesheetPeriod("2026-10", null, 1, "2026-11-20", [{ start: "2026-10-01", end: "2026-10-15" }]), {
    start: "2026-10-16",
    end: "2026-10-31",
  });
  assert.ok("error" in timesheetPeriod("2026-10", null, 1, "2026-11-20", legacyOct));
});
