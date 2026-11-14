import assert from "node:assert/strict";
import { test } from "node:test";

import { perHireAnswer, perHireCaption, perHireFootnote, perHireStatLines } from "./per-hire-copy.ts";
import { PER_HIRE_FEE_DEFAULT } from "./per-hire-fee.ts";

const ALL_ON = { standard: true, skilled: true, assured: true };
const ALL_OFF = { standard: false, skilled: false, assured: false };

test("defaults read: charged on Espresso, free for now on Cappuccino and Latte", () => {
  assert.equal(perHireFootnote(PER_HIRE_FEE_DEFAULT, "₹5,000"), "₹5,000 per hiring on Espresso; free for now on Cappuccino and Latte");
  assert.deepEqual(perHireStatLines(PER_HIRE_FEE_DEFAULT), ["per-hire fee on Espresso", "free for now on Cappuccino and Latte"]);
  assert.match(perHireCaption(PER_HIRE_FEE_DEFAULT), /Espresso carries a fixed per-hiring charge.*free for now on Cappuccino and Latte/);
});

test("copy follows the setting: all on, all off, mixed", () => {
  assert.equal(perHireFootnote(ALL_ON, "₹5,000"), "₹5,000 per hiring on every plan");
  assert.equal(perHireFootnote(ALL_OFF, "₹5,000"), "No per-hiring charge for now on any plan");
  assert.equal(perHireFootnote({ standard: true, skilled: true, assured: false }, "₹5,000"), "₹5,000 per hiring on Espresso and Cappuccino; free for now on Latte");
  assert.doesNotMatch(perHireAnswer("₹5,000", ALL_OFF), /₹5,000/);
  assert.match(perHireAnswer("₹5,000", ALL_ON), /^Espresso, Cappuccino and Latte carry a fixed ₹5,000/);
});
