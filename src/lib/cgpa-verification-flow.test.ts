import assert from "node:assert/strict";
import { test } from "node:test";

import { proposalCgpaGate, readCgpaVerification } from "./cgpa-verification.ts";
import {
  applyCgpaDecision,
  cgpaSla,
  decisionProblem,
  effectiveScore,
  nextCgpaVerification,
  readCgpaHistory,
} from "./cgpa-verification-flow.ts";

const NOW = new Date("2026-11-17T10:00:00.000Z");
const claim = (score: string, semester: number | null = 5, scoreType: "cgpa" | "percentage" = "cgpa") => ({ score, scoreType, semester });

test("first claim with a semester and a score is pending, with a history line", () => {
  const out = nextCgpaVerification({}, claim("8.4"), NOW);
  assert.ok(out);
  assert.equal(out.status, "pending");
  assert.equal(out.claimedScore, "8.4");
  assert.equal(out.scoreType, "cgpa");
  assert.equal(out.semester, 5);
  assert.equal(out.requestedAt, NOW.toISOString());
  assert.deepEqual(readCgpaHistory({ cgpaVerification: out }).map((h) => h.event), ["requested"]);
});

test("no semester or no score: nothing is flagged (legacy interns are never gated)", () => {
  assert.equal(nextCgpaVerification({}, claim("8.4", null), NOW), null);
  assert.equal(nextCgpaVerification({}, claim("", 5), NOW), null);
  assert.equal(nextCgpaVerification({}, claim("  ", 5), NOW), null);
});

test("an unchanged claim leaves every status alone (pending, verified, incorrect)", () => {
  const pending = nextCgpaVerification({}, claim("8.4"), NOW)!;
  assert.equal(nextCgpaVerification({ cgpaVerification: pending }, claim("8.4"), NOW), null);
  const verified = { ...pending, status: "verified", decidedAt: NOW.toISOString(), decidedBy: "a1" };
  assert.equal(nextCgpaVerification({ cgpaVerification: verified }, claim("8.4"), NOW), null);
  // After "incorrect" the profile holds the corrected score: saving it back is not a new claim.
  const incorrect = { ...pending, status: "incorrect", correctedScore: "7.9", decidedAt: NOW.toISOString(), decidedBy: "a1", note: "marksheet says 7.9" };
  assert.equal(nextCgpaVerification({ cgpaVerification: incorrect }, claim("7.9"), NOW), null);
});

test("changing the score or the semester resets to pending and keeps the history", () => {
  const pending = nextCgpaVerification({}, claim("8.4"), NOW)!;
  const verified = { ...pending, status: "verified", decidedAt: "2026-11-18T10:00:00.000Z", decidedBy: "a1" };
  const later = new Date("2026-11-20T10:00:00.000Z");
  const scoreChanged = nextCgpaVerification({ cgpaVerification: verified }, claim("9.1"), later)!;
  assert.equal(scoreChanged.status, "pending");
  assert.equal(scoreChanged.claimedScore, "9.1");
  assert.equal(scoreChanged.decidedAt, undefined);
  assert.equal(scoreChanged.decidedBy, undefined);
  assert.equal(scoreChanged.requestedAt, later.toISOString());
  assert.deepEqual(readCgpaHistory({ cgpaVerification: scoreChanged }).map((h) => h.event), ["requested", "reset"]);
  const semesterChanged = nextCgpaVerification({ cgpaVerification: verified }, claim("8.4", 6), later)!;
  assert.equal(semesterChanged.status, "pending");
  assert.equal(semesterChanged.semester, 6);
  // The type of score is part of the claim too.
  assert.equal(nextCgpaVerification({ cgpaVerification: verified }, claim("8.4", 5, "percentage"), later)!.status, "pending");
});

test("a score typed as 8.40 or with a trailing % is the same claim", () => {
  const pending = nextCgpaVerification({}, claim("8.4"), NOW)!;
  assert.equal(nextCgpaVerification({ cgpaVerification: pending }, claim("8.40"), NOW), null);
});

test("history is capped", () => {
  let extra: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) {
    const next = nextCgpaVerification(extra, claim(`${(i % 9) + 1}.${i % 10}`, 3 + (i % 2)), new Date(NOW.getTime() + i * 1000));
    if (next) extra = { cgpaVerification: next };
  }
  assert.ok(readCgpaHistory(extra).length <= 20);
});

test("effectiveScore: the corrected score after an incorrect decision, else the claim", () => {
  assert.equal(effectiveScore(readCgpaVerification({ cgpaVerification: { status: "incorrect", claimedScore: "8.4", correctedScore: "7.9", semester: 5, scoreType: "cgpa" } })), "7.9");
  assert.equal(effectiveScore(readCgpaVerification({ cgpaVerification: { status: "pending", claimedScore: "8.4", semester: 5, scoreType: "cgpa" } })), "8.4");
});

const pendingExtra = () => ({ cgpaVerification: nextCgpaVerification({}, claim("8.4"), NOW)!, academics: { score: "8.4", scoreType: "cgpa" } });

test("decisionProblem: incorrect needs a corrected score and a note; verify needs neither", () => {
  assert.equal(decisionProblem({ decision: "verified" }, "8.4", "cgpa"), null);
  assert.match(decisionProblem({ decision: "incorrect" }, "8.4", "cgpa") ?? "", /corrected score/i);
  assert.match(decisionProblem({ decision: "incorrect", correctedScore: "7.9" }, "8.4", "cgpa") ?? "", /note/i);
  assert.match(decisionProblem({ decision: "incorrect", correctedScore: "7.9", note: "   " }, "8.4", "cgpa") ?? "", /note/i);
  assert.match(decisionProblem({ decision: "incorrect", correctedScore: "11", note: "x" }, "8.4", "cgpa") ?? "", /out of 10/i);
  assert.match(decisionProblem({ decision: "incorrect", correctedScore: "abc", note: "x" }, "8.4", "cgpa") ?? "", /number/i);
  assert.match(decisionProblem({ decision: "incorrect", correctedScore: "8.4", note: "x" }, "8.4", "cgpa") ?? "", /different/i);
  assert.equal(decisionProblem({ decision: "incorrect", correctedScore: "7.9", note: "marksheet shows 7.9" }, "8.4", "cgpa"), null);
});

test("applyCgpaDecision verified: status, decidedAt, decidedBy, history; profile score untouched", () => {
  const res = applyCgpaDecision(pendingExtra(), { decision: "verified", by: "admin-1", now: NOW });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.noop, false);
  assert.equal(res.verification.status, "verified");
  assert.equal(res.verification.decidedAt, NOW.toISOString());
  assert.equal(res.verification.decidedBy, "admin-1");
  assert.equal(res.newScore, null);
  assert.deepEqual(readCgpaHistory({ cgpaVerification: res.verification }).map((h) => h.event), ["requested", "verified"]);
});

test("applyCgpaDecision incorrect: corrected score replaces the profile score, claim kept in history", () => {
  const res = applyCgpaDecision(pendingExtra(), { decision: "incorrect", correctedScore: "7.9", note: "Marksheet shows 7.9", by: "admin-1", now: NOW });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.verification.status, "incorrect");
  assert.equal(res.verification.claimedScore, "8.4");
  assert.equal(res.verification.correctedScore, "7.9");
  assert.equal(res.verification.note, "Marksheet shows 7.9");
  assert.equal(res.newScore, "7.9");
  const last = readCgpaHistory({ cgpaVerification: res.verification }).at(-1)!;
  assert.equal(last.event, "incorrect");
  assert.equal(last.claimedScore, "8.4");
  assert.equal(last.correctedScore, "7.9");
});

test("applyCgpaDecision: the gate the employer sees follows from what is written", () => {
  const res = applyCgpaDecision(pendingExtra(), { decision: "incorrect", correctedScore: "7.9", note: "n", by: "a", now: NOW });
  assert.ok(res.ok);
  if (!res.ok) return;
  const gate = proposalCgpaGate({ status: "accepted", extraData: { cgpaVerification: res.verification }, offerDetails: { acceptedAt: "2026-11-16T10:00:00.000Z" } }, NOW);
  assert.equal(gate.state, "incorrect_unacked");
  assert.equal(gate.correctedFrom, "8.4");
  assert.equal(gate.correctedTo, "7.9");
  const acked = proposalCgpaGate({ status: "accepted", extraData: { cgpaVerification: res.verification }, offerDetails: { acceptedAt: "2026-11-16T10:00:00.000Z", cgpaAckAt: "2026-11-17T11:00:00.000Z" } }, NOW);
  assert.equal(acked.state, "clear");
});

test("applyCgpaDecision is idempotent for the same decision and refuses a conflicting one", () => {
  const first = applyCgpaDecision(pendingExtra(), { decision: "verified", by: "admin-1", now: NOW });
  assert.ok(first.ok);
  if (!first.ok) return;
  const after = { cgpaVerification: first.verification };
  const again = applyCgpaDecision(after, { decision: "verified", by: "admin-2", now: new Date(NOW.getTime() + 5000) });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.noop, true);
  const flip = applyCgpaDecision(after, { decision: "incorrect", correctedScore: "7.9", note: "n", by: "admin-2", now: NOW });
  assert.equal(flip.ok, false);
  if (!flip.ok) assert.equal(flip.status, 409);
});

test("applyCgpaDecision: nothing to verify", () => {
  const res = applyCgpaDecision({}, { decision: "verified", by: "a", now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test("applyCgpaDecision incorrect validates before changing anything", () => {
  const res = applyCgpaDecision(pendingExtra(), { decision: "incorrect", by: "a", now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test("cgpaSla: green, amber near the deadline, red past 48 h; none without an acceptance", () => {
  const accepted = "2026-11-16T10:00:00.000Z";
  const at = (h: number) => new Date(Date.parse(accepted) + h * 3_600_000);
  assert.equal(cgpaSla(accepted, at(2)).tone, "ok");
  assert.equal(cgpaSla(accepted, at(2)).label, "46 h left");
  assert.equal(cgpaSla(accepted, at(30)).tone, "soon");
  assert.equal(cgpaSla(accepted, at(47.9)).tone, "soon");
  assert.equal(cgpaSla(accepted, at(48)).tone, "overdue");
  assert.equal(cgpaSla(accepted, at(50)).label, "2 h overdue");
  assert.equal(cgpaSla(null, NOW).tone, "none");
  assert.equal(cgpaSla(null, NOW).label, "Not accepted yet");
});
