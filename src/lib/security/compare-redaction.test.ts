// The compare page hands candidate objects to many children; none may ever receive the unredacted profile.
// A static guard (the page needs a database): the only assignment of `candidates` goes through redactForEmployer,
// and the page never reads contact fields. The redaction itself is covered in employer-candidates.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const page = readFileSync(join(process.cwd(), "src/app/employer/compare/page.tsx"), "utf8");

test("compare/page.tsx: candidates are the redacted profiles", () => {
  assert.match(page, /import \{[^}]*\bredactForEmployer\b[^}]*\} from "@\/lib\/employer-candidates"/);
  assert.match(page, /candidates = profiles\.map\(\(p\) => redactForEmployer\(p, nameUnlocked\.has\(p\.id\)\)\)/);
  assert.equal((page.match(/\bcandidates = /g) ?? []).length, 1, "one assignment of candidates");
  // The raw profiles stay inside the block that builds them (declared, mapped to updated-at, mapped to redacted); only the updated-at map escapes.
  assert.equal((page.match(/\bprofiles\b/g) ?? []).length, 3, "profiles is not used outside the redacting block");
});

test("compare/page.tsx never reads contact fields off a candidate", () => {
  assert.doesNotMatch(page, /\bc\.(email|linkedinUrl|aiRecordingLink)\b/);
});

test("redactForEmployer strips contact fields, and the name until hire", async () => {
  const { redactForEmployer, toCandidateProfile } = await import("../employer-candidates.ts");
  const profile = toCandidateProfile({ id: "u1", firstName: "Asha", lastName: "Rao", email: "asha@example.com" } as never, null);
  const hidden = redactForEmployer(profile, false);
  assert.equal(hidden.email, "");
  assert.equal(hidden.fullName, "");
  const hired = redactForEmployer(profile, true);
  assert.equal(hired.email, "");
  assert.equal(hired.fullName, "Asha Rao");
});
