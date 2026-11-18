/**
 * The bank account the intern has saved, as far as a page may know it: bank, holder, IFSC, UPI and the last four
 * digits of the account number. The full number is read on the server and never leaves it (same rule as the Aadhaar
 * and PAN numbers in onboarding/id-mask.ts).
 */
export type BankOnFile = {
  bankName: string;
  accountHolderName: string;
  accountLast4: string;
  ifscCode: string;
  upiId: string;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Last four digits of whatever was typed ("0012 3456 7890" -> "7890"); empty when there are no digits. */
export function accountLast4(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(-4);
}

/** What a saved account number looks like on screen: "•••• 7890". Never more than the last four digits. */
export function maskAccount(last4: string): string {
  const d = accountLast4(last4);
  return d ? `•••• ${d}` : "";
}

/** Reads the onboarding row's bank object (legacy `bank`, current `bankDetails`) and drops the full number. */
export function bankOnFileOf(extra: Record<string, unknown> | null | undefined): BankOnFile {
  const raw = (extra?.bankDetails ?? extra?.bank ?? {}) as Record<string, unknown>;
  return {
    bankName: text(raw.bankName),
    accountHolderName: text(raw.accountHolderName),
    accountLast4: accountLast4(raw.accountNumber),
    ifscCode: text(raw.ifscCode),
    upiId: text(raw.upiId),
  };
}
