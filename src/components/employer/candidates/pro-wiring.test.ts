import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PRO_PARAMS, restorableFilters, withoutProParams } from "../../../lib/employer-filter-restore.ts";
import { collegeSortToken } from "../../../lib/candidate-sort.ts";

/**
 * `_query.ts` imports the database and `@/` aliases, so node:test cannot load it: the rules are tested in
 * lib/candidate-pro-access.test.ts (entitlement, enforcement) and here the loader's wiring is pinned, plus the
 * URL round trip through the same helpers the page uses.
 */
const query = readFileSync(join(import.meta.dirname, "../../../app/employer/candidates/_query.ts"), "utf8");
const results = readFileSync(join(import.meta.dirname, "../../../app/employer/candidates/_toolbar.tsx"), "utf8");
const panel = readFileSync(join(import.meta.dirname, "../../../app/employer/candidates/_filter-form.tsx"), "utf8");

test("the loader asks for the entitlement before anything is restored or filtered, and empties the Pro filters without it", () => {
  const at = (needle: string) => {
    const i = query.indexOf(needle);
    assert.ok(i > 0, needle);
    return i;
  };
  // The entitlement read starts in the first wave (`proP = early(proAccess(uid))`) and is awaited before anything is restored or filtered.
  assert.ok(at("early(proAccess(uid))") < at("const proActive = await proP"));
  assert.ok(at("const proActive = await proP") < at("restorableFilters(await rememberedFilters"));
  assert.ok(at("const proActive = await proP") < at("enforcePro("));
  assert.match(query, /if \(!proActive\) \{[\s\S]*?Object\.assign\(filters, \{ \.\.\.EMPTY_PRO_REQUEST, colleges: \[\] \}\)/);
});

test("the pool is narrowed by enforcePro with the entitlement, and ranked after it, before the page is cut", () => {
  assert.match(query, /const proOutcome = enforcePro\(\s*pool,[\s\S]*?proActive,/);
  assert.match(query, /const ranked = proOutcome\.order\(rankProfiles\(profiles,/);
  assert.ok(query.indexOf("proOutcome.order(") < query.indexOf("pageWindow(data.total"));
});

test("a remembered query is stripped of Pro filters for an employer without the subscription", () => {
  assert.match(query, /const savedFilters = proActive \? restorable : withoutProParams\(restorable\);/);
  assert.match(query, /\.\.\.PRO_PARAMS,/);
});

test("the college order is written into the sort parameter, and every Pro pair comes from proQueryPairs", () => {
  assert.match(query, /\[\.\.\.merged\.sorts, collegeSortToken\(merged\.collegeSort\)\]\.filter\(Boolean\)/);
  assert.match(query, /for \(const \[key, value\] of proQueryPairs\(merged\)\) next\.append\(key, value\)/);
});

test("the filter panel treats cgpaMin 0 as 'any' and refocuses a repeated checkbox by its value", () => {
  assert.match(panel, /ZERO_IS_ANY = \/\^\(min\|cgpaMin\|r_\[a-z\]\+\)\$\//);
  assert.match(panel, /\[value="\$\{CSS\.escape/);
});

test("the results toolbar offers the college sorts, locked for an employer without the subscription", () => {
  assert.match(results, /College \(Pro\)/);
  assert.match(results, /disabled: !proActive/);
  assert.match(results, /sortOptions\(filters, data\.pro\.active\)/);
});

test("the Pro parameters are part of the restorable filter keys, and withoutProParams removes exactly them", () => {
  assert.deepEqual([...PRO_PARAMS], ["cgpaMin", "cgpaVerified", "colleges"]);
  const saved = "city=Pune&cgpaMin=8&cgpaVerified=1&colleges=A&sort=college_desc&min=5";
  assert.equal(withoutProParams(restorableFilters(saved, ["city", "min", "sort", ...PRO_PARAMS])), "city=Pune&min=5");
  assert.equal(collegeSortToken("desc"), "college_desc");
});
