import assert from "node:assert/strict";
import { test } from "node:test";

import { activationShare, barWidths, split } from "./dv-model.ts";

test("split: three parts that add back to the slots", () => {
  assert.deepEqual(split({ slots: 100, issued: 60, redeemed: 25 }), { activated: 25, waiting: 35, notIssued: 40 });
});

test("split: a bad row cannot go negative or past its slots", () => {
  assert.deepEqual(split({ slots: 10, issued: 15, redeemed: 20 }), { activated: 10, waiting: 0, notIssued: 0 });
  assert.deepEqual(split({ slots: 10, issued: -3, redeemed: 4 }), { activated: 0, waiting: 0, notIssued: 10 });
});

test("barWidths: true shares of the largest college", () => {
  const w = barWidths({ slots: 50, issued: 30, redeemed: 10 }, 200);
  assert.deepEqual(w, { activated: 5, waiting: 10, notIssued: 10 });
  const biggest = barWidths({ slots: 200, issued: 200, redeemed: 200 }, 200);
  assert.equal(biggest.activated + biggest.waiting + biggest.notIssued, 100);
  assert.deepEqual(barWidths({ slots: 0, issued: 0, redeemed: 0 }, 0), { activated: 0, waiting: 0, notIssued: 0 });
});

test("activationShare: of issued, null when none issued", () => {
  assert.equal(activationShare({ slots: 100, issued: 60, redeemed: 15 }), 25);
  assert.equal(activationShare({ slots: 100, issued: 0, redeemed: 0 }), null);
});
