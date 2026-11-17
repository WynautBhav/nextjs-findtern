import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CGPA_DISCLAIMER,
  CGPA_SLA_HOURS,
  cgpaBlocksPayment,
  proofSlots,
  proposalCgpaGate,
  readCgpaVerification,
  semesterOptions,
  yearOfStudy,
  type CgpaGate,
} from "./cgpa-verification.ts";

const HOUR = 3_600_000;
const ACCEPTED = "2026-11-17T10:00:00.000Z";
const at = (hours: number, minutes = 0) => new Date(Date.parse(ACCEPTED) + hours * HOUR + minutes * 60_000);

const cv = (over: Record<string, unknown> = {}) => ({
  cgpaVerification: { status: "pending", claimedScore: "8.2", scoreType: "cgpa", semester: 5, requestedAt: "2026-11-10T08:00:00.000Z", ...over },
});
const accepted = (over: Partial<Parameters<typeof proposalCgpaGate>[0]> = {}) => ({
  status: "accepted",
  extraData: cv(),
  offerDetails: { acceptedAt: ACCEPTED },
  ...over,
});

/* ── constants ─────────────────────────────────────────────────────── */

test("the SLA is 24 to 48 hours and the disclaimer is the agreed sentence", () => {
  assert.deepEqual(CGPA_SLA_HOURS, { min: 24, max: 48 });
  assert.equal(CGPA_DISCLAIMER, "You'll receive a confirmation call or email from Findtern to verify your CGPA once a proposal you accept is confirmed.");
});

/* ── yearOfStudy ───────────────────────────────────────────────────── */

test("yearOfStudy counts years since the start year and rolls over in July (India time)", () => {
  const a = { startYear: "2023", status: "pursuing" };
  assert.equal(yearOfStudy(a, null, new Date("2026-11-17T06:00:00Z")), 4);
  assert.equal(yearOfStudy(a, null, new Date("2026-01-10T06:00:00Z")), 3);
  assert.equal(yearOfStudy(a, null, new Date("2026-06-30T12:00:00Z")), 3);
  assert.equal(yearOfStudy(a, null, new Date("2026-07-15T12:00:00Z")), 4);
  assert.equal(yearOfStudy(a, null, new Date("2023-08-01T12:00:00Z")), 1);
  assert.equal(yearOfStudy(a, null, new Date("2024-06-01T12:00:00Z")), 1);
  assert.equal(yearOfStudy(a, null, new Date("2024-07-02T12:00:00Z")), 2);
});

test("the July rollover happens at midnight India time, not UTC", () => {
  const a = { startYear: "2023", status: "pursuing" };
  assert.equal(yearOfStudy(a, null, new Date("2026-06-30T18:29:59Z")), 3); // 23:59:59 IST 30 Jun
  assert.equal(yearOfStudy(a, null, new Date("2026-06-30T18:30:00Z")), 4); // 00:00 IST 1 Jul
});

test("a college member's declared year wins over the start year", () => {
  const a = { startYear: "2023", status: "pursuing" };
  assert.equal(yearOfStudy(a, 2, new Date("2026-11-17T06:00:00Z")), 2);
  assert.equal(yearOfStudy({ startYear: "", status: "" }, 3), 3);
  assert.equal(yearOfStudy(a, 5, new Date("2026-11-17T06:00:00Z")), 5);
});

test("an unusable college year falls back to the start year", () => {
  const a = { startYear: "2023", status: "pursuing" };
  const now = new Date("2026-11-17T06:00:00Z");
  assert.equal(yearOfStudy(a, 0, now), 4);
  assert.equal(yearOfStudy(a, 6, now), 4);
  assert.equal(yearOfStudy(a, 2.5, now), 4);
});

test("yearOfStudy is unknown when there is nothing to go on", () => {
  const now = new Date("2026-11-17T06:00:00Z");
  assert.equal(yearOfStudy({ startYear: "", status: "pursuing" }, null, now), null);
  assert.equal(yearOfStudy({ startYear: "abc", status: "pursuing" }, null, now), null);
  assert.equal(yearOfStudy({ startYear: "20", status: "pursuing" }, null, now), null);
  assert.equal(yearOfStudy({ startYear: "2023", status: "completed" }, null, now), null, "finished degree has no current year");
  assert.equal(yearOfStudy({ startYear: "2015", status: "pursuing" }, null, now), null, "more than five years is not a plausible current year");
});

test("a start year still ahead reads as first year", () => {
  assert.equal(yearOfStudy({ startYear: "2027", status: "pursuing" }, null, new Date("2026-11-17T06:00:00Z")), 1);
  assert.equal(yearOfStudy({ startYear: "2026", status: "pursuing" }, null, new Date("2026-05-17T06:00:00Z")), 1);
});

/* ── semesterOptions ───────────────────────────────────────────────── */

test("semesterOptions: year y offers semesters 2y-1 and 2y", () => {
  assert.deepEqual(semesterOptions(1), [1, 2]);
  assert.deepEqual(semesterOptions(2), [3, 4]);
  assert.deepEqual(semesterOptions(3), [5, 6]);
  assert.deepEqual(semesterOptions(4), [7, 8]);
  assert.deepEqual(semesterOptions(5), [9, 10]);
});

test("semesterOptions: an unknown or implausible year shows 1 to 10", () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(semesterOptions(null), all);
  assert.deepEqual(semesterOptions(0), all);
  assert.deepEqual(semesterOptions(6), all);
  assert.deepEqual(semesterOptions(Number.NaN), all);
  assert.deepEqual(semesterOptions(2.5), all);
});

/* ── proofSlots ────────────────────────────────────────────────────── */

test("proofSlots: semester 1 is the college ID card only", () => {
  assert.deepEqual(proofSlots(1), [{ key: "college-id", label: "College ID card" }]);
});

test("proofSlots: semester N has exactly N slots, marksheets for 1..N-1 and the ID card last", () => {
  const five = proofSlots(5);
  assert.equal(five.length, 5);
  assert.deepEqual(
    five.map((s) => s.label),
    ["Semester 1 marksheet", "Semester 2 marksheet", "Semester 3 marksheet", "Semester 4 marksheet", "College ID card"],
  );
  assert.deepEqual(
    five.map((s) => s.key),
    ["marksheet-1", "marksheet-2", "marksheet-3", "marksheet-4", "college-id"],
  );
});

test("proofSlots: N slots for every semester 1..10, unique keys", () => {
  for (let n = 1; n <= 10; n += 1) {
    const slots = proofSlots(n);
    assert.equal(slots.length, n, `semester ${n}`);
    assert.equal(new Set(slots.map((s) => s.key)).size, n, `semester ${n} keys`);
    assert.equal(slots[n - 1].label, "College ID card");
  }
});

test("proofSlots: no slots for something that is not a semester", () => {
  for (const bad of [0, -1, 11, 2.5, Number.NaN]) assert.deepEqual(proofSlots(bad), [], String(bad));
});

/* ── readCgpaVerification ──────────────────────────────────────────── */

test("readCgpaVerification: nothing stored means not required", () => {
  const empty = { status: "not_required", claimedScore: "", scoreType: "", semester: null };
  for (const v of [null, undefined, {}, "x", 7, [], { cgpaVerification: null }, { cgpaVerification: "pending" }]) {
    assert.deepEqual(readCgpaVerification(v), empty, JSON.stringify(v));
  }
});

test("readCgpaVerification: a full record reads back as stored", () => {
  const stored = {
    status: "incorrect",
    claimedScore: "8.9",
    scoreType: "cgpa",
    correctedScore: "7.9",
    semester: 6,
    requestedAt: "2026-11-10T08:00:00.000Z",
    decidedAt: "2026-11-11T08:00:00.000Z",
    decidedBy: "admin-1",
    note: "Marksheet shows 7.9",
  };
  assert.deepEqual(readCgpaVerification({ cgpaVerification: stored }), stored);
});

test("readCgpaVerification: garbage fields are normalised, not trusted", () => {
  const got = readCgpaVerification({ cgpaVerification: { status: "weird", claimedScore: 8.5, scoreType: "gpa", semester: "5", correctedScore: 7, note: 5 } });
  assert.equal(got.status, "not_required");
  assert.equal(got.claimedScore, "8.5");
  assert.equal(got.scoreType, "");
  assert.equal(got.semester, 5);
  assert.equal(got.correctedScore, "7");
  assert.equal("note" in got, false);
  assert.equal(readCgpaVerification({ cgpaVerification: { status: "pending", semester: 0 } }).semester, null);
  assert.equal(readCgpaVerification({ cgpaVerification: { status: "pending", semester: 11 } }).semester, null);
  assert.equal(readCgpaVerification({ cgpaVerification: { status: "pending", semester: 2.5 } }).semester, null);
  assert.equal(readCgpaVerification({ cgpaVerification: { status: "pending", scoreType: "percentage" } }).scoreType, "percentage");
});

/* ── proposalCgpaGate ──────────────────────────────────────────────── */

test("gate: legacy accepted offers with no flag are none", () => {
  for (const extraData of [null, {}, { academics: { score: "8" } }, { cgpaVerification: { status: "not_required" } }]) {
    const g = proposalCgpaGate(accepted({ extraData }), at(500));
    assert.equal(g.state, "none", JSON.stringify(extraData));
    assert.equal(cgpaBlocksPayment(g), false);
  }
});

test("gate: pending inside the window, with the 48 h deadline from acceptedAt", () => {
  const g = proposalCgpaGate(accepted(), at(1));
  assert.deepEqual(g, { state: "pending", acceptedAt: ACCEPTED, dueBy: "2026-11-19T10:00:00.000Z" });
  assert.equal(proposalCgpaGate(accepted(), at(24)).state, "pending", "24 h is the usual time, not the deadline");
});

test("gate: 47:59 is still pending, 48:00 exactly is overdue", () => {
  assert.equal(proposalCgpaGate(accepted(), at(47, 59)).state, "pending");
  assert.equal(proposalCgpaGate(accepted(), at(47, 59)).dueBy, "2026-11-19T10:00:00.000Z");
  assert.equal(proposalCgpaGate(accepted(), at(48)).state, "overdue");
  assert.equal(proposalCgpaGate(accepted(), at(200)).state, "overdue");
});

test("gate: pending and overdue both block payment", () => {
  assert.equal(cgpaBlocksPayment(proposalCgpaGate(accepted(), at(1))), true);
  assert.equal(cgpaBlocksPayment(proposalCgpaGate(accepted(), at(60))), true);
});

test("gate: a row accepted before acceptedAt existed measures from updatedAt", () => {
  const p = accepted({ offerDetails: {}, updatedAt: new Date(ACCEPTED) });
  assert.deepEqual(proposalCgpaGate(p, at(47, 59)), { state: "pending", acceptedAt: ACCEPTED, dueBy: "2026-11-19T10:00:00.000Z" });
  assert.equal(proposalCgpaGate(p, at(48)).state, "overdue");
  assert.equal(proposalCgpaGate(accepted({ offerDetails: null, updatedAt: ACCEPTED }), at(48)).state, "overdue", "string updatedAt");
  assert.equal(proposalCgpaGate(accepted({ offerDetails: { acceptedAt: "not a date" }, updatedAt: ACCEPTED }), at(1)).acceptedAt, ACCEPTED);
});

test("gate: acceptedAt wins over updatedAt", () => {
  const p = accepted({ updatedAt: new Date("2026-11-01T00:00:00Z") });
  assert.equal(proposalCgpaGate(p, at(1)).state, "pending");
  assert.equal(proposalCgpaGate(p, at(1)).acceptedAt, ACCEPTED);
});

test("gate: no timestamp at all is pending with no deadline, never overdue", () => {
  const g = proposalCgpaGate(accepted({ offerDetails: {} }), at(5000));
  assert.deepEqual(g, { state: "pending", acceptedAt: null, dueBy: null });
});

test("gate: verified is clear", () => {
  const g = proposalCgpaGate(accepted({ extraData: cv({ status: "verified" }) }), at(100));
  assert.equal(g.state, "clear");
  assert.equal(cgpaBlocksPayment(g), false);
});

test("gate: incorrect blocks until the employer confirms, with the correction to show", () => {
  const extraData = cv({ status: "incorrect", claimedScore: "8.9", correctedScore: "7.9", decidedAt: "2026-11-17T20:00:00.000Z" });
  const g = proposalCgpaGate(accepted({ extraData }), at(30));
  assert.equal(g.state, "incorrect_unacked");
  assert.equal(g.correctedFrom, "8.9");
  assert.equal(g.correctedTo, "7.9");
  assert.equal(cgpaBlocksPayment(g), true);
});

test("gate: confirming after the correction clears it; a confirmation from before it does not", () => {
  const extraData = cv({ status: "incorrect", claimedScore: "8.9", correctedScore: "7.9", decidedAt: "2026-11-17T20:00:00.000Z" });
  const after = proposalCgpaGate(accepted({ extraData, offerDetails: { acceptedAt: ACCEPTED, cgpaAckAt: "2026-11-17T21:00:00.000Z" } }), at(30));
  assert.equal(after.state, "clear");
  assert.equal(after.correctedFrom, "8.9");
  assert.equal(cgpaBlocksPayment(after), false);
  const before = proposalCgpaGate(accepted({ extraData, offerDetails: { acceptedAt: ACCEPTED, cgpaAckAt: "2026-11-17T19:00:00.000Z" } }), at(30));
  assert.equal(before.state, "incorrect_unacked");
  const noDecision = cv({ status: "incorrect", claimedScore: "8.9", correctedScore: "7.9" });
  assert.equal(proposalCgpaGate(accepted({ extraData: noDecision, offerDetails: { acceptedAt: ACCEPTED, cgpaAckAt: ACCEPTED } }), at(30)).state, "clear");
});

test("gate: only an accepted offer is gated", () => {
  for (const status of ["draft", "sent", "interview_scheduled", "processing", "hired", "rejected", "withdrawn", "expired"]) {
    assert.equal(proposalCgpaGate(accepted({ status }), at(100)).state, "none", status);
  }
});

test("cgpaBlocksPayment: exactly pending, overdue and incorrect_unacked", () => {
  const states: CgpaGate["state"][] = ["none", "pending", "overdue", "incorrect_unacked", "clear"];
  const blocked = states.filter((state) => cgpaBlocksPayment({ state, acceptedAt: null, dueBy: null }));
  assert.deepEqual(blocked, ["pending", "overdue", "incorrect_unacked"]);
});
