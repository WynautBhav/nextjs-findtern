import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { FIRST_PAYMENT_EXPLAINER, firstPaymentNote } from "./first-payment-copy.ts";

test("the dashboard explainer says the first payment is the hiring charge plus Month 1 (master wording)", () => {
  assert.match(FIRST_PAYMENT_EXPLAINER, /first payment is made: the hiring charge, plus the Month 1 charge for scores 6 and above/);
  assert.match(FIRST_PAYMENT_EXPLAINER, /due 2 days before the month's pay date; you can pay up to 15 days early/);
});

test("composer note: Month 1 with the fee at score 6+, nothing below 6 or unscored", () => {
  assert.match(firstPaymentNote(6) ?? "", /hiring fee plus the Month 1 charge/);
  assert.match(firstPaymentNote(9.5) ?? "", /Month 1/);
  assert.equal(firstPaymentNote(5.9), null);
  assert.equal(firstPaymentNote(0), null);
  assert.equal(firstPaymentNote(null), null);
  assert.equal(firstPaymentNote(Number.NaN), null);
});

test("the dashboard and the composer use these words", () => {
  const dash = readFileSync(join(process.cwd(), "src/app/employer/dashboard/page.tsx"), "utf8");
  const form = readFileSync(join(process.cwd(), "src/components/employer/send-proposal-form.tsx"), "utf8");
  assert.match(dash, /detail: FIRST_PAYMENT_EXPLAINER/);
  assert.match(form, /firstPaymentNote\(candidate\.scored \? candidate\.score : null\)/);
});
