import assert from "node:assert/strict";
import { test } from "node:test";

import { storedFromDraft, emptyDraft } from "./onboarding.ts";

test("a score typed with a percent sign is stored as the bare number", () => {
  const draft = { ...emptyDraft().academics, scoreType: "percentage" as const, cgpa: " 84.5% " };
  const out = storedFromDraft({ academics: draft }, null);
  assert.equal((out.extraPatch.academics as { score: string }).score, "84.5");
  const cgpa = storedFromDraft({ academics: { ...draft, scoreType: "cgpa", cgpa: "7.5%" } }, null);
  assert.equal((cgpa.extraPatch.academics as { score: string }).score, "7.5");
});
