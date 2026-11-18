import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// A cron path with no route file makes the Vercel deploy fail; catch the typo here instead.
const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

test("vercel.json: every cron path has an App Router route file", () => {
  const crons = config.crons ?? [];
  assert.ok(crons.length > 0);
  for (const { path } of crons) {
    assert.match(path, /^\/api\/cron\/[a-z0-9-]+$/, `unexpected cron path ${path}`);
    const route = join(root, "src/app", path, "route.ts");
    assert.ok(existsSync(route), `vercel.json cron ${path} has no ${route}`);
    assert.match(readFileSync(route, "utf8"), /export async function GET\b/, `${path} must export GET`);
  }
});

test("vercel.json: cron paths are unique and daily (Hobby-safe), except the hourly tick", () => {
  const crons = config.crons ?? [];
  assert.equal(new Set(crons.map((c) => c.path)).size, crons.length);
  for (const { path, schedule } of crons) {
    // /api/cron/tick carries the interview reminders (1 h before the call) and the daily jobs, so it runs hourly. Hourly crons need
    // a Vercel plan above Hobby; on Hobby change its schedule to a daily one (the 1 h reminder then needs the KVM timers).
    if (path === "/api/cron/tick") {
      assert.match(schedule, /^\d{1,2} \* \* \* \*$/, `${path}: ${schedule} is not hourly`);
      continue;
    }
    assert.match(schedule, /^\d{1,2} \d{1,2} \* \* \*$/, `${path}: ${schedule} is not a once-a-day schedule`);
  }
});
