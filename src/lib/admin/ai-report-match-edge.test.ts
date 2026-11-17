import assert from "node:assert/strict";
import test from "node:test";

import { matchHeader, parseReportHeader, sameName, type CandidateLite, type ReportHeader } from "./ai-report-match.ts";

/**
 * Edge cases for "does this Incruiter PDF land on the right intern": duplicate
 * names, case and whitespace, phone and email formats. Complements
 * ai-report-match.test.ts (which has the main rules). Each case prints
 * expected vs actual.
 */

const base: CandidateLite = { id: "u1", firstName: "Ayush", lastName: "Sinha", email: "ayush@example.com", countryCode: "+91", phoneNumber: "9876543210" };
const header = (over: Partial<ReportHeader> = {}): ReportHeader => ({ name: "Ayush Sinha", canId: "CAN00269", email: "ayush@example.com", phone: "919876543210", ...over });
const say = (what: string, expected: unknown, actual: unknown) => console.log(`${what}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);

test("positive control: same person, every field agrees -> matched to that id", () => {
  const r = matchHeader(header(), [base]);
  say("exact", { status: "matched", internId: "u1" }, r);
  assert.equal(r.status, "matched");
  assert.equal(r.status === "matched" && r.internId, "u1");
});

test("case and whitespace: UPPER-CASE email, padded stored email, name in capitals with extra spaces", () => {
  const c = { ...base, email: "  Ayush@Example.COM " };
  const r = matchHeader(header({ email: "AYUSH@EXAMPLE.COM", name: "  AYUSH   SINHA " }), [c]);
  say("case/space", "matched on phone+email+name", r);
  assert.deepEqual(r, { status: "matched", internId: "u1", reasons: ["phone", "email", "name"] });
});

test("phone formats the DB may hold: with country code in the number, with spaces, with a leading 0", () => {
  for (const [stored, cc] of [["+91 98765 43210", "+91"], ["919876543210", "+91"], ["98765-43210", "91"], ["9876543210", ""]]) {
    const r = matchHeader(header(), [{ ...base, phoneNumber: stored!, countryCode: cc! }]);
    say(`stored "${stored}" cc "${cc}"`, "matched", r.status);
    assert.equal(r.status, "matched", `stored ${stored}`);
  }
});

test("OBSERVATION: a report printing 09876543210 (leading 0) is a check, not a match: safe direction, needs a person", () => {
  const h = parseReportHeader(["Ayush Sinha", "#CAN00269", "ayush@example.com • 09876543210"]);
  const r = matchHeader(h, [base]);
  say("leading 0 (the sample reports print +91...; this format is not known to occur)", "check (never a wrong match)", { phone: h.phone, status: r.status });
  assert.equal(r.status, "check");
  assert.equal(r.status === "check" && r.candidates[0]?.id, "u1");
});

test("two interns with the same name and different phones: the phone picks, never the name", () => {
  const twin = { ...base, id: "u2", email: "other@example.com", phoneNumber: "9000000001" };
  for (const pool of [[base, twin], [twin, base]]) {
    const r = matchHeader(header(), pool);
    assert.equal(r.status === "matched" && r.internId, "u1");
  }
  // The other twin's report goes to the other twin.
  const r2 = matchHeader(header({ email: "other@example.com", phone: "919000000001" }), [base, twin]);
  assert.equal(r2.status === "matched" && r2.internId, "u2");
});

test("same name, report has no phone or email: ambiguous (check, both listed), never an auto-match", () => {
  const twin = { ...base, id: "u2", email: "other@example.com", phoneNumber: "9000000001" };
  const r = matchHeader(header({ email: null, phone: null }), [base, twin]);
  say("name only, two namesakes", "check with u1 and u2", r);
  assert.equal(r.status, "check");
  assert.deepEqual(r.status === "check" && r.candidates.map((c) => c.id).sort(), ["u1", "u2"]);
});

test("two interns share one phone (siblings): phone-only on both is a check, a matching name or email singles one out", () => {
  const sibling = { ...base, id: "u2", firstName: "Anya", email: "anya@example.com" };
  assert.equal(matchHeader(header({ name: "Zed Q", email: null }), [base, sibling]).status, "check");
  const r = matchHeader(header(), [base, sibling]);
  assert.equal(r.status === "matched" && r.internId, "u1");
});

test("a candidate from another country with the same last ten digits is not auto-matched", () => {
  const uk = { ...base, id: "u3", countryCode: "+44" };
  const r = matchHeader(header(), [uk]);
  say("same 10 digits, +44 vs +91", "not matched", r.status);
  assert.notEqual(r.status, "matched");
});

test("name rules: shared surname alone is not a match; middle names and order are", () => {
  assert.equal(sameName("Rahul Sinha", base), false);
  assert.equal(sameName("Sinha Ayush Kumar", base), true);
  assert.equal(sameName("ayush.sinha", base), true, "punctuation splits words");
});

test("a report with no usable header (empty, junk) never matches anyone", () => {
  const r = matchHeader({ name: null, canId: null, email: null, phone: null }, [base]);
  assert.deepEqual(r, { status: "none" });
});

test("OBSERVATION: CAN id on the first line makes the name read as that line; it matches nobody (safe), the phone/email still decide", () => {
  const h = parseReportHeader(["#CAN00269   0% Resume Match", "ayush@example.com • +919876543210"]);
  say("CAN id first (the sample reports put the name above it)", "name is junk but match relies on phone+email", h);
  assert.equal(matchHeader(h, [base]).status, "matched");
  assert.equal(sameName(h.name, base), false);
});
