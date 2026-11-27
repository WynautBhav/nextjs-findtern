import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The database keeps timestamps as UTC with no zone marker. A raw `sql<Date>` aggregate skips Drizzle's column mapper, so
 * the driver reads the text in the SERVER's zone: right on a UTC host, hours off anywhere else (the employer Schedule
 * showed "Reminder sent 9:34 am" for a 3:04 pm IST send). `.mapWith(<the timestamp column>)` makes it zone-proof.
 */
const AGGREGATES: [string, RegExp][] = [
  ["src/app/employer/schedule/page.tsx", /max\(\$\{schema\.notifications\.createdAt\}\)`\.mapWith\(schema\.notifications\.createdAt\)/],
  ["src/lib/admin/expired-load.ts", /max\(\$\{a\.createdAt\}\)`\.mapWith\(a\.createdAt\)/],
];
for (const [file, rule] of AGGREGATES) {
  test(`${file}: max(created_at) is mapped through its column`, () => assert.match(readFileSync(file, "utf8"), rule));
}
