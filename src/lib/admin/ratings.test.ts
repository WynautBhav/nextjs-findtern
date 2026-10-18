import assert from "node:assert/strict";
import { test } from "node:test";

import { applyRatings, readRatingsSheet } from "./ratings.ts";

test("bulk sheet: legacy headers, quoted cells, bad values flagged", () => {
  const rows = readRatingsSheet('email,communication,coding,aptitude,ai interview,findternScore\r\n"A@x.com",8,7,6,7,7.5\r\nb@x.com,11,,,,\r\n');
  assert.deepEqual(rows[0].updates, { communication: 8, coding: 7, aptitude: 6, interview: 7 });
  assert.equal(rows[0].email, "a@x.com");
  assert.equal(rows[0].score, 7.5);
  assert.ok(rows[1].error);
});

test("score is the mean unless given", () => {
  assert.equal(applyRatings({}, { coding: 8, aptitude: 6 }).findternScore, 7);
  assert.equal(applyRatings({}, { coding: 8 }, 9).findternScore, 9);
});
