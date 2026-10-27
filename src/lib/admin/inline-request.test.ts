import { test } from "node:test";
import assert from "node:assert/strict";

import { bodyForDraft, bodyForValue, draftFrom, typedDraft, type InlineField } from "./inline-request.ts";

test("bodyForValue merges the value under valueKey (default 'value')", () => {
  assert.deepEqual(bodyForValue({ url: "/x", body: { ids: ["a"] }, valueKey: "visibility" }, "hidden"), { ids: ["a"], visibility: "hidden" });
  assert.deepEqual(bodyForValue({ url: "/x" }, true), { value: true });
});

const RATINGS: InlineField[] = [
  { key: "coding", label: "Coding", type: "number", min: 0, max: 10 },
  { key: "note", label: "Note", type: "text", onlyIfChanged: true },
];

test("draftFrom stringifies and blanks missing values", () => {
  assert.deepEqual(draftFrom(RATINGS, { coding: 7.5, note: null }), { coding: "7.5", note: "" });
});

test("typedDraft converts numbers, clears empties and skips unchanged fields", () => {
  const initial = draftFrom(RATINGS, { coding: 7, note: "hi" });
  assert.deepEqual(typedDraft(RATINGS, { coding: "8", note: "hi" }, initial), { ok: true, values: { coding: 8 } });
  assert.deepEqual(typedDraft(RATINGS, { coding: "", note: "  " }, initial), { ok: true, values: { coding: null, note: null } });
});

test("typedDraft refuses out-of-range or non-numeric numbers", () => {
  const initial = draftFrom(RATINGS, {});
  assert.deepEqual(typedDraft(RATINGS, { coding: "11", note: "" }, initial), { ok: false, error: "Coding must be at most 10." });
  assert.deepEqual(typedDraft(RATINGS, { coding: "abc", note: "" }, initial), { ok: false, error: "Coding must be a number." });
});

test("bodyForDraft spreads or nests the values", () => {
  assert.deepEqual(bodyForDraft({ url: "/x", body: { id: "1" } }, { a: 1 }), { id: "1", a: 1 });
  assert.deepEqual(bodyForDraft({ url: "/x", valueKey: "ratings" }, { a: 1 }), { ratings: { a: 1 } });
});
