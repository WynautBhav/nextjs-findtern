import assert from "node:assert/strict";
import { test } from "node:test";

import { bucketKeys, bucketKeyOf, bucketLabel, parseReportWindow, trendSpec } from "./window.ts";

// 17 Nov 2026 is a Tuesday. 10:00 IST = 04:30 UTC.
const NOW = new Date("2026-11-17T04:30:00Z");
const iso = (d: Date | null) => (d ? d.toISOString() : null);

test("default is the current month to date, on the overview tab", () => {
  const w = parseReportWindow({}, NOW);
  assert.equal(w.tab, "overview");
  assert.equal(w.kind, "month");
  assert.equal(iso(w.since), "2026-10-31T18:30:00.000Z"); // 1 Nov 00:00 IST
  assert.equal(w.until, null);
});

test("today starts at 00:00 IST, not 00:00 UTC", () => {
  const w = parseReportWindow({ range: "today" }, NOW);
  assert.equal(iso(w.since), "2026-11-16T18:30:00.000Z");
  // A visit at 00:10 IST on the 18th is already the 18th.
  const late = parseReportWindow({ range: "today" }, new Date("2026-11-17T18:40:00Z"));
  assert.equal(iso(late.since), "2026-11-17T18:30:00.000Z");
});

test("week starts on Monday in IST, including on a Sunday night and a Monday just after midnight", () => {
  assert.equal(iso(parseReportWindow({ range: "week" }, NOW).since), "2026-11-15T18:30:00.000Z"); // Mon 16 Nov 00:00 IST
  const sunday = new Date("2026-11-22T18:00:00Z"); // Sun 22 Nov 23:30 IST
  assert.equal(iso(parseReportWindow({ range: "week" }, sunday).since), "2026-11-15T18:30:00.000Z");
  const monday = new Date("2026-11-22T18:40:00Z"); // Mon 23 Nov 00:10 IST
  assert.equal(iso(parseReportWindow({ range: "week" }, monday).since), "2026-11-22T18:30:00.000Z");
});

test("the previous period is the same elapsed span of the previous day, week or month", () => {
  const day = parseReportWindow({ range: "today" }, NOW);
  assert.equal(iso(day.prevSince), "2026-11-15T18:30:00.000Z");
  assert.equal(iso(day.prevUntil), "2026-11-16T04:30:00.000Z"); // yesterday up to 10:00 IST
  const week = parseReportWindow({ range: "week" }, NOW);
  assert.equal(iso(week.prevSince), "2026-11-08T18:30:00.000Z");
  assert.equal(iso(week.prevUntil), "2026-11-10T04:30:00.000Z"); // Mon 9 + 1d 10h
  const month = parseReportWindow({ range: "month" }, NOW);
  assert.equal(iso(month.prevSince), "2026-09-30T18:30:00.000Z"); // 1 Oct IST
  assert.equal(iso(month.prevUntil), "2026-10-17T04:30:00.000Z");
});

test("previous month span is clamped to the previous month's end (31 March vs February)", () => {
  const mar31 = new Date("2027-03-31T10:00:00Z");
  const w = parseReportWindow({ range: "month" }, mar31);
  assert.equal(iso(w.prevSince), "2027-01-31T18:30:00.000Z"); // 1 Feb IST
  assert.equal(iso(w.prevUntil), "2027-02-28T18:30:00.000Z"); // 1 Mar IST, not into March
});

test("period presets and a custom range win over range; custom dates are inclusive India days", () => {
  const p = parseReportWindow({ range: "today", period: "30d" }, NOW);
  assert.equal(p.kind, "preset");
  assert.ok(p.since);
  const c = parseReportWindow({ from: "2026-11-01", to: "2026-11-10", range: "week" }, NOW);
  assert.equal(c.kind, "custom");
  assert.equal(iso(c.since), "2026-10-31T18:30:00.000Z");
  assert.equal(iso(c.until), "2026-11-10T18:30:00.000Z"); // start of 11 Nov IST
  // equal-length window before: 10 days
  assert.equal(iso(c.prevSince), "2026-10-21T18:30:00.000Z");
  assert.equal(iso(c.prevUntil), "2026-10-31T18:30:00.000Z");
});

test("all time has no start and no previous period", () => {
  const w = parseReportWindow({ range: "all" }, NOW);
  assert.equal(w.kind, "all");
  assert.equal(w.since, null);
  assert.equal(w.prevSince, null);
});

test("tab and range are validated", () => {
  assert.equal(parseReportWindow({ tab: "finance" }, NOW).tab, "finance");
  assert.equal(parseReportWindow({ tab: "nope", range: "decade" }, NOW).tab, "overview");
  assert.equal(parseReportWindow({ range: "decade" }, NOW).kind, "month");
});

test("bucket keys: day, Monday week and month starts in IST", () => {
  const t = new Date("2026-11-22T20:00:00Z"); // Mon 23 Nov 01:30 IST
  assert.equal(bucketKeyOf(t, "day"), "2026-11-23");
  assert.equal(bucketKeyOf(t, "week"), "2026-11-23");
  assert.equal(bucketKeyOf(t, "month"), "2026-11-01");
  const sun = new Date("2026-11-22T17:00:00Z"); // Sun 22 Nov 22:30 IST
  assert.equal(bucketKeyOf(sun, "week"), "2026-11-16");
  assert.equal(bucketKeyOf(new Date("2026-12-31T19:00:00Z"), "month"), "2027-01-01"); // 1 Jan 00:30 IST
});

test("bucketKeys fills every bucket with no gaps, oldest first", () => {
  assert.deepEqual(bucketKeys(new Date("2026-11-14T18:30:00Z"), NOW, "day"), ["2026-11-15", "2026-11-16", "2026-11-17"]);
  assert.deepEqual(bucketKeys(new Date("2026-10-25T00:00:00Z"), NOW, "week"), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.deepEqual(bucketKeys(new Date("2026-08-20T00:00:00Z"), NOW, "month"), ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
});

test("trend spec: today shows 14 days, week 8 weeks, month 6 months; long custom ranges go monthly and are capped", () => {
  const t = trendSpec(parseReportWindow({ range: "today" }, NOW), NOW);
  assert.equal(t.bucket, "day");
  assert.equal(t.keys.length, 14);
  assert.equal(t.keys.at(-1), "2026-11-17");
  const w = trendSpec(parseReportWindow({ range: "week" }, NOW), NOW);
  assert.equal(w.bucket, "week");
  assert.equal(w.keys.length, 8);
  assert.equal(w.keys.at(-1), "2026-11-16");
  const m = trendSpec(parseReportWindow({ range: "month" }, NOW), NOW);
  assert.equal(m.bucket, "month");
  assert.equal(m.keys.length, 6);
  const long = trendSpec(parseReportWindow({ from: "2020-01-01", to: "2026-11-01" }, NOW), NOW);
  assert.equal(long.bucket, "month");
  assert.ok(long.keys.length <= 24);
  const short = trendSpec(parseReportWindow({ period: "7d" }, NOW), NOW);
  assert.equal(short.bucket, "day");
  assert.equal(short.keys.length, 7);
});

test("bucket labels are short and unambiguous", () => {
  assert.equal(bucketLabel("2026-11-17", "day"), "17 Nov");
  assert.equal(bucketLabel("2026-11-16", "week"), "16 Nov");
  assert.equal(bucketLabel("2026-11-01", "month"), "Nov 26");
});
