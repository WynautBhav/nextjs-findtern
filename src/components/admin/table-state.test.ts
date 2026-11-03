import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearFilters,
  hasActiveFilters,
  nextSort,
  parsePer,
  parseSortSelectValue,
  resolveTableKeys,
  selectionScope,
  setParam,
  sortSelectValue,
} from "./table-state.ts";

test("setParam resets the table's own page key, not a hard-coded one", () => {
  const keys = resolveTableKeys({ pageKey: "ppage" });
  assert.equal(setParam("ppage=4&per=50&q=a", "status", "live", keys), "per=50&q=a&status=live");
  assert.equal(setParam("ppage=4&page=2", "ppage", "5", keys, { keepPage: true }), "ppage=5&page=2");
  assert.equal(setParam("q=a", "q", "", keys), "");
});

test("clearFilters keeps per, sort and other tables' keys", () => {
  const keys = resolveTableKeys({ pageKey: "ppage" });
  const out = clearFilters("q=ab&status=live&ppage=3&per=50&sort=name&dir=asc&page=2", ["status"], keys);
  assert.equal(out, "per=50&sort=name&dir=asc&page=2");
});

test("hasActiveFilters ignores sort, paging and blank values", () => {
  assert.equal(hasActiveFilters({ sort: "name", page: "2", q: "  " }, ["status"]), false);
  assert.equal(hasActiveFilters({ q: "x" }, ["status"]), true);
  assert.equal(hasActiveFilters({ status: "live" }, ["status"]), true);
});

test("nextSort flips only the active column", () => {
  assert.deepEqual(nextSort({ sort: "name", dir: "desc" }, "name"), { sort: "name", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "asc" }, "name"), { sort: "name", dir: "desc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "asc" }, "date"), { sort: "date", dir: "desc" });
});

test("sort select value round-trips and ignores unknown columns", () => {
  assert.equal(sortSelectValue({ sort: "name", dir: "asc" }, ["name", "date"]), "name:asc");
  assert.equal(sortSelectValue({ sort: "zzz" }, ["name"]), "");
  assert.deepEqual(parseSortSelectValue("name:asc"), { sort: "name", dir: "asc" });
  assert.equal(parseSortSelectValue(""), null);
});

test("parsePer falls back off the allow-list", () => {
  assert.equal(parsePer("50", [10, 25, 50]), 50);
  assert.equal(parsePer("7", [10, 25, 50]), 25);
  assert.equal(parsePer(null, [10, 25, 50]), 25);
});

test("selectionScope is order-independent", () => {
  assert.equal(selectionScope("b=2&a=1"), selectionScope("a=1&b=2"));
  assert.notEqual(selectionScope("page=1"), selectionScope("page=2"));
});
