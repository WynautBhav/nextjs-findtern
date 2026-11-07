import assert from "node:assert/strict";
import test from "node:test";

import { deriveDriveCode, hashDriveCode } from "./code-derive.ts";

const SECRET = "x".repeat(40);

test("a derived code is stable, formatted and hashes the same however it is typed", () => {
  const a = deriveDriveCode("id-1", SECRET);
  assert.equal(a, deriveDriveCode("id-1", SECRET));
  assert.match(a, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal(hashDriveCode(a, SECRET), hashDriveCode(a.toLowerCase().replace(/-/g, " "), SECRET));
});

test("different ids or secrets give different codes; a short secret is refused", () => {
  assert.notEqual(deriveDriveCode("id-1", SECRET), deriveDriveCode("id-2", SECRET));
  assert.notEqual(deriveDriveCode("id-1", SECRET), deriveDriveCode("id-1", "y".repeat(40)));
  assert.throws(() => deriveDriveCode("id-1", "short"));
  assert.notEqual(hashDriveCode("ABCD-EFGH-JKMN", SECRET), hashDriveCode("ABCD-EFGH-JKMN", "y".repeat(40)));
  assert.throws(() => hashDriveCode("ABCD-EFGH-JKMN", "short"));
});
