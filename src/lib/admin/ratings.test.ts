import assert from "node:assert/strict";
import { test } from "node:test";

import { aiInterviewToClose, applyRatings, completionBonusCount, grantCompletionBonus, readRatingsSheet } from "./ratings.ts";

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

test("score: four core keys only, clamped and rounded to one decimal", () => {
  const extra = { ratings: { overall: 2, academic: 1 } };
  assert.equal(applyRatings(extra, { coding: 7, aptitude: 8, interview: 8 }).findternScore, 7.7);
  assert.equal(applyRatings({}, {}, 12).findternScore, 10);
  assert.equal(applyRatings({}, {}, 6.66).findternScore, 6.7);
});

test("null clears a rating; clearing all removes the score", () => {
  const start = applyRatings({}, { coding: 8, aptitude: 6 });
  const one = applyRatings(start, { coding: null });
  assert.deepEqual(one.ratings, { aptitude: 6 });
  assert.equal(one.findternScore, 6);
  const none = applyRatings(one, { aptitude: null });
  assert.equal("findternScore" in none, false);
});

test("headers match ignoring case, spaces, dashes and underscores", () => {
  const rows = readRatingsSheet("E-Mail,AI_Interview,Findtern-Score\r\nx@y.com,7,7\r\n");
  assert.equal(rows[0].email, "x@y.com");
  assert.equal(rows[0].updates.interview, 7);
  assert.equal(rows[0].score, 7);
});

test("score going live closes only the latest AI interview (ADP-22)", () => {
  const d = (s: string) => new Date(s);
  const rows = [
    { id: "old", status: "missed", createdAt: d("2026-01-01") },
    { id: "new", status: "scheduled", createdAt: d("2026-03-01") },
    { id: "mid", status: "cancelled", createdAt: d("2026-02-01") },
  ];
  assert.equal(aiInterviewToClose(rows)?.id, "new");
  assert.equal(aiInterviewToClose([{ id: "a", status: "completed", createdAt: d("2026-03-01") }, rows[0]]), null);
  assert.equal(aiInterviewToClose([]), null);
});

test("completion bonus: +1 per granted internship, capped at 10", () => {
  const once = grantCompletionBonus({ findternScore: 7.2, ratings: { coding: 7.2 } });
  assert.equal(once.findternScore, 8.2);
  assert.equal(completionBonusCount(once), 1);
  assert.equal(grantCompletionBonus({ findternScore: 9.5 }).findternScore, 10);
  assert.equal(grantCompletionBonus({ findternScore: 10 }).findternScore, 10);
});

test("completion bonus survives every recompute of the rated score", () => {
  const granted = grantCompletionBonus({ findternScore: 7, ratings: { coding: 8, aptitude: 6 } });
  // ratings edit / Incruiter webhook (mean) add the bonus back; a given (imported) score is final
  assert.equal(applyRatings(granted, { coding: 8 }).findternScore, 8); // mean of 8 and 6 is 7, plus the bonus
  assert.equal(applyRatings(granted, {}, 8).findternScore, 8); // the exported 8 imported back stays 8
  assert.equal(applyRatings({ completionBonusCount: 3 }, { coding: 9 }).findternScore, 10);
});

test("completion bonus waits for a first score and never invents one", () => {
  const granted = grantCompletionBonus({});
  assert.equal(granted.findternScore, undefined);
  assert.equal(completionBonusCount(granted), 1);
  assert.equal(applyRatings(granted, {}).findternScore, undefined);
  assert.equal(applyRatings(granted, { coding: 6 }).findternScore, 7);
  assert.equal(completionBonusCount({ completionBonusCount: -2 }), 0);
  assert.equal(completionBonusCount({ completionBonusCount: 1.5 }), 0);
});

const withBonus = (extra: Record<string, unknown>) => grantCompletionBonus(extra);

test("bonus granted before any score is added once when the first score is imported", () => {
  const pending = withBonus({});
  assert.equal(pending.findternScore, undefined);
  const imported = applyRatings(pending, {}, 7);
  assert.equal(imported.findternScore, 8);
  // the exported 8 imported back, and the same sheet twice, never add it again
  assert.equal(applyRatings(imported, {}, 8).findternScore, 8);
  assert.equal(applyRatings(imported, {}, 7).findternScore, 7);
  assert.equal(applyRatings(applyRatings(pending, {}, 7), {}, 7).findternScore, 7);
});

test("bonus granted before the first score is also added once on the mean path", () => {
  const pending = withBonus({});
  const rated = applyRatings(pending, { coding: 6, aptitude: 8 });
  assert.equal(rated.findternScore, 8); // mean 7 + 1
  assert.equal(applyRatings(rated, {}, 8).findternScore, 8);
  assert.equal(applyRatings(rated, { coding: 6 }).findternScore, 8);
});

test("bonus granted after a score raises it once, and a later import of that number stays", () => {
  const scored = applyRatings({}, {}, 6);
  const granted = withBonus(scored);
  assert.equal(granted.findternScore, 7);
  assert.equal(applyRatings(granted, {}, 7).findternScore, 7);
  assert.equal(applyRatings(granted, {}, 7).findternScore, 7);
});

test("two pending bonuses are both added, once, and the score caps at 10", () => {
  const pending = withBonus(withBonus({}));
  assert.equal(completionBonusCount(pending), 2);
  assert.equal(applyRatings(pending, {}, 8.5).findternScore, 10);
  assert.equal(applyRatings(withBonus({}), {}, 10).findternScore, 10);
  assert.equal(applyRatings(applyRatings(pending, {}, 8.5), {}, 10).findternScore, 10);
  assert.equal(withBonus({ findternScore: 10, completionBonusApplied: 0, completionBonusCount: 0 }).findternScore, 10);
});

test("clearing every rating drops the score and puts the bonus back to pending", () => {
  const rated = applyRatings(withBonus({}), { coding: 5 });
  assert.equal(rated.findternScore, 6);
  const cleared = applyRatings(rated, { coding: null });
  assert.equal(cleared.findternScore, undefined);
  assert.equal(applyRatings(cleared, {}, 5).findternScore, 6);
});

test("rows saved before the applied counter keep their score as final", () => {
  assert.equal(applyRatings({ findternScore: 8, completionBonusCount: 1 }, {}, 8).findternScore, 8);
  assert.equal(applyRatings({ completionBonusCount: 1 }, {}, 8).findternScore, 9);
});
