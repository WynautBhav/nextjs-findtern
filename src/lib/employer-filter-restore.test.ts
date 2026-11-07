import assert from "node:assert/strict";
import { test } from "node:test";

import { restorableFilters } from "./employer-filter-restore.ts";

const KEYS = ["q", "skills", "city", "mode", "min", "plan", "sort", "dir", "page"];

// The bug: a cookie saved by the older build held only `view=grid`. The page treated that as a
// saved filter, redirected to `?view=grid&project=X`, still saw no filter key, and redirected again, forever.
test("a saved string with only retired or non-filter keys restores nothing", () => {
  assert.equal(restorableFilters("view=grid", KEYS), "");
  assert.equal(restorableFilters("view=table&project=abc&ids=1,2&fresh=1", KEYS), "");
});

test("keeps filter keys and drops the retired view", () => {
  assert.equal(restorableFilters("skills=react&view=grid", KEYS), "skills=react");
  assert.equal(restorableFilters("view=table&city=Jaipur&plan=assured", KEYS), "city=Jaipur&plan=assured");
});

test("a typed keyword is never restored", () => {
  assert.equal(restorableFilters("q=react&city=Jaipur", KEYS), "city=Jaipur");
  assert.equal(restorableFilters("q=react", KEYS), "");
});

test("repeated keys survive in order", () => {
  assert.equal(restorableFilters("skills=react&skills=sql&view=grid", KEYS), "skills=react&skills=sql");
});

test("empty and junk input restore nothing", () => {
  assert.equal(restorableFilters("", KEYS), "");
  assert.equal(restorableFilters("%%%", KEYS), "");
});
