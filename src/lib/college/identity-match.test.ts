import assert from "node:assert/strict";
import test from "node:test";

import {
  canSwitchBackToCollege,
  classifyTypedCode,
  collegeHomeState,
  collegePromoDecision,
  COLLEGE_PROMO_FAIL,
  driveEntryDecision,
  emailKey,
  nameTokens,
  namesMatch,
  phoneKey,
  rosterMatches,
  verifyIdentity,
  type RosterIdentity,
  type StudentIdentity,
} from "./identity-match.ts";

const roster: RosterIdentity = { name: "Rahul Sharma", email: "rahul.sharma@abc.edu", phone: "+919876543210" };
const student: StudentIdentity = { name: "Rahul Sharma", email: "Rahul.Sharma@ABC.edu ", emailVerified: true, phone: "9876543210", countryCode: "+91" };

// ── fields ──────────────────────────────────────────────────────────────────────────────────────────────────

test("email: trim and case fold; junk, two @ and no domain are null", () => {
  assert.equal(emailKey("  Rahul.Sharma@ABC.edu "), "rahul.sharma@abc.edu");
  for (const bad of ["", "na", "a@b", "a@@b.com", "a b@c.com", null, undefined, "x@y..com"]) assert.equal(emailKey(bad), null, String(bad));
});

test("phone: last 10 digits whatever the prefix, plus signs and punctuation", () => {
  for (const p of ["+91 98765-43210", "09876543210", "919876543210", "9876543210", "+91(98765)43210", "0091 9876543210", " 98765 43210 "]) {
    assert.equal(phoneKey(p), "9876543210", p);
  }
  assert.equal(phoneKey("12345"), null);
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey(null), null);
  assert.equal(phoneKey("abc"), null);
});

test("phone: a registered country code other than 91 never matches an Indian roster number", () => {
  assert.equal(phoneKey("9876543210", "+1"), null);
  assert.equal(phoneKey("9876543210", "+44"), null);
  assert.equal(phoneKey("9876543210", "+91"), "9876543210");
  assert.equal(phoneKey("9876543210", "91"), "9876543210");
  assert.equal(phoneKey("9876543210", ""), "9876543210");
});

test("name tokens: case, spacing, dots, commas, titles and initials", () => {
  assert.deepEqual(nameTokens("  Rahul   SHARMA "), ["rahul", "sharma"]);
  assert.deepEqual(nameTokens("Dr. Rahul K. Sharma"), ["rahul", "sharma"]);
  assert.deepEqual(nameTokens("Sharma, Rahul"), ["sharma", "rahul"]);
  assert.deepEqual(nameTokens("Rahul\u200b Sharma"), ["rahul", "sharma"]);
  assert.deepEqual(nameTokens(""), []);
  assert.deepEqual(nameTokens(null), []);
});

test("names: tolerated differences", () => {
  const same: [string, string][] = [
    ["Rahul Sharma", "rahul  sharma"],
    ["Rahul Sharma", "RAHUL SHARMA."],
    ["Rahul Sharma", "Sharma Rahul"],
    ["Rahul Sharma", "Sharma, Rahul"],
    ["Rahul Sharma", "Mr. Rahul Sharma"],
    ["Rahul Sharma", "Rahul Kumar Sharma"], // a middle name on one list only
    ["Rahul K Sharma", "Rahul Sharma"], // an initial on one list only
    ["José Núñez", "Jose Nunez"], // diacritics
    ["Ａnanya Ｒao", "Ananya Rao"], // full-width forms
    ["राहुल शर्मा", "राहुल  शर्मा"], // another script, spacing
    ["Anne-Marie O'Neil", "anne marie o neil"],
  ];
  for (const [a, b] of same) assert.ok(namesMatch(a, b), `${a} = ${b}`);
});

test("names: not tolerated (spelling, a different surname, one shared word, a one-word name against a longer one, empty)", () => {
  const diff: [string, string][] = [
    ["Rahul Sharma", "Rahull Sharma"],
    ["Rahul Sharma", "Rahul Verma"],
    ["Rahul Sharma", "Rahul"],
    ["Rahul Sharma", "Rohit Sharma"],
    ["Rahul Sharma", ""],
    ["", ""],
    ["Priya Singh", "Singh"],
    ["Rahul Sharma", "Rahul Kumar Verma"],
  ];
  for (const [a, b] of diff) assert.ok(!namesMatch(a, b), `${a} != ${b}`);
});

test("names: two different one-word names do not match; identical one-word names do (same words, any order)", () => {
  assert.ok(!namesMatch("Rahul", "Sharma"));
  assert.ok(namesMatch("Rahul", "rahul"));
  // a short name against a long one needs two words inside the long one
  assert.ok(!namesMatch("Sharma", "Rahul Kumar Sharma"));
});

// ── identity ─────────────────────────────────────────────────────────────────────────────────────────────────

test("identity: everything matches", () => {
  assert.deepEqual(verifyIdentity(roster, student), { ok: true });
});

test("identity: a wrong phone fails (red-green: this is the phone rule)", () => {
  const v = verifyIdentity(roster, { ...student, phone: "9876543211" });
  assert.deepEqual(v, { ok: false, failed: ["phone"] });
});

test("identity: a wrong email, a wrong name, an unverified email each fail on their own", () => {
  assert.deepEqual(verifyIdentity(roster, { ...student, email: "other@abc.edu" }), { ok: false, failed: ["email"] });
  assert.deepEqual(verifyIdentity(roster, { ...student, name: "Someone Else" }), { ok: false, failed: ["name"] });
  assert.deepEqual(verifyIdentity(roster, { ...student, emailVerified: false }), { ok: false, failed: ["email"] });
});

test("identity: a roster row with no phone is not asked for one; a roster row with an unreadable phone fails", () => {
  assert.deepEqual(verifyIdentity({ ...roster, phone: null }, { ...student, phone: "1" }), { ok: true });
  assert.deepEqual(verifyIdentity({ ...roster, phone: "" }, student), { ok: true });
  assert.deepEqual(verifyIdentity({ ...roster, phone: "12345" }, student), { ok: false, failed: ["phone"] });
});

test("identity: a student with no usable phone cannot match a roster phone", () => {
  assert.equal(verifyIdentity(roster, { ...student, phone: null }).ok, false);
  assert.equal(verifyIdentity(roster, { ...student, phone: "" }).ok, false);
  assert.equal(verifyIdentity(roster, { ...student, countryCode: "+44" }).ok, false);
});

test("identity: all three wrong reports all three, for the audit trail only", () => {
  const v = verifyIdentity(roster, { name: "Zed", email: "z@z.com", emailVerified: true, phone: "1111111111" });
  assert.deepEqual(v, { ok: false, failed: ["email", "phone", "name"] });
});

test("rosterMatches: any one entry is enough, none matching is a no", () => {
  const other: RosterIdentity = { name: "Other Person", email: "o@abc.edu", phone: null };
  assert.ok(rosterMatches([other, roster], student));
  assert.ok(!rosterMatches([other], student));
  assert.ok(!rosterMatches([], student));
});

// ── which code ───────────────────────────────────────────────────────────────────────────────────────────────

test("typed code: a drive code is recognised in any case, with spaces or dashes", () => {
  assert.deepEqual(classifyTypedCode("abcd-efgh-jkmn"), { kind: "drive", code: "ABCD-EFGH-JKMN" });
  assert.deepEqual(classifyTypedCode(" abcd efgh jkmn "), { kind: "drive", code: "ABCD-EFGH-JKMN" });
  assert.deepEqual(classifyTypedCode("ABCDEFGHJKMN"), { kind: "drive", code: "ABCD-EFGH-JKMN" });
});

test("typed code: anything else printable is the college's promo code, upper-cased without spaces", () => {
  assert.deepEqual(classifyTypedCode("tpo-abc 2026"), { kind: "promo", code: "TPO-ABC2026" });
  assert.deepEqual(classifyTypedCode("FT7K-Q3M8"), { kind: "promo", code: "FT7K-Q3M8" });
});

test("typed code: empty, tiny, long, control characters and non-strings are refused without a lookup", () => {
  for (const bad of ["", "   ", "abc", "x".repeat(41), "AB\u0000CD", "AB\nCD", "AB\u200bCD", 5, null, undefined, {}]) assert.equal(classifyTypedCode(bad), null, String(bad));
});

// ── decisions ────────────────────────────────────────────────────────────────────────────────────────────────

const quoteOk = { ok: true as const, promoCollegeId: "c1", payableMinor: 0 };
const decide = (over: Partial<Parameters<typeof collegePromoDecision>[0]> = {}) =>
  collegePromoDecision({ hasAdultConsent: true, quote: quoteOk, membershipCollegeId: "c1", entries: [roster], student, ...over });

test("promo decision: the happy path", () => {
  assert.deepEqual(decide(), { ok: true });
});

test("promo decision: each refusal has its own reason (audit) and only no_consent is not generic", () => {
  assert.deepEqual(decide({ quote: { ok: false } }), { ok: false, reason: "no_code" });
  assert.deepEqual(decide({ quote: null }), { ok: false, reason: "no_code" });
  assert.deepEqual(decide({ quote: { ...quoteOk, payableMinor: 100 } }), { ok: false, reason: "not_full_cover" });
  assert.deepEqual(decide({ quote: { ...quoteOk, promoCollegeId: null } }), { ok: false, reason: "not_full_cover" });
  assert.deepEqual(decide({ quote: { ...quoteOk, promoCollegeId: "c2" } }), { ok: false, reason: "other_college" });
  assert.deepEqual(decide({ membershipCollegeId: null }), { ok: false, reason: "other_college" });
  assert.deepEqual(decide({ entries: [] }), { ok: false, reason: "no_entry" });
  assert.deepEqual(decide({ student: { ...student, phone: "9000000000" } }), { ok: false, reason: "identity" });
  assert.deepEqual(decide({ hasAdultConsent: false }), { ok: false, reason: "no_consent" });
});

test("promo decision: a valid code with a roster entry that is not this student is refused (a classmate's code is no use)", () => {
  const classmate: RosterIdentity = { name: "Priya Singh", email: "priya@abc.edu", phone: "+919000000001" };
  assert.equal(decide({ entries: [classmate] }).ok, false);
});

test("drive entry decision: own college, unbound or bound to me, identity must match", () => {
  const entry = { ...roster, collegeId: "c1", internId: null as string | null };
  const d = (over: Partial<Parameters<typeof driveEntryDecision>[0]> = {}) => driveEntryDecision({ entry, membershipCollegeId: "c1", uid: "u1", student, ...over });
  assert.deepEqual(d(), { ok: true });
  assert.deepEqual(d({ entry: { ...entry, internId: "u1" } }), { ok: true }, "a retry by the same student");
  assert.deepEqual(d({ entry: { ...entry, internId: "u2" } }), { ok: false, reason: "entry_taken" });
  assert.deepEqual(d({ entry: { ...entry, collegeId: "c2" } }), { ok: false, reason: "other_college" });
  assert.deepEqual(d({ entry: null }), { ok: false, reason: "no_code" });
  assert.deepEqual(d({ student: { ...student, name: "Not Him" } }), { ok: false, reason: "identity", failed: ["name"] });
  assert.deepEqual(d({ student: { ...student, phone: "9000000000" } }), { ok: false, reason: "identity", failed: ["phone"] });
});

test("home state and switching rules", () => {
  assert.equal(collegeHomeState({ accountType: "college", codeVerified: true, paid: false }), "college_unpaid");
  assert.equal(collegeHomeState({ accountType: "college", codeVerified: true, paid: true }), "college_paid");
  assert.equal(collegeHomeState({ accountType: "college", codeVerified: false, paid: false }), "normal", "no code behind it: never the college Home");
  assert.equal(collegeHomeState({ accountType: "individual", codeVerified: true, paid: false }), "normal");
  assert.equal(collegeHomeState({ accountType: null, codeVerified: true, paid: false }), "normal");
  assert.equal(canSwitchBackToCollege({ accountType: "individual", codeVerified: true, paid: false }), true);
  assert.equal(canSwitchBackToCollege({ accountType: "individual", codeVerified: true, paid: true }), false, "paid stays individual");
  assert.equal(canSwitchBackToCollege({ accountType: "individual", codeVerified: false, paid: false }), false);
  assert.equal(canSwitchBackToCollege({ accountType: "college", codeVerified: true, paid: false }), false, "already college");
});

test("the one refusal text names no field and does not say whether the code exists", () => {
  assert.ok(!/\b(code (is )?(wrong|invalid|expired|used|not found)|does not exist|phone does|email does|name does)/i.test(COLLEGE_PROMO_FAIL));
  assert.ok(COLLEGE_PROMO_FAIL.includes("could not verify"));
});
