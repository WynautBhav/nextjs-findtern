import assert from "node:assert/strict";
import { test } from "node:test";

import { accountViews } from "./account-views.ts";

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
