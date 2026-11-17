import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source pins: a scheduled job must not nag an employer about, or spend on, a project Findtern took down
 * (employer reminders, spotlight, digest). Each project-scoped job joins the project and filters `taken_down_at IS NULL`;
 * the jobs that are not project-scoped are listed with the reason. No database runs here, so this pins the wiring.
 */
const LIB = join(import.meta.dirname, "..");
const src = readFileSync(join(LIB, "schedulers.ts"), "utf8");
const reminders = readFileSync(join(LIB, "payment-reminders-job.ts"), "utf8");

/** The body of one top-level async function in schedulers.ts. */
function body(name: string): string {
  const start = src.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = src.indexOf("\nasync function ", start + 10);
  const nextFn = src.indexOf("\nfunction ", start + 10);
  const ends = [next, nextFn].filter((n) => n > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

const PROJECT_SCOPED = ["interviewReminders", "cartInactivity", "weeklyHireTip", "talentSpotlight", "feedbackRequests"];
for (const job of PROJECT_SCOPED) {
  test(`${job} leaves out a taken-down project`, () => {
    assert.match(body(job), /schema\.projects\.takenDownAt/, `${job} must filter on projects.takenDownAt`);
    assert.match(body(job), /isNull\(schema\.projects\.takenDownAt\)/);
  });
}

test("payment reminders skip a hire whose project is taken down (the employer cannot pay it while it is down)", () => {
  assert.match(reminders, /takenDownAt/);
});

const NOT_PROJECT_SCOPED: Record<string, string> = {
  monthlyProfileViews: "goes to interns about profile views, not about a project",
  internProfileNudges: "intern profile completion",
  employerProfileNudges: "company profile completion, not a project",
};
for (const [job, why] of Object.entries(NOT_PROJECT_SCOPED)) {
  test(`${job} is not project-scoped (${why}) and stays unchanged`, () => {
    assert.doesNotMatch(body(job), /takenDownAt/);
  });
}
