import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SKILLS, legacyOverLimit, normalizeSkills, validateSkills } from "./skills-limit.ts";
import { pickOverLimit } from "./admin/skills-over-limit.ts";
import { draftFromRecord, emptyDraft, storedFromDraft } from "./onboarding.ts";
import { tpoProfile } from "./college/serialize.ts";

const n = (k: number) => Array.from({ length: k }, (_, i) => `S${i}`);

test("normalise trims, dedupes case-insensitively, drops empties, caps length", () => {
  assert.deepEqual(normalizeSkills([" React ", "react", "", "  ", "Sql"]), ["React", "Sql"]);
  assert.equal(normalizeSkills(["x".repeat(100)])[0].length, 40);
});

test("7 ok, 8 rejected", () => {
  assert.equal(MAX_SKILLS, 7);
  assert.equal(validateSkills(n(7)).ok, true);
  assert.equal(validateSkills(n(8)).ok, false);
});

test("legacy over-limit lists: unchanged ok, swap rejected, grow rejected, reduce ok", () => {
  const legacy = n(9);
  assert.equal(legacyOverLimit(legacy), true);
  const same = validateSkills([...legacy].reverse(), legacy);
  assert.ok(same.ok && same.skills.length === 9);
  assert.equal(validateSkills([...n(8), "New"], legacy).ok, false);
  assert.equal(validateSkills([...legacy, "More"], legacy).ok, false);
  assert.equal(validateSkills(n(7), legacy).ok, true);
});

test("admin report picks only over-limit rows", () => {
  const rows = [{ userId: "a", skills: n(9).map((name) => ({ name })) }, { userId: "b", skills: n(7) }];
  assert.deepEqual(pickOverLimit(rows).map((r) => [r.userId, r.count]), [["a", 9]]);
});

test("bio is not part of the draft, and onboarding does not persist it", () => {
  const draft = draftFromRecord({ bio: "secret" } as never);
  assert.equal("bio" in draft, false);
  assert.equal("bio" in emptyDraft(), false);
  const stored = storedFromDraft({ bio: "x", skills: ["A"] } as never, null);
  assert.equal(JSON.stringify(stored).includes("bio"), false);
});

test("employer/college serializers expose no bio key", () => {
  const view = tpoProfile("verified", { bio: "secret", city: "Jaipur", skills: ["A"] } as never, "1");
  assert.equal(JSON.stringify(view ?? {}).includes("bio"), false);
});
