import assert from "node:assert/strict";
import { test } from "node:test";

import { displayInvoiceNumber as adminNumber, type AdminInvoiceRow } from "./admin/invoice-rows.ts";
import { adminInvoiceInput } from "./admin/invoice-print.ts";
import { legacyInvoiceNumber, taxInvoiceHtml, type InvoiceSeller } from "./invoice.ts";
import { loadInvoiceHires, toInvoiceHire } from "./employer-invoice-hires.ts";
import { employerInvoice, employerInvoices, needsLegacyNumber, type InvoiceHire, type InvoicePayment } from "./employer-invoice.ts";

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

const seller: InvoiceSeller = { name: "Findtern", address: "Jaipur", gstin: "08AAAAA0000A1Z5", email: "a@b.c" };
const buyer = { name: "Acme", email: "x@acme.in", gstin: null, city: "Jaipur", state: "Rajasthan", country: "India", pincode: "302001" };

test("batch builder: 5000 payments finish fast and equal the single-call version", () => {
  const N = 5000;
  const manyHires = new Map<string, InvoiceHire>();
  const payments: InvoicePayment[] = [];
  for (let i = 0; i < N; i++) {
    const pid = `prop${i % 1200}`;
    manyHires.set(pid, { ...hire, proposalId: pid, who: `Intern ${i % 1200}` });
    payments.push(
      pay({
        id: `id-${i}`,
        orderId: `order_${String(i).padStart(5, "0")}`,
        // ~20 payments a day over the pre-cut-over months, some with no stored number after it
        paidAt: new Date(Date.parse("2026-01-01T03:00:00+05:30") + Math.floor(i / 20) * 86_400_000 + (i % 20) * 3_600_000 * 1.1),
        invoiceNumber: i % 7 === 0 ? null : `FT/2026-27/${i}`,
        raw: { notes: { proposalIds: [pid], paymentMode: i % 2 ? "monthly" : "upfront" } },
      }),
    );
  }
  const legacyPaid = payments.filter(needsLegacyNumber);
  const t0 = Date.now();
  const batch = employerInvoices({ payments, allPayments: payments, legacyPaid, hires: manyHires });
  const ms = Date.now() - t0;
  console.log(`employerInvoices(${N}) took ${ms} ms`);
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.equal(batch.size, N);

  for (let i = 0; i < N; i += 97) {
    const p = payments[i];
    const single = employerInvoice({ payment: p, allPayments: payments, legacyPaid, hires: manyHires });
    assert.deepEqual(batch.get(p.id), single);
    if (needsLegacyNumber(p)) assert.equal(batch.get(p.id)!.number, legacyInvoiceNumber(p, legacyPaid)); // the original algorithm
  }
});

test("promo note: the shared builder gives one note, coded or legacy percentage", () => {
  const coded = pay({ raw: { notes: { proposalIds: ["prop1"] }, promo: { promoCode: "ACME10", discountMinor: 5000 } } });
  const legacy = pay({ id: "l1", orderId: "order_l", raw: { order: { notes: { proposalIds: ["prop1"], discountAmountMinor: 144444 } } }, amountMinor: 1_300_000 });
  const none = pay({ id: "n1", orderId: "order_n" });
  const all = [coded, legacy, none];
  const b = employerInvoices({ payments: all, allPayments: all, legacyPaid: [], hires });
  assert.deepEqual(b.get(coded.id)!.promo, { code: "ACME10", discountMinor: 5000 });
  assert.deepEqual(b.get(legacy.id)!.promo, { code: "Discount (10%)", discountMinor: 144444 });
  assert.equal(b.get(none.id)!.promo, null);
  // single call agrees, and both pages print the note from it
  assert.deepEqual(employerInvoice({ payment: legacy, allPayments: all, legacyPaid: [], hires }).promo, b.get(legacy.id)!.promo);
  const row = { id: legacy.id, orderId: legacy.orderId, currency: "INR", amountMinor: legacy.amountMinor, status: "paid", createdAt: null, buyer, partyId: "e", partyName: "Acme", partyEmail: "x", invoicePromo: b.get(legacy.id)!.promo } as AdminInvoiceRow;
  const adminHtml = taxInvoiceHtml(adminInvoiceInput(row, "employer", seller));
  const employerHtml = taxInvoiceHtml({ ...adminInvoiceInput(row, "employer", seller), promo: b.get(legacy.id)!.promo });
  assert.match(adminHtml, /Promo Discount \(10%\) applied: you saved/);
  assert.equal(adminHtml, employerHtml);
});

test("shared hire loader: both pages get the same hires; unknown proposals are absent and names are not invented", async () => {
  const rows = [
    { id: "prop1", offerDetails: hire.offerDetails, currency: "INR", first: "Asha", last: "K", projectName: "Brand" },
    { id: "prop2", offerDetails: hire.offerDetails, currency: "INR", first: null, last: null, projectName: null },
  ];
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "where"]) chain[m] = () => chain;
  chain.then = (res: (v: unknown) => void) => res(rows);
  const db = { select: () => chain };
  const payments = [{ raw: { notes: { proposalIds: ["prop1", "prop2", "gone"] } } }, { raw: { notes: { proposalIds: ["prop1"] } } }];
  const hiresLoaded = await loadInvoiceHires(db, payments);
  assert.deepEqual([...hiresLoaded.keys()].sort(), ["prop1", "prop2"]);
  assert.equal(hiresLoaded.get("prop1")!.who, "Asha K");
  assert.equal(hiresLoaded.get("prop2")!.who, "");
  assert.deepEqual(hiresLoaded.get("prop1"), toInvoiceHire(rows[0]));
  assert.equal((await loadInvoiceHires(db, [{ raw: {} }])).size, 0);
  // a payment naming one unknown and one known hire prints only the known one
  const p = pay({ raw: { notes: { proposalIds: ["gone", "prop1"], paymentMode: "monthly" } } });
  const inv = employerInvoice({ payment: p, allPayments: [p], legacyPaid: [], hires: hiresLoaded });
  assert.deepEqual(inv.hireNames, ["Asha K"]);
});

test("admin print: an intern-fee row keeps the single SAC 999293 line, no employer lines or promo override", () => {
  const row = {
    id: "abcdef12-0", orderId: "order_int", paymentId: "pay_1", currency: "INR", amountMinor: 49900, status: "paid",
    paidAt: "2026-11-01T10:00:00.000Z", createdAt: null, buyer, partyId: "i1", partyName: "Intern", partyEmail: "i@x.in",
    invoiceNumber: "FT/2026-27/0001", promoCode: "CAMPUS99", discountMinor: 20000, discountLabel: "CAMPUS99",
  } as AdminInvoiceRow;
  const input = adminInvoiceInput(row, "intern", seller);
  assert.equal(input.sac, "999293");
  assert.equal(input.lines, undefined);
  assert.equal(input.invoiceNo, "FT/2026-27/0001");
  const html = taxInvoiceHtml(input);
  assert.match(html, /SAC 999293/);
  assert.match(html, /Candidate activation/);
  assert.match(html, /Promo CAMPUS99 applied/);
  assert.doesNotMatch(html, /SAC 998519/);
  // an employer row prints SAC 998519 from its own lines
  const emp = adminInvoiceInput({ ...row, invoiceLines: [{ label: "Asha K - Designer", amountMinor: 49900 }], invoiceDescription: "Intern hiring services" }, "employer", seller);
  assert.match(taxInvoiceHtml(emp), /SAC 998519/);
});
