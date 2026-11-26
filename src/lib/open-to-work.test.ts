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
  const on = openToWorkPatch(true, { openToWork: false, hiddenAt: "2025-01-01T00:00:00.000Z" });
  assert.equal(on.openToWork, true);
  assert.equal(on.hiddenAt, null);
});

// Bug sheet 26 Nov: a "Turn on Open to work" nudge can only be judged if the switch-on time is kept.
test("switching on stamps when (openToWorkAt); an already-on profile keeps its stamp", () => {
  const on = openToWorkPatch(true, { openToWork: false, hiddenAt: "2025-01-01T00:00:00.000Z" });
  assert.equal(typeof on.openToWorkAt, "string");
  assert.ok(Math.abs(Date.parse(on.openToWorkAt as string) - Date.now()) < 5000);
  assert.deepEqual(openToWorkPatch(true, { openToWork: true, openToWorkAt: "2026-11-01T00:00:00.000Z" }), { openToWork: true, hiddenAt: null });
});

test("a profile staff hid cannot be switched back on by the intern", () => {
  assert.deepEqual(openToWorkPatch(true, { openToWork: false, hiddenByAdmin: true, hiddenAt: "2026-10-01T00:00:00.000Z" }), {});
});
