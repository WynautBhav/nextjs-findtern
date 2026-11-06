/**
 * STUB (WP0). WP-S owns this file and fills in the component; the prop types are the contract.
 * Admin: a college's seat batches, the "New batch" form and the Mark paid / Void / Invoice controls.
 */
export type SeatBatchRow = {
  id: string;
  seats: number;
  amountMinor: number;
  status: "pending" | "paid" | "void" | (string & {});
  method: string | null;
  referenceId: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
  /** Server-rendered invoice HTML for a paid batch, passed down for `downloadInvoice`. */
  invoiceHtml?: string | null;
};

export type CollegeSeatBatchesProps = {
  collegeId: string;
  batches: SeatBatchRow[];
  /** The college's TPO code and its seats; null when it has no code yet. */
  seat: { code: string; cap: number | null; used: number } | null;
  /** Money controls (create, mark paid, void) render only when true. */
  canMoney: boolean;
};

export function CollegeSeatBatches(props: CollegeSeatBatchesProps) {
  void props;
  return null;
}
