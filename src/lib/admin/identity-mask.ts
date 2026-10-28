/**
 * Identity numbers on the admin candidate page (QA-003). Aadhaar, PAN and the
 * bank account number leave the server masked to their last four; the full
 * value comes only from the audit-logged reveal route, one field at a time.
 * Masking in the browser was not enough: the full numbers were in the page's
 * RSC payload whether or not the screen showed them.
 */

export const REVEAL_FIELDS = ["aadhaar", "pan", "bank"] as const;
export type RevealField = (typeof REVEAL_FIELDS)[number];

/** "•••• 0123"; empty stays empty, four or fewer characters hide entirely. */
export function maskTail(value: unknown): string {
  const v = typeof value === "string" ? value.replace(/\s/g, "") : "";
  if (!v) return "";
  if (v.length <= 4) return "••••";
  return `•••• ${v.slice(-4)}`;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** The bank details object, wherever the row keeps it (legacy `bank`, current `bankDetails`). */
function bankOf(extra: Obj): Obj {
  return obj(extra.bankDetails ?? extra.bank);
}

/** The full value of one field, read from an onboarding row. */
export function identityValue(
  row: { aadhaarNumber?: string | null; panNumber?: string | null; extraData?: unknown } | null | undefined,
  field: RevealField,
): string {
  if (!row) return "";
  const extra = obj(row.extraData);
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (field === "aadhaar") return text(row.aadhaarNumber) || text(extra.aadhaarNumber);
  if (field === "pan") return text(row.panNumber) || text(extra.panNumber);
  return text(bankOf(extra).accountNumber);
}

/** A copy of the onboarding row that is safe to send to the browser. */
export function redactIdentity<T extends { aadhaarNumber?: string | null; panNumber?: string | null; extraData?: unknown }>(
  row: T,
): T {
  const extra = { ...obj(row.extraData) };
  if ("aadhaarNumber" in extra) extra.aadhaarNumber = maskTail(extra.aadhaarNumber);
  if ("panNumber" in extra) extra.panNumber = maskTail(extra.panNumber);
  for (const key of ["bankDetails", "bank"] as const) {
    if (extra[key] && typeof extra[key] === "object") {
      const bank = { ...obj(extra[key]) };
      if ("accountNumber" in bank) bank.accountNumber = maskTail(bank.accountNumber);
      extra[key] = bank;
    }
  }
  return {
    ...row,
    aadhaarNumber: row.aadhaarNumber ? maskTail(row.aadhaarNumber) : row.aadhaarNumber,
    panNumber: row.panNumber ? maskTail(row.panNumber) : row.panNumber,
    extraData: extra,
  };
}
