import { test } from "node:test";
import assert from "node:assert/strict";

import { latestActivityAt, telHref } from "./record-activity-format.ts";
import type { ActivityEntry } from "./record-activity.types.ts";

const entry = (id: string, at: string): ActivityEntry => ({ id, at, kind: "signup", actor: null, verb: "joined" });

test("telHref joins country code and number, digits only", () => {
  assert.equal(telHref("+91", "98765 43210"), "tel:+919876543210");
  assert.equal(telHref("91", "(987) 654-3210"), "tel:+919876543210");
});

test("telHref keeps a number that already has a plus and drops a leading zero", () => {
  assert.equal(telHref("+91", "+44 20 7946 0958"), "tel:+442079460958");
  assert.equal(telHref("+91", "09876543210"), "tel:+919876543210");
});

test("telHref is null without digits and does not invent a country code", () => {
  assert.equal(telHref("+91", ""), null);
  assert.equal(telHref("+91", null), null);
  assert.equal(telHref("+91", "n/a"), null);
  assert.equal(telHref("", "9876543210"), "tel:9876543210");
});

test("latestActivityAt returns the newest time, ignoring bad dates", () => {
  assert.equal(latestActivityAt([entry("a", "2026-10-01T10:00:00Z"), entry("b", "2026-11-02T08:00:00Z"), entry("c", "nope")]), "2026-11-02T08:00:00Z");
  assert.equal(latestActivityAt([]), null);
  assert.equal(latestActivityAt(null), null);
});
