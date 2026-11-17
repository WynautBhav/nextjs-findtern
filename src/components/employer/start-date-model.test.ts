import assert from "node:assert/strict";
import { test } from "node:test";

import { fixStartDate, startDateHint, startDateIssue, startDayDisabled } from "./start-date-model.ts";

/** A moment given as an India wall-clock time. */
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

// 2026-11-16 is a Monday. `earliest` is the first allowed start for a proposal sent that day.
const TABLE = [
  { sent: "2026-11-16", name: "Mon", earliest: "2026-11-18", label: "Wed 18 Nov" },
  { sent: "2026-11-17", name: "Tue", earliest: "2026-11-19", label: "Thu 19 Nov" },
  { sent: "2026-11-18", name: "Wed", earliest: "2026-11-20", label: "Fri 20 Nov" },
  { sent: "2026-11-19", name: "Thu", earliest: "2026-11-23", label: "Mon 23 Nov" },
  { sent: "2026-11-20", name: "Fri", earliest: "2026-11-23", label: "Mon 23 Nov" },
  { sent: "2026-11-21", name: "Sat", earliest: "2026-11-23", label: "Mon 23 Nov" },
  { sent: "2026-11-22", name: "Sun", earliest: "2026-11-24", label: "Tue 24 Nov" },
];

for (const row of TABLE) {
  test(`hint, sent ${row.name}: names the earliest start and the rule`, () => {
    assert.equal(startDateHint(ist(row.sent, "11:00")), `Earliest start: ${row.label} (2 days after sending, weekdays only)`);
  });

  test(`picker, sent ${row.name}: every day before ${row.earliest} and every weekend is disabled, the rest are open`, () => {
    const now = ist(row.sent, "11:00");
    const disabled = startDayDisabled(now);
    for (let i = 0; i < 28; i++) {
      const day = new Date(Date.parse(`${row.sent}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
      const expected = day < row.earliest || wd === 0 || wd === 6;
      assert.equal(disabled(day), expected, `${day} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd]})`);
    }
    // The picker and the server agree on the first open day.
    assert.equal(disabled(row.earliest), false);
  });
}

test("the India day decides: 23:30 IST on Friday still points at Monday", () => {
  assert.equal(startDateHint(ist("2026-11-20", "23:30")), "Earliest start: Mon 23 Nov (2 days after sending, weekdays only)");
  assert.equal(startDayDisabled(ist("2026-11-20", "23:30"))("2026-11-22"), true);
  assert.equal(startDayDisabled(ist("2026-11-20", "23:30"))("2026-11-23"), false);
});

test("fixStartDate leaves a valid date, an empty one and a half-typed one alone", () => {
  const now = ist("2026-11-16", "10:00");
  assert.deepEqual(fixStartDate("2026-11-18", now), { value: "2026-11-18", notice: null });
  assert.deepEqual(fixStartDate("2026-12-01", now), { value: "2026-12-01", notice: null });
  assert.deepEqual(fixStartDate("", now), { value: "", notice: null });
});

test("fixStartDate moves a weekend to the next Monday and says so", () => {
  const now = ist("2026-11-16", "10:00");
  assert.deepEqual(fixStartDate("2026-11-28", now), { value: "2026-11-30", notice: "Sat 28 Nov is a weekend, so the start date moved to Mon 30 Nov." });
  assert.deepEqual(fixStartDate("2026-11-29", now), { value: "2026-11-30", notice: "Sun 29 Nov is a weekend, so the start date moved to Mon 30 Nov." });
});

test("fixStartDate moves a too-early date to the earliest one and says so", () => {
  const now = ist("2026-11-19", "10:00"); // Thursday: Saturday is two days out, so Monday
  assert.deepEqual(fixStartDate("2026-11-20", now), {
    value: "2026-11-23",
    notice: "Fri 20 Nov is too soon, so the start date moved to Mon 23 Nov (2 days after sending, weekdays only).",
  });
  // Yesterday and last year too.
  assert.equal(fixStartDate("2026-11-18", now).value, "2026-11-23");
  assert.equal(fixStartDate("2020-01-01", now).value, "2026-11-23");
});

test("fixStartDate re-judges a chosen date when the day rolls over, but never the date an edit started with", () => {
  // Wed 18 Nov was the earliest when picked on Mon 16; once it is 00:10 IST on Tue 17 the earliest is Thu 19.
  assert.equal(fixStartDate("2026-11-18", ist("2026-11-17", "00:10")).value, "2026-11-19");
  // An edit leaves the stored date alone even though it is now too soon.
  assert.deepEqual(fixStartDate("2026-11-18", ist("2026-11-17", "10:00"), "2026-11-18"), { value: "2026-11-18", notice: null });
  // A different date is still corrected.
  assert.equal(fixStartDate("2026-11-18", ist("2026-11-17", "10:00"), "2026-11-30").value, "2026-11-19");
});

test("startDateIssue: the sentence the form shows, matching the server", () => {
  const now = ist("2026-11-19", "10:00");
  assert.equal(startDateIssue("", now), "Pick a start date, as DD/MM/YYYY.");
  assert.equal(startDateIssue("2026-11-20", now), "The earliest start date is Mon 23 Nov (2 days after sending, weekdays only).");
  assert.equal(startDateIssue("2026-11-28", now), "The start date must be a weekday (Monday to Friday).");
  assert.equal(startDateIssue("2026-11-23", now), null);
  // An edit's unchanged date is not judged; a changed one is.
  assert.equal(startDateIssue("2026-11-20", now, "2026-11-20"), null);
  assert.equal(startDateIssue("2026-11-21", now, "2026-11-20"), "The earliest start date is Mon 23 Nov (2 days after sending, weekdays only).");
});
