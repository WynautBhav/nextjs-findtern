import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ESCALATION_FIELDS, REQUIRED_COMPANY_FIELDS, isPersonalEmail, missingCompanyFields, missingProfileFields } from "./employer-onboarding.ts";
import { COMPANY_KEYS } from "../components/employer/onboarding/draft.ts";

test("employers cannot register with a free-mail address, subdomains and regional aliases included", () => {
  for (const e of ["a@gmail.com", "a@mail.yahoo.co.in", "a@outlook.de", "a@pm.me", "a@googlemail.com", " A@Live.com ", "a@x.msn.com"]) {
    assert.equal(isPersonalEmail(e), true, e);
  }
});

test("employers can register with a company or college-style domain", () => {
  for (const e of ["a@acme.in", "a@acme.ac.in", "a@acme.com", "no-at-sign", "", "a@"]) {
    assert.equal(isPersonalEmail(e), false, e);
  }
});

const FULL = Object.fromEntries([...REQUIRED_COMPANY_FIELDS, ...ESCALATION_FIELDS].map(([k]) => [k, "x"]));

test("escalation contact is required on the profile but not part of the setup gate (B-57)", () => {
  const legacy: Record<string, string | null | undefined> = { ...FULL, escalationContactName: "", escalationContactRole: null, escalationContactEmail: " ", escalationContactPhone: undefined };
  assert.deepEqual(missingCompanyFields(legacy), []);
  assert.deepEqual(
    missingProfileFields(legacy),
    ESCALATION_FIELDS.map(([, label]) => label),
  );
  assert.deepEqual(missingProfileFields(FULL), []);
});

test("the form, the API and the draft all require every escalation field", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const api = read("../app/api/employer/[id]/route.ts");
  const stageValidation = read("../components/employer/onboarding/validation.ts");
  const profileForm = read("../components/employer/company-profile-form.tsx");
  for (const [key] of ESCALATION_FIELDS) {
    assert.match(api, new RegExp(`${key}: requiredText\\(`), `API requires ${key}`);
    assert.ok((COMPANY_KEYS as readonly string[]).includes(key), `draft keeps ${key}`);
  }
  // The profile form loops ESCALATION_FIELDS; the onboarding stage names each field.
  assert.match(profileForm, /of ESCALATION_FIELDS/);
  for (const key of ["escalationContactName", "escalationContactRole", "escalationContactEmail", "escalationContactPhone"]) {
    assert.match(stageValidation, new RegExp(`errors\\.${key} = `), `stage validation requires ${key}`);
  }
});
