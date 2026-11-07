import test from "node:test";
import assert from "node:assert/strict";

import { applyExisting, confirmBlockers, confirmProblem, countStates, emailFromKey, entryEmailKey, parseIdempotencyKey, planIdentityDecision, planPaid, rupeesToMinor, seatBatchForOrder, shouldRaiseSeatCap, sniffRosterFile, validateMapping } from "./admin-rules.ts";
import type { RosterRow } from "./import/validate.ts";

const enc = (s: string) => new TextEncoder().encode(s);

test("file type is decided by content, not name", () => {
  assert.equal(sniffRosterFile(enc("name,email\nA,a@u.edu\n")), "csv");
  assert.equal(sniffRosterFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])), "xlsx");
  assert.equal(sniffRosterFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), null);
  assert.equal(sniffRosterFile(new Uint8Array([0xff, 0xfe, 0xfa])), null);
  assert.equal(sniffRosterFile(enc("   \n")), null);
  assert.equal(sniffRosterFile(new Uint8Array()), null);
});

test("idempotency key header", () => {
  assert.deepEqual(parseIdempotencyKey(null), { ok: true, key: null });
  assert.deepEqual(parseIdempotencyKey("abcd-1234"), { ok: true, key: "abcd-1234" });
  assert.equal(parseIdempotencyKey("short").ok, false);
  assert.equal(parseIdempotencyKey("has space here").ok, false);
});

test("mapping validation", () => {
  assert.deepEqual(validateMapping({ name: 0, email: 1, phone: 2 }, 3), { ok: true, mapping: { name: 0, email: 1, phone: 2 } });
  assert.equal(validateMapping({ name: 0, email: 0 }, 3).ok, false);
  assert.equal(validateMapping({ name: 0, email: 5 }, 3).ok, false);
  assert.equal(validateMapping({ name: 0 }, 3).ok, false);
  assert.equal(validateMapping({ email: 1 }, 3).ok, false);
  assert.equal(validateMapping({ name: 0, email: 1, evil: 2 }, 3).ok, false);
  assert.equal(validateMapping({ name: 0, email: "1" }, 3).ok, false);
  assert.equal(validateMapping([0, 1], 3).ok, false);
});

test("paid planner is idempotent", () => {
  assert.deepEqual(planPaid({ status: "pending", seatBatchId: null }), { kind: "pay" });
  assert.deepEqual(planPaid({ status: "paid", seatBatchId: "b1" }), { kind: "replay", seatBatchId: "b1" });
  assert.equal(planPaid({ status: "refunded", seatBatchId: "b1" }).kind, "refuse");
  assert.equal(planPaid({ status: "failed", seatBatchId: null }).kind, "refuse");
});

test("the seat batch of a paid order bills the payable amount and never raises the cap", () => {
  const b = seatBatchForOrder({ id: "o1", collegeId: "c1", slots: 300, feePerStudentMinor: 80000, amountMinor: 24_000_000, creditMinor: 4_000_000 });
  assert.deepEqual(b, { collegeId: "c1", seats: 300, unitPriceMinor: 80000, amountMinor: 20_000_000, status: "paid", driveOrderId: "o1" });
  assert.equal(shouldRaiseSeatCap({ driveOrderId: "o1" }), false);
  assert.equal(shouldRaiseSeatCap({ driveOrderId: null }), true);
  assert.equal(shouldRaiseSeatCap({ driveOrderId: undefined }), true);
});

test("identity decisions only link listed candidates, once", () => {
  const review = { status: "pending", candidateInternId: "u1" };
  assert.deepEqual(planIdentityDecision({ decision: "link" }, review, ["u1", "u2"]), { ok: true, action: "link", internId: "u1" });
  assert.deepEqual(planIdentityDecision({ decision: "link", internId: "u2" }, review, ["u1", "u2"]), { ok: true, action: "link", internId: "u2" });
  assert.equal(planIdentityDecision({ decision: "link", internId: "u9" }, review, ["u1", "u2"]).ok, false);
  assert.deepEqual(planIdentityDecision({ decision: "reject" }, review, ["u1"]), { ok: true, action: "reject", internId: null });
  assert.equal(planIdentityDecision({ decision: "maybe" }, review, ["u1"]).ok, false);
  const done = planIdentityDecision({ decision: "link" }, { status: "linked", candidateInternId: "u1" }, ["u1"]);
  assert.equal(done.ok === false && done.status, 409);
});

const row = (rowNo: number, email: string | null, state: RosterRow["state"], reasons: string[] = []): RosterRow => ({ rowNo, name: "N", email, phone: null, state, reasons });

test("already-on-order emails become duplicates and slots are re-handed out", () => {
  const out = applyExisting([row(1, "a@u.edu", "valid"), row(2, "b@u.edu", "valid"), row(3, "c@u.edu", "over_allocation", ["over_allocation"]), row(4, null, "invalid", ["email_invalid"])], new Set(["a@u.edu"]), 2);
  assert.deepEqual(out.map((r) => r.state), ["duplicate", "valid", "valid", "invalid"]);
  assert.deepEqual(out[0].reasons, ["already_on_order"]);
  assert.deepEqual(out[2].reasons, []);
});

test("counts and blockers", () => {
  const c = countStates([row(1, "a", "valid"), row(2, "b", "invalid"), row(3, "c", "over_allocation")]);
  assert.deepEqual(c, { valid: 1, invalid: 1, duplicate: 0, ambiguous: 0, over_allocation: 1, total: 3 });
  assert.equal(confirmBlockers(c).length, 1);
  assert.deepEqual(confirmBlockers({ valid: 3, over_allocation: 0 }), []);
  assert.equal(confirmBlockers({ valid: 0, over_allocation: 0 }).length, 1);
});

test("stored email keys keep the unique index happy and round-trip", () => {
  assert.equal(entryEmailKey(row(1, "a@u.edu", "valid"), "i1"), "a@u.edu");
  const k = entryEmailKey(row(2, "a@u.edu", "duplicate"), "i1");
  assert.notEqual(k, "a@u.edu");
  assert.equal(emailFromKey("duplicate", k), "a@u.edu");
  assert.equal(emailFromKey("invalid", entryEmailKey(row(3, null, "invalid"), "i1")), "");
});

test("confirm gate", () => {
  const now = new Date("2026-11-07T00:00:00Z");
  const ok = { status: "paid", slots: 10, issuedCount: 2, codeValidUntil: new Date("2027-01-01") };
  assert.equal(confirmProblem(ok, 8, now), null);
  assert.equal(confirmProblem(ok, 9, now)?.status, 409);
  assert.equal(confirmProblem({ ...ok, status: "pending" }, 1, now)?.status, 409);
  assert.equal(confirmProblem({ ...ok, codeValidUntil: new Date("2026-01-01") }, 1, now)?.status, 409);
  assert.equal(confirmProblem(ok, 0, now)?.status, 400);
});

test("rupees to paise", () => {
  assert.equal(rupeesToMinor("800"), 80000);
  assert.equal(rupeesToMinor("799.50"), 79950);
  assert.equal(rupeesToMinor("-1"), null);
  assert.equal(rupeesToMinor("1e3"), null);
  assert.equal(rupeesToMinor(""), null);
});
