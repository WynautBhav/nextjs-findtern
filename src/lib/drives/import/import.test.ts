import test from "node:test";
import assert from "node:assert/strict";
import { suggestedMapping, detectHeaderRow } from "./headers.ts";
import { normaliseEmail, normalisePhoneE164, nameKey } from "./normalize.ts";
import { validateRows } from "./validate.ts";
import { matchEntry, type CandidateUser } from "./match.ts";
import { planConfirm } from "./plan.ts";
import { fileSha256 } from "./hash.ts";
import { readRosterRows } from "./read.ts";

test("header synonyms", () => {
  assert.deepEqual(suggestedMapping(["Sr", "Student Name", "Official Email", "Mobile"]), { name: 1, email: 2, phone: 3 });
  assert.equal(detectHeaderRow([["Title"], ["Full Name", "College Email"]]), 1);
});

test("messy phones", () => {
  for (const p of ["98765 43210", "+91-98765-43210", "09876543210", "919876543210", "(98765) 43210"]) assert.equal(normalisePhoneE164(p), "+919876543210", p);
  for (const p of ["12345", "+14155550123", "5876543210", "abc", ""]) assert.equal(normalisePhoneE164(p), null, p);
});

test("emails", () => {
  assert.equal(normaliseEmail("  A.B@Uni.EDU "), "a.b@uni.edu");
  for (const e of ["n/a", "a@b", "a b@c.com", "a@@c.com", ""]) assert.equal(normaliseEmail(e), null, e);
});

test("duplicates and over-allocation in file order", () => {
  const m = { name: 0, email: 1 };
  const rows = validateRows([["A", "a@u.edu"], ["B", "A@u.edu"], ["C", "c@u.edu"], ["D", "d@u.edu"], ["E", "bad"]], m, 2);
  assert.deepEqual(rows.map((r) => r.state), ["valid", "duplicate", "valid", "over_allocation", "invalid"]);
});

const users: CandidateUser[] = [
  { id: "u1", email: "a@u.edu", emailVerified: true, name: "Ána Rao", phone: "+919876543210" },
  { id: "u2", email: "b@u.edu", emailVerified: false, name: "Bob", phone: null },
];
test("verified email links; unverified never", () => {
  assert.deepEqual(matchEntry({ email: "A@u.edu", phone: null, name: "x" }, users), { kind: "email_exact", candidates: ["u1"] });
  assert.equal(matchEntry({ email: "b@u.edu", phone: null, name: "Bob" }, users).kind, "none");
});
test("phone+name is suggestion only", () => {
  const r = matchEntry({ email: "z@u.edu", phone: "+919876543210", name: " ana  RAO" }, users);
  assert.equal(nameKey("Ána"), "ana");
  assert.equal(r.kind, "phone_name_suggestion");
  const plan = planConfirm([{ rowNo: 1, email: "z@u.edu", state: "valid", match: r }]);
  assert.deepEqual(plan.link, []);
  assert.equal(plan.reviews.length, 1);
});
test("ambiguous never picked", () => {
  const dup = [...users, { ...users[0], id: "u3" }];
  const r = matchEntry({ email: "a@u.edu", phone: null, name: "x" }, dup);
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(planConfirm([{ rowNo: 1, email: "a@u.edu", state: "valid", match: r }]).link, []);
});
test("planConfirm idempotent", () => {
  const e = [{ rowNo: 2, email: "a@u.edu", state: "valid" as const, match: { kind: "email_exact" as const, candidates: ["u1"] } }];
  assert.deepEqual(planConfirm(e), planConfirm(e));
  assert.deepEqual(planConfirm([{ ...e[0], internId: "u1" }]).link, []);
});

test("CSV with BOM and quoted commas; hash stable", () => {
  const bytes = new TextEncoder().encode('\uFEFFName,College Email,Phone\n"Rao, Ana",ana@u.edu,98765 43210\n');
  const rows = readRosterRows(bytes);
  assert.equal(rows[1][0], "Rao, Ana");
  assert.deepEqual(suggestedMapping(rows[0]), { name: 0, email: 1, phone: 2 });
  assert.equal(fileSha256(bytes), fileSha256(new Uint8Array(bytes)));
  assert.match(fileSha256(bytes), /^[0-9a-f]{64}$/);
});
