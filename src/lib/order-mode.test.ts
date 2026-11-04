import assert from "node:assert/strict";
import { test } from "node:test";

import { lineCharge } from "./checkout.ts";
import { MONTHLY_AT_START_GONE, orderModeProblem } from "./order-mode.ts";
import { parseOffer } from "./offer.ts";
import { promoModeProblem } from "./promo-rules.ts";

const OFFER = { roleTitle: "Designer", monthlyAmount: 10000, duration: "3m", startDate: "2026-09-18", perHireCharge: 5000 };
const intern = parseOffer(OFFER, "INR");
const fullTime = parseOffer({ fullTimeOffer: { annualCtc: 600000 } }, "INR");

/** A payable line as the route sees it: the real charge for this offer and score. */
const line = (offer: typeof intern, score: number, due: boolean) => ({
  due: due ? { monthsPaid: 0 } : null,
  charge: lineCharge(offer, score, "postpaid", { firstPayment: !due }),
});

test("the old pay-at-start monthly option is refused for a new hire, 400", () => {
  const r = orderModeProblem({ mode: "monthly", paying: [line(intern, 8, false)], hasPromo: false });
  assert.deepEqual(r, { ok: false, status: 400, error: MONTHLY_AT_START_GONE });
});

test("monthly is the due month of a running hire, so it is not refused", () => {
  assert.deepEqual(orderModeProblem({ mode: "monthly", paying: [line(intern, 8, true)], hasPromo: false }), { ok: true, mode: "monthly" });
});

test("a promo with month-end payment is refused, 400", () => {
  const problem = promoModeProblem("monthly")!;
  assert.ok(problem);
  // postpaid first payment (fee at hire)
  assert.deepEqual(orderModeProblem({ mode: "postpaid", paying: [line(intern, 8, false)], hasPromo: true }), { ok: false, status: 400, error: problem });
  // a due month is monthly whatever the client asked, even when it asked for upfront
  assert.deepEqual(orderModeProblem({ mode: "upfront", paying: [line(intern, 8, true)], hasPromo: true }), { ok: false, status: 400, error: problem });
});

test("a promo with upfront payment, and month-end payment without a promo, are allowed", () => {
  assert.deepEqual(orderModeProblem({ mode: "upfront", paying: [line(intern, 8, false)], hasPromo: true }), { ok: true, mode: "upfront" });
  assert.deepEqual(orderModeProblem({ mode: "postpaid", paying: [line(intern, 8, false)], hasPromo: false }), { ok: true, mode: "postpaid" });
});

test("postpaid is refused for a score under 6 and for a full-time offer, 400, with the reason", () => {
  const low = orderModeProblem({ mode: "postpaid", paying: [line(intern, 5, false)], hasPromo: false });
  assert.deepEqual(low, { ok: false, status: 400, error: "Month-end payment needs a Findtern Score of 6 or more" });
  const ft = orderModeProblem({ mode: "postpaid", paying: [line(fullTime, 9, false)], hasPromo: false });
  assert.deepEqual(ft, { ok: false, status: 400, error: "Full-time offers are paid upfront" });
  // the same hires are fine paid upfront
  assert.equal(orderModeProblem({ mode: "upfront", paying: [line(intern, 5, false)], hasPromo: false }).ok, true);
  assert.equal(orderModeProblem({ mode: "upfront", paying: [line(fullTime, 9, false)], hasPromo: false }).ok, true);
});

test("a low score on a due month does not block it (the plan was set at hire)", () => {
  assert.equal(orderModeProblem({ mode: "postpaid", paying: [line(intern, 5, true)], hasPromo: false }).ok, true);
});
