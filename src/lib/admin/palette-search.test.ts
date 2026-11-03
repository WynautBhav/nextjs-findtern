import { test } from "node:test";
import assert from "node:assert/strict";

import { allowedGroups, cleanQuery, escapeLike, invoiceHref, likePattern } from "./palette-search.ts";

test("escapeLike makes %, _ and backslash literal", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  assert.equal(escapeLike("plain"), "plain");
  assert.equal(likePattern("a_b"), "%a\\_b%");
});

test("cleanQuery enforces 2 to 64 characters after trimming", () => {
  assert.equal(cleanQuery(null), null);
  assert.equal(cleanQuery(" a "), null);
  assert.equal(cleanQuery("  ab "), "ab");
  assert.equal(cleanQuery("x".repeat(64)), "x".repeat(64));
  assert.equal(cleanQuery("x".repeat(65)), null);
});

test("allowedGroups follows the session permissions", () => {
  assert.deepEqual(allowedGroups(["interns:read"]), ["candidates"]);
  assert.deepEqual(allowedGroups(["companies:read", "transactions:read"]), ["companies", "invoices"]);
  assert.deepEqual(allowedGroups(["reports:read", "cms:read"]), []);
  assert.deepEqual(allowedGroups(undefined), []);
  assert.deepEqual(allowedGroups(["*"]), ["candidates", "companies", "invoices"]);
});

test("invoiceHref opens the right list with the number as the search", () => {
  assert.equal(invoiceHref({ kind: "order", label: "FT/2026-27/0001" }), "/admin/orders?q=FT%2F2026-27%2F0001");
  assert.equal(invoiceHref({ kind: "intern", label: "021126-124" }), "/admin/intern-invoices?q=021126-124");
});
