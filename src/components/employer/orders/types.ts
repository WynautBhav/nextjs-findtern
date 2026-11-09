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
  currency: string;
  candidates: string[];
  projects: string[];
  /** Finished invoice HTML, rendered on the server. */
  html: string;
};
