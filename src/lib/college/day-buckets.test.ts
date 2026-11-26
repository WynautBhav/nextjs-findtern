import assert from "node:assert/strict";
import { test } from "node:test";

import { driveDayBuckets } from "./day-buckets.ts";

// Bug sheet 26 Nov: a drive that opened 15 Nov 7:30 pm IST put 24 Nov's offers under "23 Nov" (24 h steps from the opening time).
test("days are India calendar days, from the opening day to the closing day", () => {
  const start = new Date("2026-11-15T14:00:00Z"); // 15 Nov 7:30 pm IST
  const end = new Date("2026-11-24T12:55:00Z"); // 24 Nov 6:25 pm IST
  const b = driveDayBuckets(start, end);
  assert.equal(b.step, 1);
  assert.equal(b.buckets.length, 10);
  assert.equal(b.buckets[0].day, "2026-11-15");
  assert.equal(b.buckets[9].day, "2026-11-24");
  const at = (iso: string) => b.indexOf(new Date(iso));
  assert.equal(at("2026-11-24T08:51:00Z"), 9); // 24 Nov 2:21 pm IST
  assert.equal(at("2026-11-23T18:40:00Z"), 9); // 24 Nov 12:10 am IST
  assert.equal(at("2026-11-23T14:19:00Z"), 8); // 23 Nov 7:49 pm IST
  assert.equal(at("2026-11-15T13:59:00Z"), -1); // before it opened
});

test("a drive ending exactly at midnight IST has no empty extra day", () => {
  const b = driveDayBuckets(new Date("2026-11-20T04:30:00Z"), new Date("2026-11-21T18:30:00Z")); // ends 22 Nov 12:00 am IST
  assert.deepEqual(b.buckets.map((x) => x.day), ["2026-11-20", "2026-11-21"]);
  assert.equal(b.indexOf(new Date("2026-11-21T18:30:00Z")), 1);
});

test("past a month the buckets are weeks from the opening day", () => {
  const b = driveDayBuckets(new Date("2026-10-01T04:00:00Z"), new Date("2026-11-20T04:00:00Z"));
  assert.equal(b.step, 7);
  assert.equal(b.buckets[0].day, "2026-10-01");
  assert.equal(b.buckets[1].day, "2026-10-08");
  assert.equal(b.indexOf(new Date("2026-10-08T00:00:00Z")), 1); // 8 Oct 5:30 am IST
});
