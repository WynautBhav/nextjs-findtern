import assert from "node:assert/strict";
import { test } from "node:test";

import { initialsOf, PERSON_TINTS, personTint } from "./person-tint.ts";

test("a person keeps the same tint every time", () => {
  assert.equal(personTint("u_123"), personTint("u_123"));
  assert.equal(personTint(42), personTint("42"));
});

test("tints stay within 1..6", () => {
  for (let i = 0; i < 500; i++) {
    const t = personTint(`user-${i}`);
    assert.ok(t >= 1 && t <= PERSON_TINTS, `tint ${t}`);
  }
});

test("sequential ids spread over every tint", () => {
  const seen = new Set<number>();
  for (let i = 1; i <= 60; i++) seen.add(personTint(i));
  assert.equal(seen.size, PERSON_TINTS);
});

test("a missing key still returns a valid tint", () => {
  assert.ok(personTint(null) >= 1);
  assert.ok(personTint(undefined) <= PERSON_TINTS);
});

test("initials", () => {
  assert.equal(initialsOf("Ritika Verma"), "RV");
  assert.equal(initialsOf("  priya  kumar sharma "), "PK");
  assert.equal(initialsOf("Madonna"), "M");
  assert.equal(initialsOf(""), "?");
  assert.equal(initialsOf(null), "?");
});

test("initials use letters only and fall back to ?", () => {
  assert.equal(initialsOf("<b>Bob</b> Lee"), "BL");
  assert.equal(initialsOf("<< >>"), "?");
});
