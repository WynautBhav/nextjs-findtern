import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

import { adminInvoiceInput } from "./admin/invoice-print.ts";
import { toCsv } from "./admin/csv.ts";
import { invoiceCsvColumns } from "./admin/invoice-csv.ts";
import type { AdminInvoiceRow } from "./admin/invoice-rows.ts";
import { seatBatchAmount } from "./college/money.ts";
import { seatInvoiceInput } from "./college/seat-invoice.ts";
import { employerInvoice, type InvoiceHire, type InvoicePayment } from "./employer-invoice.ts";
import { LUT_NUMBER, placeOfSupply } from "./gst.ts";
import { ownInternInvoices, type InternPaymentRecord } from "./intern-invoice.ts";
import { taxInvoiceHtml, type InvoiceSeller } from "./invoice.ts";

/**
 * The owner's rule: every Findtern invoice carries the company's LUT number (GST Letter of Undertaking).
 * Part 1 renders one sample of each kind and looks for it. Part 2 scans src/ so a NEW invoice generator
 * cannot ship without it: add the file to GENERATORS (and reference LUT_NUMBER there) or this fails.
 */

const seller: InvoiceSeller = { name: "Findtern Private Limited", address: "Jaipur", gstin: "08AAGCF2512F1Z0", email: "admin@findtern.in" };
const LUT_LINE = `LUT No.: ${LUT_NUMBER}`;
const hasLut = (html: string) => html.includes(LUT_LINE);

const hire: InvoiceHire = { proposalId: "prop1", offerDetails: { roleTitle: "Designer", startDate: "2026-10-05", months: 3, duration: "3m", monthlyAmount: 10000 }, currency: "INR", who: "Asha K", projectName: "Brand" };
const payment = (over: Partial<InvoicePayment> = {}): InvoicePayment => ({
  id: "abcdef12-0000", orderId: "order_1", invoiceNumber: "FT/2026-27/0001", status: "paid", paidAt: new Date("2026-11-10T10:00:00+05:30"), amountMinor: 1_180_000,
  raw: { notes: { proposalIds: ["prop1"], paymentMode: "monthly" } }, ...over,
});
const employerHtml = (p: InvoicePayment, currency: string, buyer: { name: string; state?: string; country?: string }) => {
  const inv = employerInvoice({ payment: p, allPayments: [p], legacyPaid: [], hires: new Map([[hire.proposalId, hire]]) });
  return taxInvoiceHtml({
    invoiceNo: inv.number, date: p.paidAt!, orderId: p.orderId, paymentId: "pay_1", currency, amountMinor: p.amountMinor, description: inv.description,
    lines: inv.lines.length ? inv.lines : undefined, promo: inv.promo, seller, buyer: { ...buyer, place: placeOfSupply({ ...buyer, currency }) },
  });
};

test("the LUT is the owner's number, kept in one constant", () => {
  assert.equal(LUT_NUMBER, "AD081126006216G");
  assert.match(LUT_NUMBER, /^AD\d{12}[A-Z]$/);
});

test("INR domestic employer invoice carries the LUT", () => {
  assert.ok(hasLut(employerHtml(payment(), "INR", { name: "Acme", state: "Karnataka", country: "India" })));
});

test("USD export invoice carries the LUT", () => {
  const html = employerHtml(payment({ amountMinor: 35_000 }), "USD", { name: "Acme Inc", country: "United States" });
  assert.match(html, /Export of services/);
  assert.ok(hasLut(html));
});

test("subscription invoice carries the LUT", () => {
  const html = employerHtml(payment({ amountMinor: 590_000, raw: { kind: "employer_subscription", periodDays: 365 } }), "INR", { name: "Acme", state: "Rajasthan", country: "India" });
  assert.match(html, /Findtern Pro subscription/);
  assert.ok(hasLut(html));
});

test("college seat invoice carries the LUT", () => {
  const batch = { id: "b1", seats: 300, amountMinor: seatBatchAmount(300), invoiceNumber: "061126-1", paidAt: new Date("2026-11-06T05:00:00Z"), createdAt: new Date("2026-11-01") };
  assert.ok(hasLut(taxInvoiceHtml(seatInvoiceInput(batch, { name: "IIT X", gstin: null, city: "Pune", state: "Maharashtra" }, seller))));
});

const row = (over: Partial<AdminInvoiceRow> = {}): AdminInvoiceRow => ({
  id: "abcdef12-0000", orderId: "order_1", paymentId: "pay_1", gateway: "razorpay", amountMinor: 11_800, currency: "INR", status: "paid",
  paidAt: "2026-11-16T19:00:00.000Z", createdAt: "2026-11-16T18:00:00.000Z", partyId: "e1", partyName: "Acme", partyEmail: "ops@acme.test",
  buyer: { name: "Acme", state: "Karnataka" }, ...over,
});

test("admin ledger print (employer and intern kinds) carries the LUT", () => {
  assert.ok(hasLut(taxInvoiceHtml(adminInvoiceInput(row(), "employer", seller))));
  assert.ok(hasLut(taxInvoiceHtml(adminInvoiceInput(row({ currency: "USD", buyer: { name: "Acme", country: "United States" } }), "employer", seller))));
  assert.ok(hasLut(taxInvoiceHtml(adminInvoiceInput(row(), "intern", seller))));
});

test("intern's own invoice carries the LUT", () => {
  const rec: InternPaymentRecord = {
    id: "11111111-aaaa", invoiceNumber: "021126-124", internId: "u1", orderId: "order_ABCDEFGH12", paymentId: "pay_1", gateway: "razorpay", amountMinor: 249900, currency: "INR",
    status: "paid", paidAt: new Date("2026-11-02T05:00:00Z"), createdAt: new Date("2026-11-02T04:00:00Z"), raw: null, onboardingPayment: null,
    firstName: "Asha", lastName: "Rao", email: "a@x.in", pinCode: "560001", state: "Karnataka",
  };
  const [mine] = ownInternInvoices([rec], "u1", seller);
  assert.ok(hasLut(mine.html));
});

test("the LUT sits in the header block, next to the supplier GSTIN", () => {
  const html = taxInvoiceHtml(adminInvoiceInput(row(), "employer", seller));
  assert.match(html, /<div class="seller">[^]*GST: 08AAGCF2512F1Z0<br \/>LUT No\.: AD081126006216G<\/div>/);
});

test("the invoice CSV ledger carries the LUT on every row, for both kinds", () => {
  for (const kind of ["employer", "intern"] as const) {
    const csv = toCsv([row(), row({ currency: "USD", buyer: { name: "Acme", country: "United States" } })], invoiceCsvColumns(kind));
    const [head, ...body] = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    assert.ok(head.split(",").includes("LUT number"), `${kind}: header`);
    assert.equal(body.length, 2);
    for (const line of body) assert.ok(line.split(",").includes(LUT_NUMBER), `${kind}: row`);
  }
});

/* ── Part 2: repo scan ─────────────────────────────────────────────────────── */

const SRC = join(import.meta.dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (f: string) => relative(SRC, f).split(sep).join("/");
const all = files(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");

/** Every file that builds an invoice document (HTML, PDF or CSV). A new one must be added here AND reference LUT_NUMBER. */
const GENERATORS: Record<string, number> = {
  // path under src/ -> how many separate invoice documents it builds (each needs its own LUT_NUMBER reference)
  "lib/invoice.ts": 1, // taxInvoiceHtml: the one HTML/print/PDF template (employer, subscription, college seat, intern, admin ledgers)
  "lib/admin/invoice-csv.ts": 1, // Orders / Intern invoices ledger CSV
  "app/api/admin/export/route.ts": 3, // payments CSVs: college seats, employer orders, intern fees
};

/** What marks a file as building an invoice document. */
const GENERATOR_MARKERS = [
  /export function taxInvoiceHtml\b/, // an HTML invoice template
  /<title>Invoice\b/, // a hand-rolled invoice page
  /header:\s*["']Invoice number["']/, // an invoice CSV (one column per invoice)
  /from\s+["'](?:pdf-lib|jspdf|pdfkit|@react-pdf\/renderer|pdfmake)["']/, // a PDF writer
];

test("scan: every file that builds an invoice is on the explicit list", () => {
  const found = all.filter((f) => GENERATOR_MARKERS.some((m) => m.test(read(f)))).map(rel).sort();
  // pdf-lib is used by the AI-report redactor, which is not an invoice: it is excluded by name, not by pattern.
  const unlisted = found.filter((f) => !(f in GENERATORS) && f !== "lib/admin/ai-report/redact.ts");
  assert.deepEqual(unlisted, [], `New invoice generator(s) not in GENERATORS: ${unlisted.join(", ")}. Add them there and print LUT_NUMBER.`);
  for (const f of Object.keys(GENERATORS)) assert.ok(found.includes(f), `${f} is listed but no longer looks like a generator; update the list`);
});

test("scan: every listed generator references LUT_NUMBER (once per document it builds)", () => {
  for (const [f, docs] of Object.entries(GENERATORS)) {
    const uses = (read(join(SRC, f)).match(/\bLUT_NUMBER\b/g) ?? []).length;
    assert.ok(uses >= docs, `${f} builds ${docs} invoice document(s) but references LUT_NUMBER ${uses} time(s)`);
  }
});

test("scan: the number is written once, in lib/gst.ts", () => {
  const stray = all.filter((f) => rel(f) !== "lib/gst.ts" && read(f).includes(LUT_NUMBER)).map(rel);
  assert.deepEqual(stray, []);
});
