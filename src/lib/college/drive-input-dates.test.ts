import assert from "node:assert/strict";
import test from "node:test";

import { driveInput } from "./drive-input.ts";

const base = { title: "Campus drive", kind: "internship", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-10T00:00:00Z" };

test("an ordinary drive window parses", () => {
  assert.equal(driveInput.safeParse(base).success, true);
});

test("dates outside 2000-2100 are rejected, not sent to Postgres", () => {
  for (const startsAt of ["-271821-04-20T00:00:00Z", "1999-12-31T00:00:00Z", "+275000-01-01T00:00:00Z"]) {
    assert.equal(driveInput.safeParse({ ...base, startsAt, endsAt: "+275000-02-01T00:00:00Z" }).success, false, startsAt);
  }
  assert.equal(driveInput.safeParse({ ...base, endsAt: "2101-01-01T00:00:00Z" }).success, false);
});
