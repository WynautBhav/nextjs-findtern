import assert from "node:assert/strict";
import { test } from "node:test";

import { dayMonth, payButtonState, scheduleSummary } from "./dues-display.ts";

const money = (n: number) => `₹${n / 100}`;

test("scheduleSummary: one line, amount, count and the next due day", () => {
  assert.equal(scheduleSummary(["2026-12-05", "2027-01-05", "2027-02-05"], 1500000, money), "Then ₹15000/month for 3 more months · next due 05 Dec");
});

test("scheduleSummary: one month left is singular; no amount when the rate is unknown", () => {
  assert.equal(scheduleSummary(["2026-12-05"], 500000, money), "Then ₹5000/month for 1 more month · next due 05 Dec");
  assert.equal(scheduleSummary(["2026-12-05", "2027-01-05"], null, money), "Then 2 more months · next due 05 Dec");
});

test("scheduleSummary: nothing after today's payment gives null; next due is the earliest day", () => {
  assert.equal(scheduleSummary([], 500000, money), null);
  assert.equal(scheduleSummary(["2027-01-05", "2026-12-05"], 500000, money), "Then ₹5000/month for 2 more months · next due 05 Dec");
});

test("dayMonth: DD MMM, blank for junk", () => {
  assert.equal(dayMonth("2026-03-09"), "09 Mar");
  assert.equal(dayMonth("nope"), "");
  assert.equal(dayMonth(null), "");
});

const ledger = (o: Partial<Parameters<typeof payButtonState>[0]> = {}) => ({ proposalId: "p1", plan: "postpaid" as const, dueMinor: 100, monthsPaid: 1, nextDue: "2026-12-20", ...o });

test("payButtonState: nothing owed shows no button", () => {
  assert.deepEqual(payButtonState(ledger({ dueMinor: 0, nextDue: null }), ["p1"], "2026-12-10"), { show: false });
});

test("payButtonState: a payable row is enabled", () => {
  assert.deepEqual(payButtonState(ledger(), ["p1"], "2026-12-10"), { show: true, enabled: true, label: "Pay month 2", payableFrom: null });
});

test("payButtonState: outside the 15-day window it is disabled and names due - 15 days", () => {
  // due 20 Dec, opens 5 Dec
  assert.deepEqual(payButtonState(ledger(), [], "2026-12-04"), { show: true, enabled: false, label: "Pay month 2", payableFrom: "2026-12-05" });
  assert.equal(payButtonState(ledger(), [], "2026-12-05").show && (payButtonState(ledger(), [], "2026-12-05") as { payableFrom: string | null }).payableFrom, null);
});

test("payButtonState: the old monthly plan is always enabled; a due month crossing a year end", () => {
  assert.equal((payButtonState(ledger({ plan: "monthly", nextDue: "2026-12-01" }), [], "2026-11-01") as { enabled: boolean }).enabled, true);
  assert.equal((payButtonState(ledger({ nextDue: "2027-01-10" }), [], "2026-12-01") as { payableFrom: string | null }).payableFrom, "2026-12-26");
});

test("payButtonState: an unpaid hire in payableIds says Pay; one with no due day is disabled with no date", () => {
  assert.deepEqual(payButtonState(ledger({ plan: "unpaid", monthsPaid: 0, nextDue: null }), ["p1"], "2026-12-01"), { show: true, enabled: true, label: "Pay", payableFrom: null });
  assert.deepEqual(payButtonState(ledger({ plan: "unpaid", monthsPaid: 0, nextDue: null }), [], "2026-12-01"), { show: true, enabled: false, label: "Pay", payableFrom: null });
});
