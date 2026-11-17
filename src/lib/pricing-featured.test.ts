import assert from "node:assert/strict";
import { test } from "node:test";

import { featuredLosers, pickFeaturedWinner, singleFeatured } from "./pricing-featured.ts";

const at = (iso: string) => new Date(iso);
const row = (id: string, isFeatured: boolean, updatedAt: Date | string | null = null) => ({ id, isFeatured, updatedAt });

test("no featured plan: no winner, nothing to un-feature", () => {
  const rows = [row("a", false), row("b", false)];
  assert.equal(pickFeaturedWinner(rows), null);
  assert.deepEqual(featuredLosers(rows), []);
});

test("exactly one featured plan wins and nothing is un-featured", () => {
  const rows = [row("a", false), row("b", true), row("c", false)];
  assert.equal(pickFeaturedWinner(rows), "b");
  assert.deepEqual(featuredLosers(rows), []);
});

test("several featured: the most recently updated one wins, the rest lose", () => {
  const rows = [
    row("a", true, at("2026-11-01T10:00:00Z")),
    row("b", true, at("2026-11-10T10:00:00Z")),
    row("c", true, at("2026-11-05T10:00:00Z")),
    row("d", false, at("2026-11-16T10:00:00Z")), // newer, but not featured: never wins
  ];
  assert.equal(pickFeaturedWinner(rows), "b");
  assert.deepEqual(featuredLosers(rows).sort(), ["a", "c"]);
});

test("a row with no update time is the oldest; ISO strings compare as instants", () => {
  assert.equal(pickFeaturedWinner([row("a", true, null), row("b", true, "2026-01-01T00:00:00Z")]), "b");
  assert.equal(pickFeaturedWinner([row("a", true, "2026-11-01T10:00:00+05:30"), row("b", true, "2026-11-01T05:00:00Z")]), "b");
});

test("a tie keeps the first row (sort order), so the result is stable", () => {
  const t = at("2026-11-01T10:00:00Z");
  assert.equal(pickFeaturedWinner([row("a", true, t), row("b", true, t)]), "a");
  assert.equal(pickFeaturedWinner([row("b", true, t), row("a", true, t)]), "b");
});

test("an explicit preference beats recency (the plan just saved as Most popular)", () => {
  const rows = [row("a", true, at("2026-11-10T10:00:00Z")), row("b", true, at("2026-11-01T10:00:00Z"))];
  assert.deepEqual(featuredLosers(rows, "b"), ["a"]);
  // A preferred plan that is not featured is ignored.
  assert.deepEqual(featuredLosers([row("a", true), row("b", false)], "b"), []);
});

test("singleFeatured returns every row, with the flag kept only on the winner, without mutating the input", () => {
  const rows = [
    { ...row("a", true, at("2026-11-01T10:00:00Z")), name: "A" },
    { ...row("b", true, at("2026-11-10T10:00:00Z")), name: "B" },
  ];
  const out = singleFeatured(rows);
  assert.deepEqual(out.map((r) => [r.id, r.isFeatured, r.name]), [["a", false, "A"], ["b", true, "B"]]);
  assert.equal(rows[0].isFeatured, true);
  assert.equal(singleFeatured([]).length, 0);
});
