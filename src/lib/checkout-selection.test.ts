import test from "node:test";
import assert from "node:assert/strict";

import { AFTER_PAYMENT_HREF, checkoutView, justPaid, promoTotals, selectCheckoutLines } from "./checkout-selection.ts";

const lines = [{ id: "qab-month-2" }, { id: "accepted-offer" }];

test("QA-139: a named proposal shows only that line", () => {
  const r = selectCheckoutLines(lines, "accepted-offer");
  assert.deepEqual(r.lines.map((l) => l.id), ["accepted-offer"]);
  assert.equal(r.missing, false);
});

test("QA-139: a named proposal that isn't payable shows nothing else, and says so", () => {
  const r = selectCheckoutLines(lines, "ritika-unpaid-hire");
  assert.deepEqual(r.lines, []);
  assert.equal(r.missing, true);
  assert.equal(r.requested, "ritika-unpaid-hire");
});

test("no proposal named: every payable line", () => {
  assert.deepEqual(selectCheckoutLines(lines, null).lines.map((l) => l.id), ["qab-month-2", "accepted-offer"]);
  assert.deepEqual(selectCheckoutLines(lines, "  ").lines.length, 2);
});

// After a successful payment the paid proposal is no longer payable, so a page that
// still carries ?proposal=<paid id> used to say "This placement can't be paid here".
test("checkoutView: just paid and nothing left for the link shows the receipt, not the can't-be-paid error", () => {
  const sel = selectCheckoutLines([], "paid-offer");
  assert.equal(sel.missing, true);
  assert.equal(checkoutView(sel, true), "receipt");
  assert.equal(checkoutView(sel, false), "missing");
});

test("checkoutView: the other states are unchanged", () => {
  assert.equal(checkoutView(selectCheckoutLines(lines, null), false), "lines");
  assert.equal(checkoutView(selectCheckoutLines([], null), false), "empty");
  // still something to pay after the receipt: show the lines, the page adds the banner
  assert.equal(checkoutView(selectCheckoutLines(lines, null), true), "lines");
});

test("justPaid reads only ?paid=1; the redirect after paying drops the paid proposal's id", () => {
  assert.equal(justPaid("1"), true);
  assert.equal(justPaid(["1"]), true);
  assert.equal(justPaid(undefined), false);
  assert.equal(justPaid("0"), false);
  assert.equal(AFTER_PAYMENT_HREF, "/employer/checkout?paid=1");
});

test("promoTotals: the total shown is what is charged, and a discount never goes below zero or above the order", () => {
  assert.deepEqual(promoTotals(105600_00, 21120_00), { discountMinor: 21120_00, totalMinor: 84480_00 });
  assert.deepEqual(promoTotals(5000, 9000), { discountMinor: 5000, totalMinor: 0 });
  assert.deepEqual(promoTotals(5000, -300), { discountMinor: 0, totalMinor: 5000 });
  assert.deepEqual(promoTotals(5000, Number.NaN), { discountMinor: 0, totalMinor: 5000 });
});
