import assert from "node:assert/strict";
import test from "node:test";

import { matchHeader, parseReportHeader, sameName, type CandidateLite } from "./ai-report-match.ts";

// First lines of a real Incruiter feedback report (the "Ayush Sinha" sample), as pdftotext prints them.
const SAMPLE = [
  "Ayush Sinha",
  "#CAN00269            0% Resume Match",
  "Anudip-1 • Findtern Private Limited",
  "ayush21052003@gmail.com • +916202996007",
  "Wed, Sep 9, 2026 49 mins 37 secs",
  "Not Recommended",
];

const ayush: CandidateLite = {
  id: "u1",
  firstName: "Ayush",
  lastName: "Sinha",
  email: "ayush21052003@gmail.com",
  countryCode: "+91",
  phoneNumber: "6202996007",
};

test("reads name, candidate id, email and phone from the header", () => {
  assert.deepEqual(parseReportHeader(SAMPLE), {
    name: "Ayush Sinha",
    canId: "CAN00269",
    email: "ayush21052003@gmail.com",
    phone: "916202996007",
  });
});

test("the candidate id and the date are never read as a phone number", () => {
  const h = parseReportHeader(["Ira T", "#CAN00269            0% Resume Match", "Wed, Sep 9, 2026 49 mins 37 secs"]);
  assert.equal(h.phone, null);
  assert.equal(h.email, null);
});

test("phone formats: spaces, dashes, no country code", () => {
  assert.equal(parseReportHeader(["A B", "#CAN1234", "a@b.co • +91 62029 96007"]).phone, "916202996007");
  assert.equal(parseReportHeader(["A B", "#CAN1234", "a@b.co • 62029-96007"]).phone, "6202996007");
  assert.equal(parseReportHeader(["A B", "#CAN1234", "a@b.co • 6202996007"]).phone, "6202996007");
});

test("an empty or odd header gives nulls, not a crash", () => {
  assert.deepEqual(parseReportHeader([]), { name: null, canId: null, email: null, phone: null });
  assert.equal(parseReportHeader(["x".repeat(200)]).name, null);
});

test("phone + email + name agree: matched", () => {
  const r = matchHeader(parseReportHeader(SAMPLE), [ayush]);
  assert.deepEqual(r, { status: "matched", internId: "u1", reasons: ["phone", "email", "name"] });
});

test("phone + name is enough when the email differs", () => {
  const h = { ...parseReportHeader(SAMPLE), email: "other@x.com" };
  assert.equal(matchHeader(h, [ayush]).status, "matched");
});

test("phone + email is enough when the name is spelled differently", () => {
  const h = { ...parseReportHeader(SAMPLE), name: "A. Kumar" };
  assert.equal(matchHeader(h, [ayush]).status, "matched");
});

test("phone alone is only a check: a re-used number must not publish someone's report", () => {
  const h = { name: "Someone Else", canId: null, email: "else@x.com", phone: "6202996007" };
  const r = matchHeader(h, [ayush]);
  assert.equal(r.status, "check");
  assert.deepEqual(r.status === "check" && r.candidates[0]?.reasons, ["phone"]);
});

test("a name alone is a check, never a match", () => {
  const h = { name: "Ayush Sinha", canId: null, email: null, phone: null };
  assert.equal(matchHeader(h, [ayush]).status, "check");
});

test("a different country code on the same ten digits is not the same phone", () => {
  const h = { name: "Ayush Sinha", canId: null, email: "ayush21052003@gmail.com", phone: "446202996007" };
  const r = matchHeader(h, [ayush]);
  assert.equal(r.status, "check");
  assert.ok(r.status === "check" && !r.candidates[0]!.reasons.includes("phone"));
});

test("two candidates with the same name: the phone decides", () => {
  const other: CandidateLite = { ...ayush, id: "u2", email: "x@y.com", phoneNumber: "9000000000" };
  assert.deepEqual(matchHeader(parseReportHeader(SAMPLE), [other, ayush]), {
    status: "matched",
    internId: "u1",
    reasons: ["phone", "email", "name"],
  });
});

test("two equally strong candidates are ambiguous, not a coin toss", () => {
  const twin: CandidateLite = { ...ayush, id: "u2", countryCode: "+91" };
  assert.equal(matchHeader(parseReportHeader(SAMPLE), [ayush, twin]).status, "check");
});

test("no overlap at all: none", () => {
  const stranger: CandidateLite = { id: "u9", firstName: "Zed", lastName: "Q", email: "z@q.com", countryCode: "+91", phoneNumber: "9111111111" };
  assert.deepEqual(matchHeader(parseReportHeader(SAMPLE), [stranger]), { status: "none" });
  assert.deepEqual(matchHeader(parseReportHeader(SAMPLE), []), { status: "none" });
});

test("names: order, case, accents, middle names", () => {
  assert.ok(sameName("SINHA ayush", ayush));
  assert.ok(sameName("Ayush Kumar Sinha", ayush));
  assert.ok(sameName("Äyush Sinha", ayush));
  assert.ok(!sameName("Ayush", { ...ayush, firstName: "Ayan", lastName: "Sinha" }));
  assert.ok(!sameName("Ayush Verma", ayush), "one shared word is not enough for a two-word name");
  assert.ok(sameName("Ayush", { ...ayush, lastName: "" }), "a single-word name matches that word");
});
