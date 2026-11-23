import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";

import { isNewestOnboarding } from "./onboarding-newest.ts";

const text = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const dialect = new PgDialect();

test("the join condition picks the newest onboarding row of the user, on the table or an alias", () => {
  const own = dialect.sqlToQuery(isNewestOnboarding()).sql;
  assert.match(own, /"intern_onboarding"\."id" = \(SELECT "n"\."id" FROM "intern_onboarding" "n" WHERE "n"\."user_id" = "intern_onboarding"\."user_id" ORDER BY "n"\."created_at" DESC NULLS LAST, "n"\."id" DESC LIMIT 1\)/);
  assert.match(dialect.sqlToQuery(isNewestOnboarding("o")).sql, /^"o"\."id" = .*"n"\."user_id" = "o"\."user_id"/);
});

test("every reader that counts students joins only the newest onboarding row", () => {
  for (const f of [
    "./college/scope.ts", "./college/master-data.ts", "./admin/intern-query.ts", "./admin/queue-counts.ts", "./admin/dashboard-queues.ts",
    "./admin/analytics-load.ts", "./admin/ai-link-queue-load.ts", "./admin/reports/overview-load.ts",
    "../app/admin/reports/_tabs/overview/platform-summary.tsx", "../app/api/admin/ai-reports/match/route.ts",
  ]) assert.match(text(f), /isNewestOnboarding\(/, f);
});

test("master data starts from the students, so one without an onboarding row still counts", () => {
  const src = text("./college/master-data.ts");
  assert.match(src, /FROM \$\{schema\.users\} u\s+LEFT JOIN \$\{o\} ON/);
  assert.doesNotMatch(src, /FROM \$\{o\}\s/);
});
