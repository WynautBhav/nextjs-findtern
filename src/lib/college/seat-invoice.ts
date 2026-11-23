import { placeOfSupply } from "../gst.ts";
import type { InvoiceInput, InvoiceSeller } from "../invoice.ts";

/** The GST tax invoice for a paid seat batch. Pure; the amount is GST-inclusive. */
export function seatInvoiceInput(
  batch: { id: string; seats: number; amountMinor: number; invoiceNumber: string | null; referenceId?: string | null; paidAt: Date | null; createdAt: Date },
  college: { name: string; gstin: string | null; city: string | null; state: string | null },
  seller: InvoiceSeller,
): InvoiceInput {
  return {
    invoiceNo: batch.invoiceNumber ?? "",
    date: batch.paidAt ?? batch.createdAt,
    orderId: batch.id,
    paymentId: batch.referenceId ?? null,
    currency: "INR",
    amountMinor: batch.amountMinor,
    description: `Findtern college seats (${batch.seats})`,
    seller,
    buyer: {
      name: college.name,
      gstin: college.gstin,
      city: college.city,
      state: college.state,
      country: "India",
      place: placeOfSupply({ currency: "INR", gstin: college.gstin, state: college.state }),
    },
    sac: "999293",
  };
}

/**
 * What the batch lists show about the paperwork. The serial decides, not the amount:
 * a batch that holds a GST serial keeps its invoice even when credit covered all of it.
 */
export function seatInvoiceState(b: { status: string; amountMinor: number; invoiceNumber: string | null }): "none" | "serial" | "pending" | "covered" {
  if (b.status !== "paid") return "none";
  if (b.invoiceNumber != null) return "serial";
  return b.amountMinor > 0 ? "pending" : "covered";
}
