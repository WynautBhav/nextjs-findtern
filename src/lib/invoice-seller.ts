import { sellerGstin } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";
import type { InvoiceWire } from "@/lib/invoice-premium";

const env = (name: string) => process.env[name]?.trim() || undefined;

/**
 * International wire details for USD export invoices. Only returned when the
 * SWIFT code (or an explicit wire account number) is configured: a USD wire
 * without SWIFT is unusable and we never invent one. Bank name and account
 * number fall back to the domestic bank block above.
 */
function wireDetails(bank: NonNullable<InvoiceSeller["bank"]>): InvoiceWire | undefined {
  const swift = env("INVOICE_SELLER_SWIFT");
  const accountNumber = env("INVOICE_SELLER_WIRE_ACCOUNT_NUMBER");
  if (!swift && !accountNumber) return undefined;
  return {
    accountName: env("INVOICE_SELLER_WIRE_ACCOUNT_NAME") ?? bank.accountName,
    bankName: env("INVOICE_SELLER_WIRE_BANK") ?? bank.bankName,
    accountNumber: accountNumber ?? bank.accountNumber,
    swift,
    bankAddress: env("INVOICE_SELLER_WIRE_BANK_ADDRESS"),
    intermediaryBank: env("INVOICE_SELLER_INTERMEDIARY_BANK"),
    intermediarySwift: env("INVOICE_SELLER_INTERMEDIARY_SWIFT"),
  };
}

/**
 * The supplier block on every invoice. Env overrides; the defaults are the
 * legacy invoice's details (owner-confirmed 26 Oct), so a missed env var
 * can't put "GSTIN: not configured" on a tax invoice. Server-only: client
 * invoice views receive this as a prop.
 */
export function getInvoiceSeller(): InvoiceSeller & { wire?: InvoiceWire } {
  const bank = {
    accountName: process.env.FINDTERN_LEGAL_NAME?.trim() || "Findtern Private Limited",
    bankName: process.env.FINDTERN_BANK_NAME?.trim() || "Kotak Mahindra Bank",
    accountNumber: process.env.FINDTERN_BANK_ACCOUNT?.trim() || "5949973545",
    ifsc: process.env.FINDTERN_BANK_IFSC?.trim() || "KKBK0003572",
  };
  return {
    name: process.env.FINDTERN_LEGAL_NAME?.trim() || "Findtern Private Limited",
    address: process.env.FINDTERN_BILLING_ADDRESS?.trim() || "386, Jagatpura, Jaipur, Rajasthan (302017)",
    gstin: sellerGstin(),
    email: process.env.FINDTERN_BILLING_EMAIL?.trim() || "admin@findtern.in",
    // Legacy invoice's "Send payments to" block (owner-confirmed 26 Oct, EMH-08).
    bank,
    wire: wireDetails(bank),
  };
}
