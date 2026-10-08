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

test("exposes exactly the four statuses the intern form writes", () => {
  assert.deepEqual([...DAY_STATUSES], ["Present", "Absent", "Fixed off", "Holiday"]);
});
