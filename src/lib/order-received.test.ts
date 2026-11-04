import assert from "node:assert/strict";
import { test } from "node:test";

import { receivedRefusal } from "./order-received.ts";

test("receivedRefusal: only a paid, not yet stamped order", () => {
  assert.equal(receivedRefusal({ status: "paid", raw: {} }), null);
  assert.equal(receivedRefusal({ status: "paid", raw: null }), null);
  assert.match(receivedRefusal({ status: "created", raw: {} }) ?? "", /paid/);
  assert.match(receivedRefusal({ status: "failed", raw: {} }) ?? "", /paid/);
  assert.match(receivedRefusal({ status: "paid", raw: { receivedAt: "2026-11-04T00:00:00Z" } }) ?? "", /already/);
});
