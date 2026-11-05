import assert from "node:assert/strict";
import { test } from "node:test";

import { ACCEPTED_OFFER_SCORE, acceptedLineCharge } from "./accepted-charge.ts";
import { lineCharge } from "./checkout.ts";
import { parseOffer } from "./offer.ts";

const offer = parseOffer({ roleTitle: "Designer", monthlyAmount: 10000, duration: "3m", startDate: "2026-09-18", perHireCharge: 5000 }, "INR");

test("an accepted offer is priced on the fixed score, the same as dues, invoices and reminders", () => {
  assert.equal(ACCEPTED_OFFER_SCORE, 10);
  for (const mode of ["upfront", "monthly", "postpaid"] as const) {
    for (const firstPayment of [true, false]) {
      assert.deepEqual(acceptedLineCharge(offer, mode, { firstPayment }), lineCharge(offer, 10, mode, { firstPayment }), `${mode}/${firstPayment}`);
    }
  }
});

test("a score that later drops below 6 would reprice a due month; the fixed basis does not", () => {
  // The live-score call this replaces: below 6 the month is priced as the whole engagement.
  assert.ok(lineCharge(offer, 4, "monthly", { firstPayment: false }).monthlyBlocked);
  assert.equal(lineCharge(offer, 4, "monthly", { firstPayment: false }).totalMinor, 3_000_000);
  // The month: the stipend alone, no fee, whatever the score is now.
  const month = acceptedLineCharge(offer, "monthly", { firstPayment: false });
  assert.equal(month.totalMinor, 1_000_000);
  assert.equal(month.monthlyBlocked, null);
  assert.equal(acceptedLineCharge(offer, "postpaid", { firstPayment: false }).totalMinor, 1_000_000);
  assert.equal(acceptedLineCharge(offer, "postpaid").totalMinor, 500_000);
});
