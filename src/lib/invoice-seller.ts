import { sellerGstin } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";

/**
 * The supplier block on every invoice, from env so the real GSTIN and
 * registered address never live in source. Server-only: client invoice
 * views receive this as a prop.
 */
export function getInvoiceSeller(): InvoiceSeller {
  return {
    name: process.env.FINDTERN_LEGAL_NAME?.trim() || "Findtern Private Limited",
    address: process.env.FINDTERN_BILLING_ADDRESS?.trim() || "Rajasthan, India",
    gstin: sellerGstin(),
    email: process.env.FINDTERN_BILLING_EMAIL?.trim() || "billing@findtern.in",
  };
}
