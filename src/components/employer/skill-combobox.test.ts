import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arrowKey, limitNote } from "./skill-combobox.ts";

describe("arrowKey", () => {
  it("ignores other keys and empty lists", () => {
    assert.equal(arrowKey("Enter", { open: true, count: 3, highlight: 0 }), null);
    assert.equal(arrowKey("ArrowDown", { open: false, count: 0, highlight: -1 }), null);
    assert.equal(arrowKey("ArrowUp", { open: true, count: 0, highlight: -1 }), null);
  });

  it("reopens a closed list: Down lands on the first row, Up on the last", () => {
    assert.deepEqual(arrowKey("ArrowDown", { open: false, count: 4, highlight: -1 }), { open: true, highlight: 0 });
    assert.deepEqual(arrowKey("ArrowUp", { open: false, count: 4, highlight: -1 }), { open: true, highlight: 3 });
  });

  it("starts from the ends when open with nothing highlighted", () => {
    assert.deepEqual(arrowKey("ArrowDown", { open: true, count: 4, highlight: -1 }), { open: true, highlight: 0 });
    assert.deepEqual(arrowKey("ArrowUp", { open: true, count: 4, highlight: -1 }), { open: true, highlight: 3 });
  });

  it("walks and wraps an open list", () => {
    assert.deepEqual(arrowKey("ArrowDown", { open: true, count: 3, highlight: 1 }), { open: true, highlight: 2 });
    assert.deepEqual(arrowKey("ArrowDown", { open: true, count: 3, highlight: 2 }), { open: true, highlight: 0 });
    assert.deepEqual(arrowKey("ArrowUp", { open: true, count: 3, highlight: 0 }), { open: true, highlight: 2 });
    assert.deepEqual(arrowKey("ArrowUp", { open: true, count: 3, highlight: 2 }), { open: true, highlight: 1 });
  });
});

describe("limitNote", () => {
  it("is silent below the limit", () => {
    assert.equal(limitNote(0, 7, "skills"), null);
    assert.equal(limitNote(6, 7, "skills"), null);
  });

  it("says why the add control is gone at the limit", () => {
    assert.equal(limitNote(7, 7, "skills"), "7 of 7 skills. Remove one to add another.");
    assert.equal(limitNote(7, 7, "added"), "7 of 7 added. Remove one to add another.");
  });

  it("covers rows saved under an older, higher limit", () => {
    assert.equal(limitNote(8, 7, "skills"), "Saved under an older limit. Remove 2 to add a new one.");
  });

  it("uses no em dash", () => {
    assert.ok(!limitNote(7, 7, "skills")!.includes("\u2014"));
  });
});
