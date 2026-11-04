import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// employer-pool.ts imports the db layer, which node:test can't load; check the source instead.
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("pool clauses require the activation fee (paid row, promo or mark-paid, legacy flag)", () => {
  const pool = src("./employer-pool.ts");
  assert.match(pool.slice(pool.indexOf("candidatePoolClauses")), /feePaidSql\(schema\.users\.id, schema\.internOnboarding\.extraData\)/);
  const helper = src("./fee-paid-sql.ts");
  assert.match(helper, /ip\.status = 'paid'/);
  assert.match(helper, /'payment'->>'isPaid'/);
});

test("admin directory reuses the shared fee helper", () => {
  assert.match(src("./admin/intern-query.ts"), /feePaidSql\(u\.id, o\.extraData\)/);
});
