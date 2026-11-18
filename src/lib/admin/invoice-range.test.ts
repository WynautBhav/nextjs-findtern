import assert from "node:assert/strict";
import { test } from "node:test";

import { filterInvoiceRows, invoiceFilters, type AdminInvoiceRow } from "./invoice-rows.ts";

const row = (id: string, paidAt: string | null, createdAt: string | null = paidAt): AdminInvoiceRow =>
  ({ id, orderId: id, amountMinor: 100, currency: "INR", status: "paid", paidAt, createdAt, partyId: id, partyName: id, partyEmail: `${id}@x.dev`, buyer: { name: id } }) as AdminInvoiceRow;

// IST days: 01 Nov 00:00 IST = 31 Oct 18:30Z.
const rows = [
  row("before", "2026-10-31T18:29:59Z"),
  row("first-edge", "2026-10-31T18:30:00Z"),
  row("mid", "2026-11-10T08:00:00Z"),
  row("last-edge", "2026-11-15T18:29:59Z"),
  row("after", "2026-11-15T18:30:00Z"),
  row("undated", null, null),
];
const ids = (p: Record<string, string>) => filterInvoiceRows(rows, invoiceFilters(p), "FT-INT").map((r) => r.id);

test("from and to are inclusive IST days", () => {
  assert.deepEqual(ids({ from: "2026-11-01", to: "2026-11-15" }), ["first-edge", "mid", "last-edge"]);
});

test("one open end keeps the other bound only; undated rows leave once a bound is set", () => {
  assert.deepEqual(ids({ from: "2026-11-15" }), ["last-edge", "after"]);
  assert.deepEqual(ids({ to: "2026-11-01" }), ["before", "first-edge"]);
  assert.equal(ids({}).length, 6);
});

test("a malformed or reversed range never throws: bad dates are ignored, reversed matches nothing", () => {
  assert.equal(ids({ from: "01/11/2026", to: "x" }).length, 6);
  assert.deepEqual(ids({ from: "2026-11-15", to: "2026-11-01" }), []);
});
