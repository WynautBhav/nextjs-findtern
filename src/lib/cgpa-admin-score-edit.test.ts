import assert from "node:assert/strict";
import { test } from "node:test";

import { readCgpaVerification } from "./cgpa-verification.ts";
import { ADMIN_EDIT_NOTE, applyAdminScoreEdit, nextCgpaVerification, applyCgpaDecision, withCgpaCorrection } from "./cgpa-verification-flow.ts";

const NOW = new Date("2026-11-18T10:00:00Z");
const edit = (extra: unknown, score: string, previousScore: string, scoreType: "cgpa" | "percentage" | "" = "cgpa") =>
  applyAdminScoreEdit(extra, { previousScore, score, scoreType, by: "admin-1", now: NOW });

/** What a profile save stores when the intern claims 8.0 in semester 5. */
const pending = { cgpaVerification: nextCgpaVerification({}, { score: "8.0", scoreType: "cgpa", semester: 5 }, new Date("2026-11-10T00:00:00Z")) };

test("no CGPA check on file: nothing is created (an admin-typed number has no claim to verify)", () => {
  const r = edit({ academics: { score: "6.5" } }, "8.1", "6.5");
  assert.deepEqual(r, { ok: true, verification: null, previousScore: "6.5", scoreChanged: true });
  assert.equal(edit({}, "8.1", "").ok, true);
});

test("a pending check: the admin's number becomes the correction, with the admin and the note in the history", () => {
  const r = edit(pending, "8.4", "8.0");
  assert.ok(r.ok && r.verification);
  const v = r.verification!;
  assert.equal(v.status, "incorrect");
  assert.equal(v.claimedScore, "8.0");
  assert.equal(v.correctedScore, "8.4");
  assert.equal(v.decidedBy, "admin-1");
  assert.equal(v.note, ADMIN_EDIT_NOTE);
  assert.equal(v.semester, 5);
  const last = v.history[v.history.length - 1];
  assert.deepEqual({ event: last.event, by: last.by, note: last.note, claimedScore: last.claimedScore, correctedScore: last.correctedScore }, { event: "incorrect", by: "admin-1", note: "edited by admin", claimedScore: "8.0", correctedScore: "8.4" });
  assert.equal(v.history.length, 2, "the intern's original claim stays in the history");
  assert.equal(readCgpaVerification({ cgpaVerification: v }).status, "incorrect");
});

test("works on a check already decided (verified, or incorrect once before), whatever the earlier decision", () => {
  const verified = { cgpaVerification: applyCgpaDecision(pending, { decision: "verified", by: "admin-9", now: NOW }) };
  const verifiedStore = (verified.cgpaVerification as { ok: true; verification: unknown }).verification;
  const r1 = edit({ cgpaVerification: verifiedStore }, "7.9", "8.0");
  assert.ok(r1.ok && r1.verification?.status === "incorrect" && r1.verification.correctedScore === "7.9");

  const first = edit(pending, "8.4", "8.0");
  assert.ok(first.ok && first.verification);
  const r2 = edit({ cgpaVerification: first.verification }, "8.6", "8.4");
  assert.ok(r2.ok && r2.verification);
  assert.equal(r2.verification!.claimedScore, "8.4");
  assert.equal(r2.verification!.correctedScore, "8.6");
  assert.equal(r2.verification!.history.length, 3);
});

test("the same score changes nothing; only a changed unit is recorded, as no decision", () => {
  assert.deepEqual(edit(pending, "8.00", "8.0"), { ok: true, verification: null, previousScore: "8.0", scoreChanged: false });
  const unit = edit(pending, "8.0", "8.0", "percentage");
  assert.ok(unit.ok && unit.verification);
  assert.equal(unit.verification!.scoreType, "percentage");
  assert.equal(unit.verification!.status, "pending");
  assert.equal(unit.verification!.history.length, 1);
});

test("with a check on file the score can be corrected but not cleared", () => {
  const r = edit(pending, "", "8.0");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 409);
});

test("an out-of-range corrected score is refused by the same check the decision route uses", () => {
  const r = edit(pending, "11", "8.0");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 400);
});

test("accepted offers get the correction recorded and the employer's earlier confirmation cleared (the helper the route calls)", () => {
  const offer = { roleTitle: "Intern", cgpaAckAt: "2026-11-12T00:00:00Z", acceptedAt: "2026-11-11T00:00:00Z" };
  const out = withCgpaCorrection(offer, { from: "8.0", to: "8.4", scoreType: "cgpa", at: NOW.toISOString() });
  assert.equal("cgpaAckAt" in out, false);
  assert.deepEqual(out.cgpaCorrection, { from: "8.0", to: "8.4", scoreType: "cgpa", at: NOW.toISOString() });
  assert.equal(out.roleTitle, "Intern");
});
