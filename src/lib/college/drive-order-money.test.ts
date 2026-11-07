import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOrderInput, computeAmounts, markPaidTransition, activationBlocker, remainingSlots, canIssue } from "./drive-order.ts";

const now = new Date("2026-11-07T00:00:00Z");
const later = new Date("2027-01-01T00:00:00Z");
const ok = (o: object = {}) => validateOrderInput({ slots: 10, feePerStudentMinor: 50000, codeValidUntil: later, ...o }, now);

test("valid order computes amounts", () => {
  const r = ok({ creditMinor: 1000 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.value.amountMinor, r.value.payableMinor], [500000, 499000]);
});
test("CHECK-equivalent rejections", () => {
  for (const bad of [{ slots: 0 }, { slots: 1.5 }, { slots: 100001 }, { feePerStudentMinor: 0 }, { feePerStudentMinor: -5 }, { creditMinor: -1 }, { codeValidUntil: now }, { slots: 100000, feePerStudentMinor: 10_000_000 }]) {
    assert.equal(ok(bad).ok, false, JSON.stringify(bad));
  }
});
test("negative payable rejected", () => {
  assert.equal(ok({ creditMinor: 500001 }).ok, false);
  assert.equal(ok({ creditMinor: 500000 }).ok, true);
  assert.equal(computeAmounts(2, 100, 50).payableMinor, 150);
});
test("paid transition cannot run twice", () => {
  const a = markPaidTransition({ status: "pending" }, { reference: "r", verifiedBy: "u", now });
  assert.ok(a.ok);
  assert.deepEqual(markPaidTransition({ status: "paid" }, { reference: "r", verifiedBy: "u", now }), { ok: false, reason: "not_pending" });
  assert.equal(markPaidTransition({ status: "failed" }, { reference: "r", verifiedBy: "u", now }).ok, false);
});
test("unpaid/failed orders block activation", () => {
  assert.ok(activationBlocker(null));
  for (const s of ["pending", "failed", "refunded", "partially_refunded"]) assert.ok(activationBlocker({ status: s }));
  assert.equal(activationBlocker({ status: "paid" }), null);
});
test("slots and issuing", () => {
  const o = { status: "paid", slots: 5, issuedCount: 3 };
  assert.equal(remainingSlots(o), 2);
  assert.ok(canIssue(o, 2));
  assert.ok(!canIssue(o, 3));
  assert.ok(!canIssue({ ...o, status: "pending" }, 1));
});
test("no hard-coded default fee in logic", () => {
  const src = readFileSync(new URL("./drive-order.ts", import.meta.url), "utf8");
  assert.ok(!/80000|capAfterPaid/.test(src));
});
