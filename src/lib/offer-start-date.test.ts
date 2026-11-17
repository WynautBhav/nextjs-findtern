import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { addDays, offerEditTermIssues, offerTermIssues } from "./offer.ts";
import { startDateProblem } from "./business-days.ts";

/** A moment given as an India wall-clock time. */
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

// The Q9 table. 2026-11-16 is a Monday; `earliest` is the first allowed start for an offer sent that day.
const TABLE = [
  { sent: "2026-11-16", name: "Mon", earliest: "2026-11-18", earliestName: "Wed 18 Nov" },
  { sent: "2026-11-17", name: "Tue", earliest: "2026-11-19", earliestName: "Thu 19 Nov" },
  { sent: "2026-11-18", name: "Wed", earliest: "2026-11-20", earliestName: "Fri 20 Nov" },
  { sent: "2026-11-19", name: "Thu", earliest: "2026-11-23", earliestName: "Mon 23 Nov" },
  { sent: "2026-11-20", name: "Fri", earliest: "2026-11-23", earliestName: "Mon 23 Nov" },
  { sent: "2026-11-21", name: "Sat", earliest: "2026-11-23", earliestName: "Mon 23 Nov" },
  { sent: "2026-11-22", name: "Sun", earliest: "2026-11-24", earliestName: "Tue 24 Nov" },
];
const issue = (startDate: string, sentAt: Date) => offerTermIssues({ startDate }, sentAt).map((i) => i.message);

for (const row of TABLE) {
  test(`send: an offer sent ${row.name} may start ${row.earliestName} but nothing earlier, and never on a weekend`, () => {
    for (const hhmm of ["00:00", "12:00", "23:30", "23:59"]) {
      const sentAt = ist(row.sent, hhmm);
      // The earliest day and the days after it that are weekdays are fine.
      assert.deepEqual(issue(row.earliest, sentAt), [], `${row.earliest} at ${hhmm}`);
      assert.deepEqual(issue(addDays(row.earliest, 7), sentAt), [], `a week later at ${hhmm}`);
      // Every day from the send day up to the earliest one is refused with the one line the UI also shows.
      for (let d = row.sent; d < row.earliest; d = addDays(d, 1)) {
        assert.deepEqual(
          issue(d, sentAt),
          [`The earliest start date is ${row.earliestName} (2 days after sending, weekdays only).`],
          `${d} sent ${row.name} ${hhmm}`,
        );
      }
      // A Saturday or Sunday after the earliest day is refused as a weekend.
      const sat = addDays(row.earliest, (6 - new Date(`${row.earliest}T00:00:00Z`).getUTCDay() + 7) % 7);
      assert.deepEqual(issue(sat, sentAt), ["The start date must be a weekday (Monday to Friday)."], `${sat} is a Saturday`);
      assert.deepEqual(issue(addDays(sat, 1), sentAt), ["The start date must be a weekday (Monday to Friday)."], "the Sunday after");
    }
  });
}

test("send: the message is the shared startDateProblem copy, on the startDate field", () => {
  const sentAt = ist("2026-11-19", "10:00");
  const [i] = offerTermIssues({ startDate: "2026-11-21" }, sentAt);
  assert.equal(i?.path, "startDate");
  assert.equal(i?.message, startDateProblem("2026-11-21", sentAt));
});

test("send: 23:30 IST is still the same India day, so a Friday late send needs Monday and a Sunday-night send needs Tuesday", () => {
  // 23:30 IST on Friday 20 Nov is 18:00 UTC on Friday: both clocks say Friday, the earliest is Monday.
  assert.deepEqual(issue("2026-11-23", ist("2026-11-20", "23:30")), []);
  assert.equal(issue("2026-11-22", ist("2026-11-20", "23:30")).length, 1);
  // 00:30 IST on Saturday is 19:00 UTC on Friday: the India day (Saturday) rules, still Monday.
  assert.deepEqual(issue("2026-11-23", ist("2026-11-21", "00:30")), []);
  // 23:30 IST on Sunday 22 Nov: still Sunday, so Monday is too soon and Tuesday is the first start.
  assert.match(issue("2026-11-23", ist("2026-11-22", "23:30"))[0] ?? "", /earliest start date is Tue 24 Nov/);
  assert.deepEqual(issue("2026-11-24", ist("2026-11-22", "23:30")), []);
  // 23:30 IST on Monday 16 Nov: Monday, so Wednesday; the same instant read in UTC (18:00 Monday) agrees.
  assert.match(issue("2026-11-17", ist("2026-11-16", "23:30"))[0] ?? "", /earliest start date is Wed 18 Nov/);
  assert.deepEqual(issue("2026-11-18", ist("2026-11-16", "23:30")), []);
  // One minute across midnight IST moves the earliest day on by one.
  assert.match(issue("2026-11-18", ist("2026-11-17", "00:00"))[0] ?? "", /earliest start date is Thu 19 Nov/);
});

test("send: without a send time the rule is not applied (older callers keep their behaviour)", () => {
  assert.deepEqual(offerTermIssues({ startDate: "2026-11-21" }), []);
});

test("send: a fake day and a start more than a year out keep their own messages", () => {
  const sentAt = ist("2026-11-16", "10:00");
  assert.deepEqual(issue("2026-02-31", sentAt), ["Pick a real start date."]);
  assert.deepEqual(issue("2099-01-01", sentAt), ["Pick a start date within the next year."]);
});

// ── Edit ───────────────────────────────────────────────────────────────────

test("edit: a start date that did not change is never judged, so editing other terms is not refused as 'too soon'", () => {
  // Sent Mon 16 Nov with a Wed 18 Nov start (valid then). Edited on Tue 17 Nov: 18 Nov is now only a day away.
  const stored = { startDate: "2026-11-18", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00" };
  const editTime = ist("2026-11-17", "10:00");
  assert.deepEqual(offerEditTermIssues({ startDate: "2026-11-18", shiftFrom: "10:00", shiftTo: "18:00" }, stored, editTime), []);
  // The form resends every field; an unchanged start with an unchanged everything else is a no-op too.
  assert.deepEqual(offerEditTermIssues({ startDate: "2026-11-18", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00" }, stored, editTime), []);
  // An edit that leaves the start date out is also fine.
  assert.deepEqual(offerEditTermIssues({ shiftFrom: "10:00", shiftTo: "18:00" }, stored, editTime), []);
});

test("edit: an older offer on a weekend keeps its start while other terms are edited", () => {
  const stored = { startDate: "2026-11-21", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00" }; // a Saturday, sent before the rule
  assert.deepEqual(offerEditTermIssues({ startDate: "2026-11-21", shiftFrom: "09:30", shiftTo: "17:30" }, stored, ist("2026-11-17", "10:00")), []);
});

test("edit: a changed start is measured from the edit time, not from when the offer was sent", () => {
  const stored = { startDate: "2026-11-30", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "17:00" };
  // Sent long ago; edited on Thu 19 Nov at 23:30 IST: the earliest is Mon 23 Nov.
  const editTime = ist("2026-11-19", "23:30");
  assert.match(offerEditTermIssues({ startDate: "2026-11-20" }, stored, editTime)[0]?.message ?? "", /earliest start date is Mon 23 Nov/);
  assert.match(offerEditTermIssues({ startDate: "2026-11-22" }, stored, editTime)[0]?.message ?? "", /earliest start date is Mon 23 Nov/);
  assert.deepEqual(offerEditTermIssues({ startDate: "2026-11-23" }, stored, editTime), []);
  assert.deepEqual(offerEditTermIssues({ startDate: "2026-12-01" }, stored, editTime), []);
});

test("edit: a changed start on a weekend is refused with the weekday copy", () => {
  const stored = { startDate: "2026-11-30", timezone: "Asia/Kolkata" };
  assert.deepEqual(
    offerEditTermIssues({ startDate: "2026-12-05" }, stored, ist("2026-11-16", "10:00")).map((i) => i.message),
    ["The start date must be a weekday (Monday to Friday)."],
  );
  assert.deepEqual(
    offerEditTermIssues({ startDate: "2026-12-06" }, stored, ist("2026-11-16", "10:00")).map((i) => i.message),
    ["The start date must be a weekday (Monday to Friday)."],
  );
});

test("edit: each row of the table, from the edit time", () => {
  const stored = { startDate: "2027-01-04", timezone: "Asia/Kolkata" };
  for (const row of TABLE) {
    const at = ist(row.sent, "15:00");
    assert.deepEqual(offerEditTermIssues({ startDate: row.earliest }, stored, at), [], `${row.name} -> ${row.earliest}`);
    const tooSoon = addDays(row.earliest, -1);
    if (tooSoon >= row.sent) {
      assert.equal(offerEditTermIssues({ startDate: tooSoon }, stored, at)[0]?.message, `The earliest start date is ${row.earliestName} (2 days after sending, weekdays only).`);
    }
  }
});

// ── Wiring: the routes have no DB harness here, so these pin the calls; the report records the HTTP run against a local DB ──

const APP = join(import.meta.dirname, "../app");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

test("the send route judges the start date at send time and has no weaker 'after today' check left", () => {
  const src = read("api/employer/[id]/proposals/route.ts");
  assert.match(src, /offerTermIssues\(b, new Date\(\)\)/);
  assert.doesNotMatch(src, /b\.startDate <= todayIst\(\)/);
});

test("the edit route measures a changed start from the edit time", () => {
  const src = read("api/proposals/[id]/route.ts");
  assert.match(src, /offerEditTermIssues\(\s*edits,[\s\S]*?\},\s*new Date\(\),?\s*\)/);
});

test("the full-time route refuses a start date that breaks the rule, with the shared copy", () => {
  const src = read("api/employer/[id]/full-time-offer/route.ts");
  assert.match(src, /startDateProblem\(b\.startDate, new Date\(\)\)/);
  assert.match(src, /status: 400/);
});
