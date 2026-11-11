import test from "node:test";
import assert from "node:assert/strict";

import { pendingClaimFor } from "./claim.ts";
import { deriveDriveCode } from "./code-derive.ts";

const SECRET = "s".repeat(40);

test("a matched student gets their own derived code and college, found by account not by typing", async () => {
  let sql = "";
  let params: unknown[] = [];
  const db = {
    async query(s: string, p: unknown[]) {
      sql = s;
      params = p;
      return { rows: [{ code_id: "code-1", college_name: "Jecrc University" }] };
    },
  };
  const claim = await pendingClaimFor(db, "intern-1", SECRET);
  assert.deepEqual(claim, { code: deriveDriveCode("code-1", SECRET), collegeName: "Jecrc University" });
  assert.deepEqual(params, ["intern-1"]);
  // Only an unused, unexpired code on a paid order counts.
  assert.match(sql, /k\.status = 'issued'/);
  assert.match(sql, /k\.valid_until > now\(\)/);
  assert.match(sql, /o\.status = 'paid'/);
});

test("nothing to accept when the sheet never matched this student", async () => {
  assert.equal(await pendingClaimFor({ query: async () => ({ rows: [] }) }, "intern-2", SECRET), null);
});
