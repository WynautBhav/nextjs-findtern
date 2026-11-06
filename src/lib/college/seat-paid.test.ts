import { test } from "node:test";
import assert from "node:assert/strict";

import { AWAITING_FIRST_PAYMENT, firstPaymentProblem, paidTransition } from "./seat-paid.ts";

test("a double mark-paid raises the cap once", () => {
  let cap = 0; // owner Q1: new colleges start at 0
  let status = "pending";
  const mark = () => {
    const t = paidTransition({ status, cap, paidSeatsBefore: 0, seats: 300 });
    if (t.ok) {
      status = "paid";
      cap = t.cap;
    }
    return t.ok;
  };
  assert.equal(mark(), true);
  assert.equal(mark(), false);
  assert.equal(cap, 300);
});

test("cap tracks paid seats across batches and never drops", () => {
  assert.deepEqual(paidTransition({ status: "pending", cap: 300, paidSeatsBefore: 300, seats: 200 }), { ok: true, cap: 500 });
  assert.deepEqual(paidTransition({ status: "pending", cap: 900, paidSeatsBefore: 300, seats: 200 }), { ok: true, cap: 900 });
  assert.deepEqual(paidTransition({ status: "void", cap: 0, paidSeatsBefore: 0, seats: 5 }), { ok: false });
});

test("no TPO login or code before the first paid batch", () => {
  assert.equal(firstPaymentProblem(0), AWAITING_FIRST_PAYMENT);
  assert.equal(AWAITING_FIRST_PAYMENT, "Awaiting first payment");
  assert.equal(firstPaymentProblem(1), null);
  assert.equal(firstPaymentProblem(3), null);
});
