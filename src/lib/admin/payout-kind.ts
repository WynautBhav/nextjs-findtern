/** What an `intern_payouts` row is: a stipend month, or the Findtern-paid completion bonus. */
export function payoutKindLabel(kind: string | null | undefined): string {
  return kind === "completion_bonus" ? "Completion bonus" : "Stipend";
}
