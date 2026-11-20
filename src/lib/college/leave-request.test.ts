import assert from "node:assert/strict";
import test from "node:test";

import { cleanText, decisionOutcome, joinProblem, LEAVE_NOTE_MAX, LEAVE_REASON_MAX, requestProblem } from "./leave-request.ts";

test("D4: reason is optional; empty and missing are none; 500 ok, 501 refused", () => {
  assert.deepEqual(cleanText(undefined, LEAVE_REASON_MAX, "Reason"), { ok: true, value: null });
  assert.deepEqual(cleanText(null, LEAVE_REASON_MAX, "Reason"), { ok: true, value: null });
  assert.deepEqual(cleanText("   ", LEAVE_REASON_MAX, "Reason"), { ok: true, value: null });
  assert.deepEqual(cleanText("  moving  ", LEAVE_REASON_MAX, "Reason"), { ok: true, value: "moving" });
  assert.equal(cleanText("x".repeat(500), LEAVE_REASON_MAX, "Reason").ok, true);
  assert.equal(cleanText("x".repeat(501), LEAVE_REASON_MAX, "Reason").ok, false);
  assert.equal(cleanText("x".repeat(501), LEAVE_NOTE_MAX, "Note").ok, false);
  assert.equal(cleanText(5, LEAVE_REASON_MAX, "Reason").ok, false);
});

test("a request needs a live membership and no pending request; a rejected one does not block (D1)", () => {
  assert.equal(requestProblem(null, false)?.code, "not_member");
  assert.equal(requestProblem({ leftAt: new Date() }, false)?.code, "not_member");
  assert.equal(requestProblem({ leftAt: null }, true)?.code, "already_requested");
  assert.equal(requestProblem({ leftAt: null }, false), null);
});

test("joining another college's code while still a member is refused; same college and left members are fine", () => {
  assert.equal(joinProblem({ collegeId: "a", leftAt: null }, "b", "NIT")?.code, "leave_needs_approval");
  assert.match(joinProblem({ collegeId: "a", leftAt: null }, "b", "NIT")!.error, /NIT/);
  assert.equal(joinProblem({ collegeId: "a", leftAt: null }, "a", "NIT"), null);
  assert.equal(joinProblem({ collegeId: "a", leftAt: new Date() }, "b", "NIT"), null);
  assert.equal(joinProblem(null, "b", "NIT"), null);
});

test("a decision is idempotent for the same action and a conflict for the opposite one", () => {
  assert.equal(decisionOutcome("requested", "approve"), "apply");
  assert.equal(decisionOutcome("requested", "reject"), "apply");
  assert.equal(decisionOutcome("approved", "approve"), "already");
  assert.equal(decisionOutcome("rejected", "reject"), "already");
  assert.equal(decisionOutcome("approved", "reject"), "conflict");
  assert.equal(decisionOutcome("rejected", "approve"), "conflict");
  assert.equal(decisionOutcome("cancelled", "approve"), "conflict");
});
