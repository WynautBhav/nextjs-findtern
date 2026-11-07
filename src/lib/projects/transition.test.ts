import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERN_VISIBLE_STATUSES, editBlockedReason, isTransitionConflict, planReview, planTransition,
} from "./transition.ts";
import { isVisibleToInterns } from "./lifecycle.ts";

const ready = { projectName: "Data", scopeOfWork: "short-term", skills: ["SQL"], locationType: "remote" };

test("draft -> pending_review stamps submittedAt", () => {
  const now = new Date(5);
  const p = planTransition({ project: { status: "draft", ...ready }, to: "pending_review", actorRole: "employer", now });
  assert.ok(p.ok);
  assert.equal(p.set.submittedAt, now);
  assert.equal(p.set.rejectionReason, null);
});
test("submit lists missing fields with 422", () => {
  const p = planTransition({ project: { status: "draft", projectName: "x" }, to: "pending_review", actorRole: "employer" });
  assert.ok(!p.ok);
  assert.equal(p.status, 422);
  assert.deepEqual(p.missing, ["description", "skills", "locationType"]);
});
test("employer cannot publish or leave closed", () => {
  const a = planTransition({ project: { status: "pending_review", ...ready }, to: "published", actorRole: "employer" });
  assert.ok(!a.ok && a.status === 403);
  const b = planTransition({ project: { status: "closed", ...ready }, to: "draft", actorRole: "employer" });
  assert.ok(!b.ok);
  const c = planTransition({ project: { status: "draft" }, to: "nope", actorRole: "employer" });
  assert.ok(!c.ok && c.status === 400);
});
test("legacy active row can be paused and closed", () => {
  const p = planTransition({ project: { status: "active", ...ready }, to: "paused", actorRole: "employer" });
  assert.ok(p.ok && p.from === "published");
  assert.ok(planTransition({ project: { status: "inactive" }, to: "published", actorRole: "employer" }).ok);
});
test("resume keeps the first publishedAt", () => {
  const first = new Date(1);
  const p = planTransition({ project: { status: "paused", publishedAt: first }, to: "published", actorRole: "employer", now: new Date(9) });
  assert.ok(p.ok);
  assert.equal(p.set.publishedAt, first);
});
test("admin review", () => {
  const pr = { status: "pending_review", ...ready };
  const ok = planReview({ project: pr, decision: "approve", now: new Date(3) });
  assert.ok(ok.ok && ok.to === "published" && ok.set.publishedAt?.getTime() === 3);
  const noReason = planReview({ project: pr, decision: "reject", reason: "  " });
  assert.ok(!noReason.ok && noReason.status === 422);
  const rej = planReview({ project: pr, decision: "reject", reason: " Too vague " });
  assert.ok(rej.ok && rej.set.rejectionReason === "Too vague");
  const wrong = planReview({ project: { status: "draft" }, decision: "approve" });
  assert.ok(!wrong.ok && wrong.status === 409);
  assert.ok(!planReview({ project: pr, decision: "maybe" }).ok);
});
test("concurrent transition: zero affected rows is a conflict", () => {
  assert.equal(isTransitionConflict(0), true);
  assert.equal(isTransitionConflict(1), false);
});
test("discovery shows only published and legacy active", () => {
  for (const s of ["draft", "pending_review", "paused", "closed", "rejected", "inactive", "archived", null]) {
    assert.equal(isVisibleToInterns(s), false, String(s));
    assert.equal((INTERN_VISIBLE_STATUSES as readonly string[]).includes(s as string), false, String(s));
  }
  for (const s of INTERN_VISIBLE_STATUSES) assert.equal(isVisibleToInterns(s), true);
});
test("edit rules by status", () => {
  assert.equal(editBlockedReason("draft", ["projectName"]), null);
  assert.equal(editBlockedReason("active", ["scopeOfWork", "fullTimeOffer"]), null);
  assert.ok(editBlockedReason("published", ["skills"]));
  assert.ok(editBlockedReason("pending_review", ["scopeOfWork"]));
  assert.ok(editBlockedReason("closed", []));
});
