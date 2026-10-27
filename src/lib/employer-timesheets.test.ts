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

test("period ends stored at T23:59:59.999Z print as the same calendar day (DB-36)", async () => {
  const { formatPeriod } = await import("./employer-timesheets.ts");
  assert.equal(formatPeriod(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-30T23:59:59.999Z")), "1 Sept – 30 Sept 2026");
});

test("review grid: hours default to 8 for a present day, weeks run Monday to Sunday", async () => {
  const { dayDetails, weeklyTallies, EMPLOYER_DAY_STATUSES } = await import("./employer-timesheets.ts");
  const days = dayDetails(
    [
      { date: "2026-09-01", status: "Present", hours: 6, note: "Sprint" },
      { date: "2026-09-02", status: "Present" },
      { date: "2026-09-05", status: "Fixed off", hours: 8 },
      { date: "2026-09-07", status: "Absent" },
    ],
    new Date("2026-09-01T00:00:00Z"),
    new Date("2026-09-07T23:59:59.999Z"),
  );
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], { date: "2026-09-01", status: "Present", hours: 6, note: "Sprint" });
  assert.equal(days[1].hours, 8);
  assert.equal(days[4].hours, 0, "an off day bills nothing even if hours were typed");
  const weeks = weeklyTallies(days);
  assert.deepEqual(weeks.map((w) => w.weekOf), ["2026-08-31", "2026-09-07"]);
  assert.equal(weeks[0].present, 2);
  assert.equal(weeks[0].hours, 14);
  assert.equal(weeks[0].off, 1);
  assert.equal(weeks[0].unclaimed, 3);
  assert.equal(weeks[1].absent, 1);
  assert.equal(EMPLOYER_DAY_STATUSES.includes("Leave" as never), false);
});
