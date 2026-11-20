import assert from "node:assert/strict";
import { test } from "node:test";

import { PRO_PARAMS, restorableFilters, withoutProParams, withoutSavedCity } from "./employer-filter-restore.ts";

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

/* ── Findtern Pro parameters: never restored for an employer without the subscription ── */

const PRO_KEYS = [...KEYS, ...PRO_PARAMS];

test("Pro filters are restored for a subscriber, who passes the keys through", () => {
  assert.equal(restorableFilters("cgpaMin=8&colleges=IIT%20Bombay&colleges=Anna%20University&sort=college", PRO_KEYS), "cgpaMin=8&colleges=IIT+Bombay&colleges=Anna+University&sort=college");
});

test("withoutProParams drops the Pro keys and the college sort, and keeps every other filter", () => {
  assert.equal(withoutProParams("cgpaMin=8&cgpaVerified=1&colleges=A&colleges=B&city=Jaipur&plan=assured"), "city=Jaipur&plan=assured");
  assert.equal(withoutProParams("sort=coding,college_desc&dir=asc"), "sort=coding&dir=asc");
  assert.equal(withoutProParams("sort=college&skills=react"), "skills=react");
  assert.equal(withoutProParams("sort=college,college_desc"), "");
});

test("a saved string of only Pro filters restores nothing without the subscription", () => {
  assert.equal(withoutProParams(restorableFilters("cgpaMin=7.5&colleges=X&sort=college", PRO_KEYS)), "");
});

test("withoutProParams leaves a plain query alone and survives junk", () => {
  assert.equal(withoutProParams("skills=react&skills=sql"), "skills=react&skills=sql");
  assert.equal(withoutProParams(""), "");
  assert.doesNotThrow(() => withoutProParams("%%%"));
});

test("withoutSavedCity drops a remembered city, even an empty one, and keeps the rest", () => {
  assert.equal(withoutSavedCity("city=Jaipur&plan=assured"), "plan=assured");
  assert.equal(withoutSavedCity("skills=react&city=&min=3"), "skills=react&min=3");
  assert.equal(withoutSavedCity("city=Jaipur"), "");
  assert.equal(withoutSavedCity("plan=assured"), "plan=assured");
});
