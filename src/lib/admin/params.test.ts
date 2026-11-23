import assert from "node:assert/strict";
import test from "node:test";

import { flattenParams, MAX_PAGE, parsePageRequest, pastLastPageHref } from "./params.ts";

test("pastLastPageHref: in-range pages are left alone", () => {
  assert.equal(pastLastPageHref("/admin/interns", {}, 1, 3, 25), null);
  assert.equal(pastLastPageHref("/admin/interns", { page: "2" }, 2, 30, 25), null);
});

test("pastLastPageHref: page 99 of 3 rows goes back to page 1 with the other filters kept (B-30)", () => {
  assert.equal(pastLastPageHref("/admin/interns", { page: "99", q: "ada" }, 99, 3, 25), "/admin/interns?q=ada");
});

test("pastLastPageHref: beyond the last of several pages lands on the last page", () => {
  assert.equal(pastLastPageHref("/admin/interns", { page: "99", per: "10" }, 99, 31, 10), "/admin/interns?page=4&per=10");
});

test("pastLastPageHref: no rows at all means page 1, never a redirect loop", () => {
  assert.equal(pastLastPageHref("/admin/interns", { page: "2" }, 2, 0, 25), "/admin/interns");
  assert.equal(pastLastPageHref("/admin/interns", {}, 1, 0, 25), null);
});

test("flattenParams drops NUL bytes from every value, so a filter can't fail the query", () => {
  assert.deepEqual(flattenParams({ q: "a\u0000b", course: ["x\u0000", "y"], n: undefined }), { q: "ab", course: "x" });
});

test("parsePageRequest: a NUL-bearing q reaches the database clean, and a huge page is clamped to a safe int", () => {
  assert.equal(parsePageRequest({ q: " a\u0000b " }).search, "ab");
  const r = parsePageRequest({ page: "99999999999999999999", per: "100" });
  assert.equal(r.page, MAX_PAGE);
  assert.ok(Number.isSafeInteger(r.offset) && r.offset < 2 ** 31);
  assert.equal(parsePageRequest({ page: "-4" }).page, 1);
});
