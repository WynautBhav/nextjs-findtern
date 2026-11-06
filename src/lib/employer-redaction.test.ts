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

test("initialsOf ignores symbols and falls back to ?", () => {
  assert.equal(initialsOf("<", "<"), "?");
  assert.equal(initialsOf("<Meera", "Pillai"), "MP");
});

test("a locked candidate shows initials only, never a code or the name", () => {
  assert.equal(displayNameOf({ id: "6f1c2a9e-1111-4222-8333-444455556666", fullName: "Priya H", initials: "PH" }, false), "PH");
});

test("unlocked shows the full name only, never the code", () => {
  assert.equal(displayNameOf({ id: "abc", fullName: "Priya H", initials: "PH" }, true), "Priya H");
});
