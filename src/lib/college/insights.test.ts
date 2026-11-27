import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { QUADRANT_VIEW, QUADRANTS, inQuadrant, quadrantCounts, quadrantList, quadrantOf } from "./insights.ts";
import { studentsLinkFilter } from "./labels.ts";

const root = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// 40 students over every corner, plus rows the chart must skip (no score or no CGPA yet).
const rows = [
  ...Array.from({ length: 7 }, (_, i) => ({ userId: `s${i}`, name: `Star ${i}`, score: 7 + i * 0.3, cgpa: 8 + i * 0.1 })),
  ...Array.from({ length: 12 }, (_, i) => ({ userId: `b${i}`, name: `Beats ${i}`, score: 7.2 + i * 0.1, cgpa: 6 })),
  ...Array.from({ length: 3 }, (_, i) => ({ userId: `c${i}`, name: `Cg ${i}`, score: 5, cgpa: 9 })),
  ...Array.from({ length: 5 }, (_, i) => ({ userId: `n${i}`, name: `Low ${i}`, score: 4, cgpa: 6 })),
  { userId: "x1", name: "No score", score: null, cgpa: 8 },
  { userId: "x2", name: "No cgpa", score: 8, cgpa: null },
];

test("the tile count of every quadrant is the length of the Master data filter on the same rows", () => {
  const counts = quadrantCounts(rows);
  for (const q of QUADRANTS) assert.equal(counts[q], rows.filter((r) => inQuadrant(r, q)).length, q);
  assert.equal(counts.stars, 7);
  assert.equal(counts.scoreBeatsCg, 12);
  assert.equal(counts.cgBeatsScore, 3);
  assert.equal(counts.support, 5);
  // Rows with a missing figure are in no quadrant, on the tile and in the filter alike.
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 27);
  assert.equal(quadrantOf(rows[rows.length - 1]), null);
});

test("a list under a tile never hides students silently: shown + the rest is the tile count, and a See all link says how many", () => {
  for (const cap of [1, 6, 8, 100]) {
    for (const q of QUADRANTS) {
      const l = quadrantList(rows, q, cap);
      assert.equal(l.total, quadrantCounts(rows)[q]);
      assert.ok(l.shown.length <= cap);
      assert.equal(l.shown.length + l.more, l.total);
      assert.equal(l.more > 0, l.total > cap, "the link shows exactly when the list is cut");
    }
  }
});

test("the list is highest score first, and its first rows are the top of the whole quadrant", () => {
  const l = quadrantList(rows, "stars", 3);
  assert.deepEqual(l.shown.map((r) => r.userId), ["s6", "s5", "s4"]);
});

test("each quadrant has one Master data view to open, and that view exists in the table's ready-made views", () => {
  const table = read("components/college/master-data-table.tsx");
  for (const q of QUADRANTS) assert.ok(table.includes(`id: "${QUADRANT_VIEW[q]}"`), `${q} -> ${QUADRANT_VIEW[q]}`);
  assert.match(table, /if \(f\.quadrant && !inQuadrant\(r, f\.quadrant\)\) return false;/, "the table filters with the shared rule");
});

test("the Dashboard chart is built from Master data's rows, so it cannot count a different set of students", () => {
  const page = read("app/college/page.tsx");
  assert.match(page, /const scorePoints = master\.flatMap/);
});

test("the old ?show=not_open link lands on Hidden, Open to work turned off; other links are unchanged", () => {
  assert.deepEqual(studentsLinkFilter("not_open", undefined), { show: "hidden", why: "open_to_work" });
  assert.deepEqual(studentsLinkFilter("not_open", "profile"), { show: "hidden", why: "open_to_work" });
  assert.deepEqual(studentsLinkFilter("hidden", "profile"), { show: "hidden", why: "profile" });
  assert.deepEqual(studentsLinkFilter("offers", undefined), { show: "offers", why: undefined });
});

test("the duplicate chip is gone from the Students page", () => {
  const cards = read("components/college/student-cards.tsx");
  assert.ok(!/not_open/.test(cards), "no Not open to work chip or matcher");
  assert.ok(!/not_open/.test(read("app/college/students/page.tsx").replace(/studentsLinkFilter[^\n]*/g, "")), "the page only maps the old link");
});
