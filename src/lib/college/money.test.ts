import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SEAT_PRICE_MINOR,
  availableMinor,
  capAfterPaid,
  collegeBankProblem,
  seatBatchAmount,
  seatBatchProblem,
  withdrawalProblem,
} from "./money.ts";

test("a seat is a fixed ₹800, GST included", () => {
  assert.equal(SEAT_PRICE_MINOR, 80000);
  assert.equal(seatBatchAmount(300), 24_000_000);
  assert.equal(seatBatchAmount(1), 80000);
});

test("seat count: whole numbers from 1 to 5000", () => {
  for (const ok of [1, 300, 5000]) assert.equal(seatBatchProblem(ok), null, String(ok));
  for (const bad of [0, -1, 1.5, 5001, NaN, Infinity, "300", null, undefined]) {
    assert.notEqual(seatBatchProblem(bad), null, String(bad));
  }
});

test("cap rule (Q1): a new college starts at 0, so the cap is its total paid seats", () => {
  assert.equal(capAfterPaid({ cap: 0, paidSeatsBefore: 0, seats: 300 }), 300);
  assert.equal(capAfterPaid({ cap: null, paidSeatsBefore: 0, seats: 300 }), 300);
  assert.equal(capAfterPaid({ cap: undefined, paidSeatsBefore: 0, seats: 50 }), 50);
  // A second batch adds to the first.
  assert.equal(capAfterPaid({ cap: 300, paidSeatsBefore: 300, seats: 200 }), 500);
});

test("cap rule never lowers a cap that is already higher (existing QA/staging colleges)", () => {
  assert.equal(capAfterPaid({ cap: 300, paidSeatsBefore: 0, seats: 100 }), 300);
  assert.equal(capAfterPaid({ cap: 1000, paidSeatsBefore: 300, seats: 200 }), 1000);
});

test("available = balance minus the open request, floored at 0", () => {
  assert.equal(availableMinor(150000, 0), 150000);
  assert.equal(availableMinor(150000, 50000), 100000);
  assert.equal(availableMinor(150000, 150000), 0);
  assert.equal(availableMinor(50000, 150000), 0);
  assert.equal(availableMinor(0, 0), 0);
});

test("withdrawal: positive whole paise, within available, bank on file", () => {
  const base = { amountMinor: 50000, availableMinor: 100000, hasBank: true };
  assert.equal(withdrawalProblem(base), null);
  assert.equal(withdrawalProblem({ ...base, amountMinor: 100000 }), null, "the full available amount is allowed");
  assert.notEqual(withdrawalProblem({ ...base, amountMinor: 100001 }), null);
  for (const bad of [0, -100, 10.5, NaN, "500", null]) {
    assert.notEqual(withdrawalProblem({ ...base, amountMinor: bad }), null, String(bad));
  }
  assert.notEqual(withdrawalProblem({ ...base, hasBank: false }), null);
  assert.notEqual(withdrawalProblem({ ...base, availableMinor: 0 }), null);
});

test("college bank details map onto the shared bank rules", () => {
  const ok = { holder: "JKLU Placement Cell", bankName: "State Bank of India", accountNumber: "123456789012", ifsc: "SBIN0001234" };
  assert.equal(collegeBankProblem(ok), null);
  assert.equal(collegeBankProblem({ ...ok, upi: "jklu@okaxis" }), null);
  assert.notEqual(collegeBankProblem({ ...ok, holder: " " }), null);
  assert.notEqual(collegeBankProblem({ ...ok, bankName: "" }), null);
  assert.notEqual(collegeBankProblem({ ...ok, accountNumber: "123" }), null);
  assert.notEqual(collegeBankProblem({ ...ok, ifsc: "BAD" }), null);
  assert.notEqual(collegeBankProblem({ ...ok, upi: "not-a-upi" }), null);
  assert.notEqual(collegeBankProblem({}), null);
});

test("settleProblem: a withdrawal is paid only while the wallet still holds it", async () => {
  const { settleProblem } = await import("./money.ts");
  assert.equal(settleProblem(500000, 500000), null, "exactly the balance is fine");
  assert.equal(settleProblem(900000, 500000), null);
  assert.ok(settleProblem(400000, 500000), "balance dropped below the request");
  assert.ok(settleProblem(0, 500000));
  assert.ok(settleProblem(500000, 0));
});
