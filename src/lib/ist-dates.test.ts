import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { formatDate, formatMonth, formatRange, shortDate, shortDateTime } from "./format.ts";
import { taxInvoiceHtml } from "./invoice.ts";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** 00:10 on 2 Nov in India, still 1 Nov in UTC and in the US. */
const PAST_MIDNIGHT_IST = new Date("2026-11-01T18:40:00Z");

const ZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"];

test("an India date prints the same whatever the machine's time zone is", () => {
  for (const tz of ZONES) {
    process.env.TZ = tz;
    assert.equal(formatDate(PAST_MIDNIGHT_IST), "2 Nov 2026", `formatDate in ${tz}`);
    assert.equal(formatMonth(PAST_MIDNIGHT_IST), "November 2026", `formatMonth in ${tz}`);
    assert.equal(shortDate(PAST_MIDNIGHT_IST, { day: "numeric", month: "short" }), "2 Nov", `shortDate in ${tz}`);
    assert.match(shortDateTime(PAST_MIDNIGHT_IST, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: false }), /^2 Nov, 00:10$/, `shortDateTime in ${tz}`);
  }
});

test("formatRange compares months in India time, not the machine's", () => {
  // 30 Nov 23:30 UTC is already 1 Dec in India: a different month from 15 Nov.
  const start = new Date("2026-11-15T06:00:00Z");
  const end = new Date("2026-11-30T23:30:00Z");
  for (const tz of ZONES) {
    process.env.TZ = tz;
    assert.equal(formatRange(start, end), "15 Nov to 1 Dec 2026", `formatRange in ${tz}`);
  }
  const sameMonth = formatRange(new Date("2026-11-02T06:00:00Z"), new Date("2026-11-20T06:00:00Z"));
  assert.equal(sameMonth, "2 to 20 Nov 2026", "a shared month is said once");
});

test("a GST invoice is dated in India time, so it matches the Orders list", () => {
  const input = {
    invoiceNo: "FT/2026-27/0010",
    date: PAST_MIDNIGHT_IST,
    orderId: "order_x",
    currency: "INR",
    amountMinor: 3_668_000,
    description: "Hiring services",
    lines: [{ label: "Asha K - Data Analyst Intern", amountMinor: 3_668_000 }],
    seller: {
      name: "Findtern Private Limited",
      address: "386, Jagatpura, Jaipur",
      gstin: "08AAGCF2512F1Z0",
      email: "admin@findtern.in",
      bank: { accountName: "Findtern Private Limited", bankName: "Kotak Mahindra Bank", accountNumber: "5949973545", ifsc: "KKBK0003572" },
    },
    buyer: { name: "Acme", place: { kind: "india" as const, stateCode: "29", stateName: "Karnataka" } },
  };
  for (const tz of ZONES) {
    process.env.TZ = tz;
    assert.match(taxInvoiceHtml(input), /Date:<\/strong>\s*2 November 2026|Date:\s*2 November 2026/, `invoice date in ${tz}`);
  }
});
