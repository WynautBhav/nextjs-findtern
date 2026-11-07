import type { EntryState } from "./validate.ts";
import type { MatchResult } from "./match.ts";

export type PlanEntry = { rowNo: number; email: string; state: EntryState; match: MatchResult; internId?: string | null };
export type ConfirmPlan = {
  link: { rowNo: number; internId: string }[];
  needCode: number[];
  reviews: { rowNo: number; candidateInternId: string; kind: "phone_name" }[];
  skipped: number[];
};

/** What confirm would do. Deterministic in row order; already-linked rows are skipped, so a repeat is a no-op. */
export function planConfirm(entries: readonly PlanEntry[]): ConfirmPlan {
  const plan: ConfirmPlan = { link: [], needCode: [], reviews: [], skipped: [] };
  for (const e of [...entries].sort((a, b) => a.rowNo - b.rowNo)) {
    if (e.state !== "valid" || e.internId) {
      plan.skipped.push(e.rowNo);
      continue;
    }
    if (e.match.kind === "email_exact" && e.match.candidates.length === 1) plan.link.push({ rowNo: e.rowNo, internId: e.match.candidates[0] });
    else if (e.match.kind === "phone_name_suggestion") {
      plan.needCode.push(e.rowNo);
      for (const c of e.match.candidates) plan.reviews.push({ rowNo: e.rowNo, candidateInternId: c, kind: "phone_name" });
    } else if (e.match.kind === "ambiguous") plan.skipped.push(e.rowNo);
    else plan.needCode.push(e.rowNo);
  }
  return plan;
}
