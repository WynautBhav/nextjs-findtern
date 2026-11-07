import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// `_query.ts` imports the DB and `@/` aliases, so node:test can't load it: pin the wiring instead.
const src = readFileSync(join(import.meta.dirname, "../../app/employer/candidates/_query.ts"), "utf8");

test("a typed keyword is never remembered, only structured filters", () => {
  assert.match(src, /rememberQueryOf\(filters: Filters\): string \{\s*return filterParams\(filters, false\)/);
  assert.match(src, /if \(withKeyword && merged\.q\) next\.set\("q"/);
  // Links (and compare's "back") still carry it: queryOf keeps the default.
  assert.match(src, /const filters = filterParams\(merged\);/);
});

// The keyword (and the retired `view`) are stripped by restorableFilters; its behaviour is tested
// in lib/employer-filter-restore.test.ts. Here we only pin that the restore goes through it.
test("a cookie written before this still cannot restore a keyword", () => {
  assert.match(src, /restorableFilters\(await rememberedFilters\(uid, activeProjectId\), FILTER_KEYS\)/);
});
