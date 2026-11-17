import assert from "node:assert/strict";
import { test } from "node:test";

import { acquisitionRows, conversionRows, signupVsPaid } from "./overview.ts";

test("conversionRows: every step is a share of the cohort that signed up, in the order given; steps are independent so one can exceed an earlier one", () => {
  const rows = conversionRows([
    { label: "Signed up", count: 40 },
    { label: "Profile complete", count: 30 },
    { label: "Applied / has a proposal", count: 12 },
    { label: "Hired", count: 4 },
    { label: "Paid activation", count: 18 },
  ]);
  assert.deepEqual(rows.map((r) => r.pct), [100, 75, 30, 10, 45]);
  assert.equal(rows[4].count, 18);
});

test("conversionRows: an empty cohort gives zeros, never NaN", () => {
  const rows = conversionRows([{ label: "Signed up", count: 0 }, { label: "Hired", count: 0 }]);
  assert.deepEqual(rows.map((r) => r.pct), [0, 0]);
});

test("conversionRows: shares round to whole percent and cap at 100", () => {
  assert.equal(conversionRows([{ label: "a", count: 3 }, { label: "b", count: 1 }])[1].pct, 33);
  assert.equal(conversionRows([{ label: "a", count: 3 }, { label: "b", count: 5 }])[1].pct, 100);
});

test("signupVsPaid: signups, how many of those paid, and the payers in the window as separate facts", () => {
  const s = signupVsPaid({ signups: 20, paidInWindow: 7, signedUpAndPaid: 5 });
  assert.equal(s.paidInWindow, 7);
  assert.equal(s.signedUpAndPaid, 5);
  assert.equal(s.signupToPaidPct, 25);
  assert.equal(signupVsPaid({ signups: 0, paidInWindow: 3, signedUpAndPaid: 0 }).signupToPaidPct, null);
});

test("acquisitionRows: shares of the cohort, the rest as Direct, biggest first, never negative", () => {
  const rows = acquisitionRows(20, { college: [{ label: "JKLU", count: 5 }, { label: "IIT", count: 3 }], promo: [{ label: "WELCOME", count: 4 }] });
  assert.deepEqual(rows.college.map((r) => [r.label, r.pct]), [["JKLU", 25], ["IIT", 15]]);
  assert.equal(rows.collegeTotal, 8);
  assert.equal(rows.promoTotal, 4);
  assert.equal(rows.direct, 20 - 8);
  assert.equal(acquisitionRows(3, { college: [{ label: "X", count: 5 }], promo: [] }).direct, 0);
  assert.equal(acquisitionRows(0, { college: [], promo: [] }).direct, 0);
});
