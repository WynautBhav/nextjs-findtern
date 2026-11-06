/** What an `intern_payouts` row is: a stipend month, or the Findtern-paid completion bonus. */
export function payoutKindLabel(kind: string | null | undefined): string {
  return kind === "completion_bonus" ? "Completion bonus" : "Stipend";
}

import { bankProblem } from "../onboarding.ts";

/**
 * Whether a payout may be marked paid for an intern: bank details must be on file, so a "paid" stipend can be
 * traced to an account. Reads `bankDetails`, falling back to the legacy `bank` key (as the intern form does).
 */
export function canPayOut(extra: Record<string, unknown> | null | undefined): { ok: true } | { ok: false; error: string } {
  const raw = extra?.bankDetails ?? extra?.bank;
  const bank = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const parts = { accountHolderName: text(bank.accountHolderName), bankName: text(bank.bankName), accountNumber: text(bank.accountNumber), ifscCode: text(bank.ifscCode), upiId: text(bank.upiId) };
  if (!Object.values(parts).some((v) => v.trim())) return { ok: false, error: "Intern has no bank details on file" };
  const problem = bankProblem(parts);
  return problem ? { ok: false, error: `Intern's bank details are incomplete: ${problem}` } : { ok: true };
}
