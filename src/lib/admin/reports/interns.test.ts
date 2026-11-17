import assert from "node:assert/strict";
import { test } from "node:test";

import { INTERN_PAGE_SIZE, bandOf, bandLabel, escapeLike, internStage, parseInternFilter, skillNames } from "./interns.ts";

test("bandOf uses the fixed cut-offs 6 and 8 (Espresso, Cappuccino, Latte); no score is Unscored", () => {
  assert.equal(bandOf(0), "espresso");
  assert.equal(bandOf(5.99), "espresso");
  assert.equal(bandOf(6), "cappuccino");
  assert.equal(bandOf(7.99), "cappuccino");
  assert.equal(bandOf(8), "latte");
  assert.equal(bandOf(10), "latte");
  assert.equal(bandOf(null), "unscored");
  assert.equal(bandOf(undefined), "unscored");
  assert.equal(bandOf(Number.NaN), "unscored");
  assert.equal(bandLabel("espresso"), "Espresso");
  assert.equal(bandLabel("unscored"), "Unscored");
});

test("internStage is the furthest step reached", () => {
  const base = { profileStarted: false, profileComplete: false, feePaid: false, scored: false, applied: false, hired: false };
  assert.equal(internStage(base), "signed_up");
  assert.equal(internStage({ ...base, profileStarted: true }), "profile_started");
  assert.equal(internStage({ ...base, profileStarted: true, profileComplete: true }), "profile_complete");
  assert.equal(internStage({ ...base, profileComplete: true, feePaid: true }), "activated");
  assert.equal(internStage({ ...base, profileComplete: true, feePaid: true, scored: true }), "interviewed");
  assert.equal(internStage({ ...base, feePaid: true, scored: true, applied: true }), "in_pipeline");
  assert.equal(internStage({ ...base, hired: true }), "hired");
});

test("a paid intern who never finished the profile is still activated (money is the stronger fact)", () => {
  const base = { profileStarted: true, profileComplete: false, feePaid: true, scored: false, applied: false, hired: false };
  assert.equal(internStage(base), "activated");
});

test("skillNames reads strings and {name} objects, trims, de-duplicates case-insensitively, drops junk", () => {
  assert.deepEqual(skillNames(["React", " react ", { name: "Node.js", rating: 3 }, { name: "" }, null, 5, "", { nope: 1 }]), ["React", "Node.js"]);
  assert.deepEqual(skillNames(null), []);
  assert.deepEqual(skillNames("React"), []);
});

test("escapeLike neutralises % _ and backslash", () => {
  assert.equal(escapeLike("100%_sure\\"), "100\\%\\_sure\\\\");
  assert.equal(escapeLike("plain"), "plain");
});

test("parseInternFilter validates every key and clamps the page", () => {
  const f = parseInternFilter({ iq: "  Jai  ", icity: "jaipur", iskill: "React", istatus: "hired", iband: "latte", ipage: "3", isort: "score", idir: "asc" });
  assert.deepEqual(f, { q: "Jai", city: "jaipur", skill: "React", status: "hired", band: "latte", page: 3, sort: "score", dir: "asc" });
});

test("parseInternFilter falls back on junk: unknown sort, status and band, negative or huge pages", () => {
  const f = parseInternFilter({ isort: "password; drop table", istatus: "weird", iband: "gold", ipage: "-4", idir: "sideways" });
  assert.equal(f.sort, "joined");
  assert.equal(f.dir, "desc");
  assert.equal(f.status, "");
  assert.equal(f.band, "");
  assert.equal(f.page, 1);
  assert.equal(parseInternFilter({ ipage: "99999999" }).page, 10_000);
  assert.equal(parseInternFilter({ ipage: "abc" }).page, 1);
});

test("long search text is capped, page size is 25", () => {
  assert.equal(parseInternFilter({ iq: "x".repeat(500) }).q.length, 80);
  assert.equal(INTERN_PAGE_SIZE, 25);
});
