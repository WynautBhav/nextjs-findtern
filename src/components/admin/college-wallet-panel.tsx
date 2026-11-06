import type { WalletLedgerRow, WalletSummary } from "@/lib/college/wallet-read";

/**
 * STUB (WP0). WP-W owns this file and fills in the component; the prop types are the contract.
 * Admin: a college's wallet (balance, open request, ledger, masked bank) and the Mark paid / Reject controls.
 */
export type CollegeWalletPanelProps = {
  collegeId: string;
  summary: WalletSummary;
  ledger: WalletLedgerRow[];
  /** Masked bank card; null when the college has no bank on file. */
  bank: { holder: string; bankName: string; last4: string; ifsc: string } | null;
  /** Mark paid / Reject render only when true. */
  canMoney: boolean;
};

export function CollegeWalletPanel(props: CollegeWalletPanelProps) {
  void props;
  return null;
}
