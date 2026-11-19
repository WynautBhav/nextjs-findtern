import assert from "node:assert/strict";
import test from "node:test";

import { pastLastPageHref } from "./params.ts";

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
