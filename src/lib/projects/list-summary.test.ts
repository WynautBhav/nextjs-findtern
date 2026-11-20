import assert from "node:assert/strict";
import { test } from "node:test";

import { acceptedPercent, countLabel, skillChips, stripTiles, tallyStatuses } from "./list-summary.ts";

const META = { published: "Live", draft: "Draft", pending_review: "Ready to publish", paused: "Paused", rejected: "Needs changes", closed: "Closed" };

test("tallyStatuses counts by key and files a missing status under unknown", () => {
  assert.deepEqual(tallyStatuses(["draft", "draft", "closed", null, undefined]), { draft: 2, closed: 1, unknown: 2 });
  assert.deepEqual(tallyStatuses([]), {});
});

test("stripTiles: All plus the four everyday states, zeros included", () => {
  const t = stripTiles({}, 0, META);
  assert.deepEqual(t.map((x) => x.key), ["all", "published", "draft", "paused", "closed"]);
  assert.ok(t.every((x) => x.count === 0));
});

test("stripTiles adds review and rejected only when present, in lifecycle order, with counts", () => {
  const t = stripTiles({ published: 2, pending_review: 1, rejected: 3, closed: 1 }, 7, META);
  assert.deepEqual(t.map((x) => x.key), ["all", "published", "draft", "pending_review", "paused", "rejected", "closed"]);
  assert.equal(t[0].count, 7);
  assert.equal(t.find((x) => x.key === "rejected")?.count, 3);
  assert.equal(t.find((x) => x.key === "pending_review")?.label, "Ready to publish");
  assert.ok(t.every((x) => x.hint.length > 0));
});

test("skillChips caps the chips and reports the rest", () => {
  assert.deepEqual(skillChips(["a", "b", "c"], 5), { shown: ["a", "b", "c"], more: 0 });
  assert.deepEqual(skillChips(["a", "b", "c", "d", "e", "f", "g"], 5), { shown: ["a", "b", "c", "d", "e"], more: 2 });
  assert.deepEqual(skillChips([], 5), { shown: [], more: 0 });
});

test("acceptedPercent is a whole number, bounded, and 0 with nothing sent", () => {
  assert.equal(acceptedPercent(0, 0), 0);
  assert.equal(acceptedPercent(8, 3), 38);
  assert.equal(acceptedPercent(2, 5), 100);
  assert.equal(acceptedPercent(3, -1), 0);
});

test("countLabel pluralises", () => {
  assert.equal(countLabel(0), "0 projects");
  assert.equal(countLabel(1), "1 project");
  assert.equal(countLabel(12), "12 projects");
});
