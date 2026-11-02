import assert from "node:assert/strict";
import test from "node:test";

import { openToWorkPatch } from "./open-to-work.ts";

test("switching off stamps when, and keeps the first stamp on repeat saves", () => {
  const first = openToWorkPatch(false, { openToWork: true });
  assert.equal(first.openToWork, false);
  assert.equal(typeof first.hiddenAt, "string");
  const again = openToWorkPatch(false, { openToWork: false, hiddenAt: "2026-10-01T00:00:00.000Z" });
  assert.equal(again.hiddenAt, "2026-10-01T00:00:00.000Z");
});

test("switching on clears the stamp, however long the profile was hidden", () => {
  assert.deepEqual(openToWorkPatch(true, { openToWork: false, hiddenAt: "2025-01-01T00:00:00.000Z" }), { openToWork: true, hiddenAt: null });
});

test("a profile staff hid cannot be switched back on by the intern", () => {
  assert.deepEqual(openToWorkPatch(true, { openToWork: false, hiddenByAdmin: true, hiddenAt: "2026-10-01T00:00:00.000Z" }), {});
});
