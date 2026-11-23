import type { PlacementLedger } from "@/lib/dues";

export type HireRow = {
  proposalId: string;
  internId: string;
  candidateName: string;
  candidateEmail?: string | null;
  projectName: string;
  roleTitle: string;
  fullTime: boolean;
  annualCtcMinor: number | null;
  /** Minor units of `currency`; null when the offer has none. */
  monthlyMinor: number | null;
  currency: "INR" | "USD";
  months: number;
  startDate: string | null;
  ledger: PlacementLedger;
  /** The one-time hiring fee inside this hire's total; 0 for a full-time hire, whose whole charge is the fee. Minor units. */
  feeMinor: number;
  /** A paid internship that can still get a full-time offer. */
  canOfferFullTime: boolean;
};

export type InvoiceRow = {
  id: string;
  /** What the customer knows it by: FT/… or a legacy DDMMYY-NN. */
  number: string;
  orderId: string;
  paymentId: string | null;
  paidAt: string | null;
  amountMinor: number;
  /** Refunded out of this order (0 when none); the invoice itself stands as issued. */
  refundedMinor?: number;
  currency: string;
  /** The promo code this payment used (or legacy's "Discount (10%)"), and what it took off, in `currency` minor units; null / 0 when none. */
  promoCode?: string | null;
  discountMinor?: number;
  candidates: string[];
  projects: string[];
  /** Finished invoice HTML, rendered on the server. */
  html: string;
  /** Set on a monthly payroll invoice from Findtern (full-time hire abroad): issued and awaiting the wire ("due") or paid. Absent on a tax invoice. */
  payroll?: { status: "due" | "paid"; dueOn: string; issuedAt: string; /** "1 – 30 Nov 2026" */ period: string };
};
