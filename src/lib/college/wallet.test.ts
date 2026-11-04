import { test } from "node:test";
import assert from "node:assert/strict";

import { incentivePlan } from "./wallet.ts";

const ok = { status: "verified", leftAt: null, isPartner: true };

test("band by score before the +1: <6 500, 6-8 1000, 8+ 1500", () => {
  for (const [s, a] of [[null, 500], [0, 500], [5.9, 500], [6, 1000], [7.9, 1000], [8, 1500], [10, 1500]] as const) {
    assert.equal(incentivePlan(ok, s)?.amountMinor, a * 100, String(s));
  }
});

test("no credit: unverified, non-partner, left, or no membership", () => {
  assert.equal(incentivePlan({ ...ok, status: "claimed" }, 7), null);
  assert.equal(incentivePlan({ ...ok, isPartner: false }, 7), null);
  assert.equal(incentivePlan({ ...ok, leftAt: new Date() }, 7), null);
  assert.equal(incentivePlan(null, 7), null);
});
