import { test } from "node:test";
import assert from "node:assert/strict";

import { splitGst } from "../gst.ts";
import { seatBatchAmount } from "./money.ts";
import { seatInvoiceInput } from "./seat-invoice.ts";

const seller = { name: "Findtern", address: "Jaipur", gstin: "08AAACF0000A1Z5", email: "a@b.in" };
const batch = { id: "b1", seats: 300, amountMinor: seatBatchAmount(300), invoiceNumber: "061126-1", paidAt: new Date("2026-11-06T05:00:00Z"), createdAt: new Date("2026-11-01") };
const college = (state: string | null, gstin: string | null = null) => ({ name: "IIT X", gstin, city: "Pune", state });

test("total is seats x 800 rupees", () => {
  assert.equal(seatInvoiceInput(batch, college("Rajasthan"), seller).amountMinor, 300 * 80000);
});

test("same state splits CGST+SGST, another state IGST", () => {
  const intra = seatInvoiceInput(batch, college("Rajasthan"), seller);
  const inter = seatInvoiceInput(batch, college("Maharashtra"), seller);
  assert.equal(splitGst(intra.amountMinor, intra.buyer.place).mode, "intra");
  assert.equal(splitGst(inter.amountMinor, inter.buyer.place).mode, "inter");
});

test("no GSTIN falls back to the state; GSTIN wins when present", () => {
  assert.deepEqual(seatInvoiceInput(batch, college("Maharashtra"), seller).buyer.place, { kind: "india", stateCode: "27", stateName: "Maharashtra" });
  assert.equal(seatInvoiceInput(batch, college(null), seller).buyer.place.kind, "unknown");
  assert.equal((seatInvoiceInput(batch, college("Rajasthan", "27ABCDE1234F1Z5"), seller).buyer.place as { stateCode: string }).stateCode, "27");
});
