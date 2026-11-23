import assert from "node:assert/strict";
import { test } from "node:test";

import { drivePastDateProblem } from "./drive-input.ts";

const now = new Date("2026-11-23T12:00:00Z");
const at = (iso: string) => new Date(iso);

test("a new drive can't open in the past (owner, 23 Nov: drive links could be backdated)", () => {
  assert.equal(drivePastDateProblem({ startsAt: at("2026-11-20T04:00:00Z"), endsAt: at("2026-11-30T04:00:00Z") }, { now })?.path, "startsAt");
  assert.equal(drivePastDateProblem({ startsAt: at("2026-11-24T04:00:00Z"), endsAt: at("2026-11-30T04:00:00Z") }, { now }), null);
});

test("a start picked a few minutes ago is fine; the close must be ahead", () => {
  assert.equal(drivePastDateProblem({ startsAt: at("2026-11-23T11:55:00Z"), endsAt: at("2026-11-30T04:00:00Z") }, { now }), null);
  assert.equal(drivePastDateProblem({ startsAt: at("2026-11-23T12:00:00Z"), endsAt: at("2026-11-23T11:00:00Z") }, { now })?.path, "endsAt");
});

test("editing a live drive keeps its own past start, but can't move the start to another past time", () => {
  const saved = at("2026-11-20T04:00:00Z");
  assert.equal(drivePastDateProblem({ startsAt: saved, endsAt: at("2026-11-30T04:00:00Z") }, { now, savedStartsAt: saved }), null);
  assert.equal(drivePastDateProblem({ startsAt: at("2026-11-19T04:00:00Z"), endsAt: at("2026-11-30T04:00:00Z") }, { now, savedStartsAt: saved })?.path, "startsAt");
});

test("both drive routes apply the rule", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/app/api/college/drives/route.ts", "src/app/api/college/drives/[id]/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /drivePastDateProblem\(parsed\.data/, f);
  }
});
