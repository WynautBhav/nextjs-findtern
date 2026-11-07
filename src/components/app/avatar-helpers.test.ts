import test from "node:test";
import assert from "node:assert/strict";
import { avatarTint, avatarLabel, AVATAR_TINTS } from "./avatar-helpers.ts";

test("avatarTint is deterministic and from the token list", () => {
  assert.equal(avatarTint("GV"), avatarTint("GV"));
  assert.ok((AVATAR_TINTS as readonly string[]).includes(avatarTint("SM")));
  assert.ok((AVATAR_TINTS as readonly string[]).includes(avatarTint("")));
});
test("avatarLabel masks", () => {
  assert.equal(avatarLabel({ initials: "GV", masked: true }), "Candidate GV (identity hidden until you hire)");
  assert.equal(avatarLabel({ name: "Asha Rao" }), "Asha Rao");
});
