import assert from "node:assert/strict";
import { test } from "node:test";

import { completeProfileFields } from "../../e2e/lib/profile-complete.mjs";
import { hireGateDecision } from "./hire-gate.ts";

// The e2e fixture must satisfy the real gate (not a weakened copy of it), and must differ per user (unique Aadhaar/PAN indexes).
const asRow = (f: ReturnType<typeof completeProfileFields>) => ({
  city: f.city, state: f.state, pinCode: f.pinCode, skills: f.skills, locationTypes: f.locationTypes, preferredLocations: [],
  hasLaptop: f.hasLaptop, aadhaarNumber: f.aadhaarNumber, panNumber: f.panNumber, extraData: f.extra,
});
const docs = { hasPhoto: true, hasPanImage: true, hasAadhaarImage: true };

test("the e2e completeness fixture passes the hire gate; without its documents it does not", () => {
  const f = completeProfileFields("0f4c1c2e-aaaa-bbbb-cccc-1234567890ab");
  assert.deepEqual(hireGateDecision(asRow(f), docs), { ok: true });
  assert.equal(hireGateDecision(asRow(f), { ...docs, hasPhoto: false }).ok, false);
  assert.equal(hireGateDecision({ ...asRow(f), extraData: { ...f.extra, profileSubmittedAt: undefined } }, docs).ok, false);
});

test("the fixture's Aadhaar and PAN are distinct per user", () => {
  const a = completeProfileFields("11111111-1111-1111-1111-111111111111");
  const b = completeProfileFields("22222222-2222-2222-2222-222222222222");
  assert.notEqual(a.aadhaarNumber, b.aadhaarNumber);
  assert.notEqual(a.panNumber, b.panNumber);
});
