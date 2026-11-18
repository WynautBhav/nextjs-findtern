import assert from "node:assert/strict";
import { test } from "node:test";

import { summariseRefunds } from "./refund-summary.ts";

test("groups statuses into to-send, in-flight, refunded and failed", () => {
  const s = summariseRefunds([
    { status: "eligible", count: 2, amountMinor: 59800 },
    { status: "review", count: 1, amountMinor: 29900 },
    { status: "pending", count: 1, amountMinor: 29900 },
    { status: "initiated", count: 3, amountMinor: 89700 },
    { status: "refunded", count: 4, amountMinor: 119600 },
    { status: "failed", count: 1, amountMinor: 29900 },
  ]);
  assert.deepEqual(s, { toSendMinor: 119600, toSendCount: 4, inFlightCount: 3, refundedMinor: 119600, refundedCount: 4, failedCount: 1 });
});

test("empty and unknown statuses give zeros", () => {
  assert.equal(summariseRefunds([]).toSendMinor, 0);
  assert.equal(summariseRefunds([{ status: "mystery", count: 5, amountMinor: 1 }]).refundedCount, 0);
});

test("a failed refund is never counted as money sent", () => {
  assert.equal(summariseRefunds([{ status: "failed", count: 2, amountMinor: 500 }]).refundedMinor, 0);
});
