import assert from "node:assert/strict";
import { test } from "node:test";

import { clampPage, deriveStatus, maskEmail, orderMetrics, shapeStudents, totals, likeTerm } from "./drive-dashboard.ts";

const base = { entryState: "valid", codeStatus: null, interviewStatus: null };

test("every status", () => {
  assert.equal(deriveStatus({ ...base, entryState: "invalid" }), "not_invited");
  assert.equal(deriveStatus(base), "not_invited");
  assert.equal(deriveStatus({ ...base, codeStatus: "issued" }), "code_sent");
  assert.equal(deriveStatus({ ...base, codeStatus: "revoked" }), "not_invited");
  assert.equal(deriveStatus({ ...base, codeStatus: "redeemed" }), "activated");
  assert.equal(deriveStatus({ ...base, codeStatus: "redeemed", interviewStatus: "pending" }), "activated");
  assert.equal(deriveStatus({ ...base, codeStatus: "redeemed", interviewStatus: "started" }), "interview_started");
  assert.equal(deriveStatus({ ...base, codeStatus: "redeemed", interviewStatus: "completed" }), "interview_completed");
});

test("masking", () => {
  assert.equal(maskEmail("Asha.k@uni.edu"), "A•••@uni.edu");
  assert.equal(maskEmail("bad"), "•••");
  assert.equal(maskEmail("@x.com"), "•••");
  assert.equal(maskEmail(null), "•••");
});

test("page clamp", () => {
  assert.deepEqual(clampPage("-3", "9999"), { page: 1, pageSize: 50, offset: 0 });
  assert.deepEqual(clampPage("3", "10"), { page: 3, pageSize: 10, offset: 20 });
  assert.deepEqual(clampPage(undefined, "abc"), { page: 1, pageSize: 25, offset: 0 });
});

test("empty drive and metrics", () => {
  assert.deepEqual(totals([]), { slots: 0, issued: 0, redeemed: 0, pending: 0, unused: 0 });
  const m = orderMetrics({ id: "o", slots: 10, issued: 6, redeemed: 4, status: "paid" });
  assert.equal(m.pending, 2);
  assert.equal(m.unused, 4);
  assert.equal(totals([{ id: "a", slots: 5, issued: 5, redeemed: 5, status: "paid" }, m]).slots, 15);
});

test("scope: other college rows never shaped; no phone/code fields", () => {
  const mk = (id: string, collegeId: string) => ({ id, collegeId, name: "N", email: "n@u.edu", entryState: "valid", codeStatus: "issued", interviewStatus: null, redeemedAt: null });
  const out = shapeStudents([mk("1", "c1"), mk("2", "c2")], "c1");
  assert.deepEqual(out.map((r) => r.id), ["1"]);
  assert.deepEqual(Object.keys(out[0]).sort(), ["activatedAt", "email", "id", "name", "status"]);
  assert.equal(out[0].email, "n•••@u.edu");
});

test("like escaping", () => assert.equal(likeTerm(" 50%_a "), "50\\%\\_a"));
