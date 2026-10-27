import { sellerGstin } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";

/**
 * The supplier block on every invoice. Env overrides; the defaults are the
 * legacy invoice's details (owner-confirmed 26 Oct), so a missed env var
 * can't put "GSTIN: not configured" on a tax invoice. Server-only: client
 * invoice views receive this as a prop.
 */
export function getInvoiceSeller(): InvoiceSeller {
  return {
    name: process.env.FINDTERN_LEGAL_NAME?.trim() || "Findtern Private Limited",
    address: process.env.FINDTERN_BILLING_ADDRESS?.trim() || "386, Jagatpura, Jaipur, Rajasthan (302017)",
    gstin: sellerGstin(),
    email: process.env.FINDTERN_BILLING_EMAIL?.trim() || "admin@findtern.in",
    // Legacy invoice's "Send payments to" block (owner-confirmed 26 Oct, EMH-08).
    bank: {
      accountName: process.env.FINDTERN_LEGAL_NAME?.trim() || "Findtern Private Limited",
      bankName: process.env.FINDTERN_BANK_NAME?.trim() || "Kotak Mahindra Bank",
      accountNumber: process.env.FINDTERN_BANK_ACCOUNT?.trim() || "5949973545",
      ifsc: process.env.FINDTERN_BANK_IFSC?.trim() || "KKBK0003572",
    },
  };
}
