import { test } from "node:test";
import assert from "node:assert/strict";

import { splitGst } from "../gst.ts";
import { seatBatchAmount } from "./money.ts";
import { seatInvoiceInput } from "./seat-invoice.ts";

const seller = { name: "Findtern", address: "Jaipur", gstin: "08AAACF0000A1Z5", email: "a@b.in" };
const batch = { id: "b1", seats: 300, amountMinor: seatBatchAmount(300), invoiceNumber: "061126-1", paidAt: new Date("2026-11-06T05:00:00Z"), createdAt: new Date("2026-11-01") };
const college = (state: string | null, gstin: string | null = null) => ({ name: "IIT X", gstin, city: "Pune", state });

test("total is seats x (800 + 18% GST); the taxable value is exactly seats x 800 rupees", () => {
  const inv = seatInvoiceInput(batch, college("Rajasthan"), seller);
  assert.equal(inv.amountMinor, 300 * 94400);
  const split = splitGst(inv.amountMinor, inv.buyer.place);
  assert.deepEqual([split.baseMinor, split.cgstMinor, split.sgstMinor], [300 * 80000, 300 * 7200, 300 * 7200]);
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

test("the batch reference is the invoice's payment id", () => {
  assert.equal(seatInvoiceInput({ ...batch, referenceId: "UTR123" }, college("Rajasthan"), seller).paymentId, "UTR123");
  assert.equal(seatInvoiceInput(batch, college("Rajasthan"), seller).paymentId, null);
});

test("seatInvoiceState (R1-01): the serial decides what a batch shows, not its amount", async () => {
  const { seatInvoiceState } = await import("./seat-invoice.ts");
  assert.equal(seatInvoiceState({ status: "paid", amountMinor: 0, invoiceNumber: "FTN/2026-27/0007" }), "serial", "a free batch that already holds a serial keeps its invoice");
  assert.equal(seatInvoiceState({ status: "paid", amountMinor: 4720, invoiceNumber: "FTN/2026-27/0008" }), "serial");
  assert.equal(seatInvoiceState({ status: "paid", amountMinor: 0, invoiceNumber: null }), "covered");
  assert.equal(seatInvoiceState({ status: "paid", amountMinor: 4720, invoiceNumber: null }), "pending", "never prints 'Invoice null'");
  assert.equal(seatInvoiceState({ status: "pending", amountMinor: 4720, invoiceNumber: null }), "none");
});
