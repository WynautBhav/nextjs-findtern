import { test } from "node:test";
import assert from "node:assert/strict";

import { hasMarksheet, openStepOf, readinessFrom } from "./student-readiness.ts";

const base = { inPool: true, profileVisibility: "live", isActive: true, frozen: false, openToWork: true, hiddenByAdmin: false, interviewed: true, hireable: true, submitted: true, openStep: null, marksheet: true };

test("in the pool and complete: seen and hireable, no lines", () => {
  assert.deepEqual(readinessFrom(base), { seen: true, seenWhy: "", hireable: true, hireWhy: "", paused: false, marksheet: true });
});

test("the pool decides seen; an incomplete profile only blocks the hire, by step name", () => {
  const r = readinessFrom({ ...base, hireable: false, openStep: 0 });
  assert.equal(r.seen, true);
  assert.equal(r.hireWhy, "Profile incomplete: About me is not finished.");
  assert.doesNotMatch(r.hireWhy, /aadhaar|pan|bank|emergency/i);
  assert.equal(readinessFrom({ ...base, hireable: false, submitted: false }).hireWhy, "Profile not submitted yet.");
});

test("out of the pool: a Findtern hide or freeze reads as paused, without the reason", () => {
  for (const o of [{ frozen: true }, { isActive: false }, { profileVisibility: "hidden" }, { hiddenByAdmin: true, openToWork: false }]) {
    const r = readinessFrom({ ...base, inPool: false, ...o });
    assert.equal(r.seen, false);
    assert.equal(r.seenWhy, "Paused by Findtern. Contact Findtern for details.");
  }
  assert.equal(readinessFrom({ ...base, frozen: true }).paused, true);
});

test("out of the pool for the student's own reasons, then Findtern's checks (never the fee)", () => {
  const out = { ...base, inPool: false };
  assert.equal(readinessFrom({ ...out, openToWork: false }).seenWhy, "The student turned off Open to work.");
  assert.equal(readinessFrom({ ...out, interviewed: false }).seenWhy, "The AI interview is not done yet.");
  assert.equal(readinessFrom(out).seenWhy, "Waiting on Findtern's checks.");
  assert.doesNotMatch(readinessFrom(out).seenWhy, /fee|paid|₹/i);
});

test("no onboarding row means About me is open", () => {
  assert.deepEqual(openStepOf(null, { hasPhoto: false, hasPanImage: false, hasAadhaarImage: false }), { submitted: false, openStep: 0 });
});

test("marksheet flag reads only that a file exists", () => {
  assert.equal(hasMarksheet({ academics: { marksheetUploads: [{ name: "k/1.pdf" }] } }), true);
  assert.equal(hasMarksheet({ academics: { marksheetUploads: [] } }), false);
  assert.equal(hasMarksheet(null), false);
});
