import assert from "node:assert/strict";
import { test } from "node:test";

import { reportHref } from "./href.ts";

test("keeps the current query, applies the patch, drops empty values", () => {
  assert.equal(reportHref({ tab: "interns", range: "week", iq: "jai" }, { ipage: "2" }), "/admin/reports?tab=interns&range=week&iq=jai&ipage=2");
  assert.equal(reportHref({ tab: "interns", iq: "jai" }, { iq: "" }), "/admin/reports?tab=interns");
});

test("changing a filter resets that table's page when asked", () => {
  assert.equal(reportHref({ tab: "interns", ipage: "4", iq: "a" }, { iq: "b" }, ["ipage"]), "/admin/reports?tab=interns&iq=b");
});

test("switching range clears the period and custom dates so they cannot win", () => {
  assert.equal(reportHref({ tab: "finance", period: "30d", from: "2026-11-01" }, { range: "week" }, ["period", "from", "to"]), "/admin/reports?tab=finance&range=week");
});

test("no query at all is the bare path", () => {
  assert.equal(reportHref({}, {}), "/admin/reports");
});
