/**
 * The buyer block of an issued invoice. It is frozen into the payment's `raw`
 * (key `invoiceBuyer`) when the invoice number is assigned, so a company that
 * later edits its state or GSTIN can't change an invoice that is already out.
 * Rows from before the snapshot fall back to the live profile.
 */
export type BuyerFields = {
  name: string;
  email?: string | null;
  gstin?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
};

export type LiveEmployerBuyer = {
  companyName?: string | null;
  companyEmail?: string | null;
  gstNumber?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  billingPincode?: string | null;
};

const KEY = "invoiceBuyer";

export function buyerFromEmployer(employer: LiveEmployerBuyer | null | undefined): BuyerFields {
  return {
    name: employer?.companyName ?? "Customer",
    email: employer?.companyEmail ?? null,
    gstin: employer?.gstNumber ?? null,
    city: employer?.city ?? null,
    state: employer?.state ?? null,
    country: employer?.country ?? null,
    pincode: employer?.billingPincode ?? null,
  };
}

/** The object to merge into `raw` when the invoice is issued. */
export function invoiceBuyerPatch(employer: LiveEmployerBuyer | null | undefined): Record<string, BuyerFields> {
  return { [KEY]: buyerFromEmployer(employer) };
}

/** The snapshot if the payment has one, else the company's current profile. */
export function invoiceBuyerOf(raw: unknown, live: LiveEmployerBuyer | null | undefined): BuyerFields {
  const snap = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[KEY] : null;
  if (snap && typeof snap === "object" && typeof (snap as { name?: unknown }).name === "string") {
    return snap as BuyerFields;
  }
  return buyerFromEmployer(live);
}
