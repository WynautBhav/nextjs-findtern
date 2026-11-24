import assert from "node:assert/strict";
import test from "node:test";

import { driveReach } from "./drive-reach.ts";

test("drive reach: strength = seen + every reason, one reason each; the five named reasons always listed", () => {
  const students = [
    { userId: "a", status: "verified" },
    { userId: "b", status: "verified" },
    { userId: "c", status: "verified" },
    { userId: "d", status: "verified" },
    { userId: "e", status: "pending" },
    { userId: "f", status: "verified" },
  ];
  const readiness = new Map([
    ["a", { seen: true, hidden: null }],
    ["b", { seen: false, hidden: "open_to_work" as const }],
    ["c", { seen: false, hidden: "interview" as const }],
    ["d", { seen: false, hidden: "paused" as const }],
    // e is not verified by the college: counted there even if Findtern would show them.
    ["e", { seen: true, hidden: null }],
    // f has no readiness row at all: profile not started.
  ]);
  const r = driveReach(students, readiness);
  assert.equal(r.strength, 6);
  assert.equal(r.seen, 1);
  assert.equal(r.out, 5);
  assert.equal(r.buckets.reduce((n, b) => n + b.ids.length, 0), r.out);
  const ids = Object.fromEntries(r.buckets.map((b) => [b.id, b.ids]));
  assert.deepEqual(ids, { checks: [], rejected: [], profile: ["f"], interview: ["c"], open_to_work: ["b"], paused: ["d"], unverified: ["e"] });
  assert.deepEqual(r.buckets.map((b) => b.label), ["Waiting for Findtern's check", "Rejected by Findtern", "Profile not complete", "AI interview not done", "Open to work turned off", "Paused by Findtern", "Waiting for your approval"]);
});

test("drive reach: nobody out still lists the five reasons at zero, and no paused/unapproved rows", () => {
  const r = driveReach([{ userId: "a", status: "verified" }], new Map([["a", { seen: true, hidden: null }]]));
  assert.equal(r.out, 0);
  assert.deepEqual(r.buckets.map((b) => b.id), ["checks", "rejected", "profile", "interview", "open_to_work"]);
});
