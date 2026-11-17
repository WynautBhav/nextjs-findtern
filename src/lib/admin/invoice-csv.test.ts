import assert from "node:assert/strict";
import { test } from "node:test";

import { toCsv } from "./csv.ts";
import { invoiceCsvColumns } from "./invoice-csv.ts";
import type { AdminInvoiceRow } from "./invoice-rows.ts";

const row = (over: Partial<AdminInvoiceRow>): AdminInvoiceRow => ({
  id: "abcdef12-0000",
  orderId: "order_1",
  paymentId: "pay_1",
  gateway: "razorpay",
  amountMinor: 11_800,
  currency: "INR",
  status: "paid",
  paidAt: "2026-11-16T19:00:00.000Z", // 17 Nov 00:30 IST
  createdAt: "2026-11-16T18:00:00.000Z",
  partyId: "e1",
  partyName: "Acme",
  partyEmail: "ops@acme.test",
  buyer: { name: "Acme", state: "Karnataka" },
  ...over,
});
const cells = (csv: string) => csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean).map((l) => l.split(","));

test("the order export has refund, net and review columns, money in rupees with two decimals", () => {
  const csv = toCsv([row({ refundedMinor: 2_950, needsReview: true, reviewReasons: ["A second payment came in for this order: refund the extra"] })], invoiceCsvColumns("employer"));
  const [head, body] = cells(csv.replace(/"[^"]*"/g, (m) => m.replace(/,/g, ";")));
  const at = (h: string) => body[head.indexOf(h)];
  assert.equal(at("Amount"), "118.00");
  assert.equal(at("Refunded"), "29.50");
  assert.equal(at("Net of refunds"), "88.50");
  assert.equal(at("Needs review"), "yes");
  assert.match(at("Review reasons"), /second payment/);
});

test("dates are India time", () => {
  const [head, body] = cells(toCsv([row({})], invoiceCsvColumns("employer")));
  assert.equal(body[head.indexOf("Paid at (IST)")], "2026-11-17 00:30:00");
});

test("a company name that is a formula is neutralised", () => {
  const csv = toCsv([row({ partyName: '=HYPERLINK("http://evil","x")', partyEmail: "+91@x.test" })], invoiceCsvColumns("employer"));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil"",""x""\)"/);
  assert.match(csv, /,'\+91@x\.test,/);
});

test("USD rows carry no GST and print dollars", () => {
  const [head, body] = cells(toCsv([row({ currency: "USD", amountMinor: 35_000, buyer: { name: "Acme", country: "United States" } })], invoiceCsvColumns("employer")));
  assert.equal(body[head.indexOf("Amount")], "350.00");
  assert.equal(body[head.indexOf("GST")], "0.00");
});

test("the intern ledger keeps its own columns (no Interns column)", () => {
  const head = cells(toCsv([row({})], invoiceCsvColumns("intern")))[0];
  assert.ok(!head.includes("Interns"));
  assert.ok(head.includes("Refunded"));
});
