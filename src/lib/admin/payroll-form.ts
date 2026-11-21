/**
 * The Prepare-invoice form's arithmetic, kept out of the component so it is tested: dollars as typed become whole
 * cents, the total is the sum of the lines, and the request body is exactly what POST /api/admin/invoices/payroll
 * takes. Pure, and free of server imports (the dialog is a client component).
 */

export type FormLine = { key: "salary" | "payroll_fee" | "extra"; label: string; detail: string; amount: string };

/** "4,000", "4000.5", "$12.50" -> cents; null when it is not a plain amount of dollars and cents, zero or more. */
export function dollarsToMinor(input: string): number | null {
  const s = input.replace(/[\s,$]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export const minorToDollars = (minor: number): string => (minor / 100).toFixed(2);

/** Sum of the valid lines; a line with an amount that does not parse counts as 0 (the form refuses to issue it). */
export function formTotalMinor(lines: readonly Pick<FormLine, "amount">[]): number {
  return lines.reduce((sum, l) => sum + (dollarsToMinor(l.amount) ?? 0), 0);
}

/** The first thing wrong with the form, in words, or null when it can be issued. */
export function formProblem(lines: readonly FormLine[], dueOn: string, issueOn: string): string | null {
  if (lines.length === 0) return "Add at least one line.";
  for (const l of lines) {
    if (!l.label.trim()) return "Every line needs a label.";
    if (dollarsToMinor(l.amount) === null) return `"${l.label.trim()}" needs an amount in dollars, like 4000 or 12.50.`;
  }
  if (formTotalMinor(lines) <= 0) return "The total must be above $0.00.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return "Pick a due date.";
  if (dueOn < issueOn) return "The due date cannot be before today.";
  return null;
}

/** `YYYY-MM-DD` plus whole days, in UTC date arithmetic (no timezone drift). */
export function addDays(isoDayValue: string, days: number): string {
  const d = new Date(`${isoDayValue}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function issueBody(i: { proposalId: string; period: { start: string; end: string }; lines: readonly FormLine[]; dueOn: string; note: string }) {
  return {
    proposalId: i.proposalId,
    period: i.period,
    lines: i.lines.map((l) => ({
      key: l.key,
      label: l.label.trim(),
      ...(l.detail.trim() ? { detail: l.detail.trim() } : {}),
      amountMinor: dollarsToMinor(l.amount) ?? 0,
    })),
    dueOn: i.dueOn,
    ...(i.note.trim() ? { note: i.note.trim() } : {}),
  };
}
