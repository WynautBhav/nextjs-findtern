import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { accountViews, activeAccountSql, isActiveAccount, statusFilterSql } from "./account-views.ts";

const render = (s: ReturnType<typeof sql>) => new PgDialect().sqlToQuery(s).sql;

test("Everyone is the sum of the type tabs the viewer can see", () => {
  const byKind = { intern: 138, employer: 18, admin: 2 };
  const all = accountViews(byKind, true);
  assert.deepEqual(all.map((v) => v.label), ["Everyone", "Candidates", "Companies", "Staff"]);
  assert.equal(all[0].count, 158);
  assert.equal(all.slice(1).reduce((n, v) => n + v.count, 0), all[0].count);
});

test("without roles:write there is no Staff tab and Everyone leaves staff out", () => {
  const views = accountViews({ intern: 138, employer: 18, admin: 2 }, false);
  assert.deepEqual(views.map((v) => v.label), ["Everyone", "Candidates", "Companies"]);
  assert.equal(views[0].count, 156);
});

test("a NULL is_active is NOT active: the same answer the session check gives (it refuses the account)", () => {
  assert.equal(isActiveAccount(true), true);
  assert.equal(isActiveAccount(false), false);
  assert.equal(isActiveAccount(null), false);
  assert.equal(isActiveAccount(undefined), false);
});

test("the SQL flag is coalesced to false, so Active + Inactive always add up to the unfiltered total", () => {
  assert.match(render(activeAccountSql(sql`u.is_active`)), /coalesce\(u\.is_active, false\)/);
  assert.equal(statusFilterSql("bogus"), null);
  assert.match(render(statusFilterSql("active")!), /^\s*is_active\s*$/);
  assert.match(render(statusFilterSql("inactive")!), /not is_active/i);
});
