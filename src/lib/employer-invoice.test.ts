import assert from "node:assert/strict";
import { test } from "node:test";

import { displayInvoiceNumber as adminNumber, type AdminInvoiceRow } from "./admin/invoice-rows.ts";
import { employerInvoice, needsLegacyNumber, type InvoiceHire, type InvoicePayment } from "./employer-invoice.ts";

const hire: InvoiceHire = {
  proposalId: "prop1",
  offerDetails: { roleTitle: "Designer", startDate: "2026-10-05", months: 3, duration: "3m", monthlyAmount: 10000 },
  currency: "INR",
  who: "Asha K",
  projectName: "Brand",
};
const hires = new Map([[hire.proposalId, hire]]);

const pay = (over: Partial<InvoicePayment>): InvoicePayment => ({
  id: "abcdef12-0000",
  orderId: "order_1",
  invoiceNumber: null,
  status: "paid",
  paidAt: new Date("2026-10-20T10:00:00+05:30"),
  amountMinor: 1_300_000,
  raw: { notes: { proposalIds: ["prop1"], paymentMode: "monthly" } },
  ...over,
});

/** What the employer's page passes: that employer's payments, plus the legacy refs of everyone. */
const employerCopy = (p: InvoicePayment, mine: InvoicePayment[], everyone: InvoicePayment[]) =>
  employerInvoice({ payment: p, allPayments: mine, legacyPaid: everyone.filter(needsLegacyNumber), hires });
/** What the admin page passes: every payment. */
const adminCopy = (p: InvoicePayment, everyone: InvoicePayment[]) =>
  employerInvoice({ payment: p, allPayments: everyone, legacyPaid: everyone.filter(needsLegacyNumber), hires });

test("legacy pre-28-Oct payment: admin and employer print the same DDMMYY-NN and lines", () => {
  const other = pay({ id: "zzzz", orderId: "order_0", paidAt: new Date("2026-10-20T09:00:00+05:30"), raw: {} }); // another employer, same day, earlier
  const first = pay({ id: "p-first", orderId: "order_1" });
  const second = pay({ id: "p-second", orderId: "order_2", paidAt: new Date("2026-10-26T10:00:00+05:30") });
  const everyone = [other, first, second];
  const mine = [first, second];

  const e = employerCopy(first, mine, everyone);
  const a = adminCopy(first, everyone);
  assert.equal(e.number, "201026-02");
  assert.deepEqual(a, e);
  assert.match(e.lines[0].detail ?? "", /Month 1 of 3 \(Oct 2026\)/);
  assert.equal(e.lines.length, 2); // stipend + hiring fee
  assert.match(e.lines[1].label, /One-time hiring fee/);

  // the second instalment: no fee line, its own month
  const e2 = employerCopy(second, mine, everyone);
  assert.deepEqual(adminCopy(second, everyone), e2);
  assert.equal(e2.lines.length, 1);
  assert.match(e2.lines[0].detail ?? "", /Month 2 of 3 \(Nov 2026\)/);

  // and the admin row prints that number, not PREFIX-xxxxxxxx
  const row = { id: first.id, invoiceNumber: first.invoiceNumber, displayNumber: a.number, status: "paid", amountMinor: first.amountMinor } as AdminInvoiceRow;
  assert.equal(adminNumber(row, "INV"), "201026-02");
});

test("new post-switch-over payment: same stored number and lines on both", () => {
  const p = pay({ id: "n1", orderId: "order_9", invoiceNumber: "FT/2026-27/0007", paidAt: new Date("2026-11-02T11:00:00+05:30") });
  const legacyOther = pay({ id: "o1", orderId: "order_8", paidAt: new Date("2026-11-02T10:00:00+05:30"), invoiceNumber: null, raw: {} }); // another employer's, paid, no stored number
  const everyone = [legacyOther, p];
  const e = employerCopy(p, [p], everyone);
  const a = adminCopy(p, everyone);
  assert.equal(e.number, "FT/2026-27/0007");
  assert.deepEqual(a, e);
  assert.equal(e.lines.length, 2);
  assert.equal(e.description, "Intern hiring services - monthly instalment");
});

test("intern-fee rows keep the prefix fallback and their own line (no displayNumber)", () => {
  const row = { id: "abcdef12-0", status: "paid", amountMinor: 49900 } as AdminInvoiceRow;
  assert.equal(adminNumber(row, "FT-INT"), "FT-INT-ABCDEF12");
  assert.equal(adminNumber({ ...row, invoiceNumber: "FT/2026-27/0001" }, "FT-INT"), "FT/2026-27/0001");
});
