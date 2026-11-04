import assert from "node:assert/strict";
import { test } from "node:test";

import { hireInvoiceLines, monthName } from "./invoice-lines.ts";
import { parseOffer } from "./offer.ts";

const offer = parseOffer(
  { roleTitle: "Designer", startDate: "2026-11-09", months: 3, duration: "3m", monthlyAmount: 10000 },
  "INR",
);

test("monthName follows the start date across a year end", () => {
  assert.equal(monthName("2026-11-09", 0), "Nov 2026");
  assert.equal(monthName("2026-11-09", 2), "Jan 2027");
  assert.equal(monthName(null, 0), null);
});

test("first monthly payment splits the stipend and the hiring fee, and names the month", () => {
  const lines = hireInvoiceLines({ who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer, monthly: true, paymentIndex: 0 });
  assert.equal(lines.length, 2);
  assert.match(lines[0].detail ?? "", /Month 1 of 3 \(Nov 2026\)/);
  assert.match(lines[0].detail ?? "", /^3m /);
  assert.match(lines[0].label, /^Asha K \u2014 Designer$/);
  assert.equal(lines[0].amountMinor, 1_000_000);
  assert.match(lines[1].label, /One-time hiring fee/);
  assert.ok((lines[1].amountMinor ?? 0) > 0);
});

test("a later instalment has no hiring fee line and names its own month", () => {
  const lines = hireInvoiceLines({ who: "Asha K", roleTitle: "Designer", projectName: "Brand", offer, monthly: true, paymentIndex: 2 });
  assert.equal(lines.length, 1);
  assert.match(lines[0].detail ?? "", /Month 3 of 3 \(Jan 2027\)/);
});

test("a promo comes off the stipend, never the hiring fee", () => {
  const plain = hireInvoiceLines({ who: "A", roleTitle: "D", projectName: "P", offer, monthly: false, paymentIndex: 0 });
  const fee = plain[1].amountMinor!;
  const net = hireInvoiceLines({ who: "A", roleTitle: "D", projectName: "P", offer, monthly: false, paymentIndex: 0, chargedMinor: fee + 2_000_000 });
  assert.equal(net[1].amountMinor, fee);
  assert.equal(net[0].amountMinor, 2_000_000);
});

test("a nameless candidate prints 'Candidate', never a bare dash", () => {
  for (const who of ["", "   "]) {
    const lines = hireInvoiceLines({ who, roleTitle: "Designer", projectName: "Brand", offer, monthly: true, paymentIndex: 0 });
    assert.equal(lines[0].label, "Candidate \u2014 Designer");
    assert.equal(lines[1].label, "Candidate \u2014 One-time hiring fee");
  }
});

test("a stipend fully covered by a promo is a priced ₹0 line, not 'Included'", async () => {
  const { lineRows } = await import("./invoice.ts");
  const plain = hireInvoiceLines({ who: "A", roleTitle: "D", projectName: "P", offer, monthly: false, paymentIndex: 0 });
  const fee = plain[1].amountMinor!;
  const lines = hireInvoiceLines({ who: "A", roleTitle: "D", projectName: "P", offer, monthly: false, paymentIndex: 0, chargedMinor: fee });
  assert.equal(lines[0].amountMinor, 0);
  assert.deepEqual(lineRows(lines, fee).map((r) => r.priceMinor), [0, fee]);
});
