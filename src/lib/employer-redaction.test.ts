import test from "node:test";
import assert from "node:assert/strict";

import { displayNameOf, initialsOf } from "./employer-candidates.ts";

test("initialsOf takes first letters of first and last name", () => {
  assert.equal(initialsOf("Meera", "Pillai"), "MP");
  assert.equal(initialsOf("  sana ", " kapoor "), "SK");
});

test("initialsOf falls back to second letter of a single name", () => {
  // Mirrors the legacy getInitialsFromName rule: "Aarav" -> "AA".
  assert.equal(initialsOf("Aarav", ""), "AA");
});

test("initialsOf yields ? when there is nothing to work with", () => {
  assert.equal(initialsOf("", ""), "?");
});

test("displayNameOf redacts to initials while locked", () => {
  assert.equal(
    displayNameOf({ fullName: "Meera Pillai", initials: "MP" }, false),
    "MP",
  );
});

test("displayNameOf reveals the full name once hired", () => {
  assert.equal(
    displayNameOf({ fullName: "Meera Pillai", initials: "MP" }, true),
    "Meera Pillai",
  );
});

test("displayNameOf never renders a bare ? or blank", () => {
  assert.equal(displayNameOf({ fullName: "Meera Pillai", initials: "?" }, false), "Candidate");
  assert.equal(displayNameOf({ fullName: "", initials: "?" }, true), "Intern");
});
