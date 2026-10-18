import { monthsOf } from "./offer.ts";

/**
 * Monthly-plan placements: how many months each hired proposal has paid for,
 * read from paid employer orders (`raw.notes.paymentMode === "monthly"`).
 * A proposal with at least one monthly payment and fewer than its duration
 * owes the next month.
 */

type PaymentLike = { status: string; raw: unknown };
type ProposalLike = { id: string; status: string; offerDetails: unknown };

function notesOf(raw: unknown): { ids: string[]; mode: string; dueIds: string[] } {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const n = r.notes ?? r.order?.notes ?? {};
  let ids = n.proposalIds ?? n.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  const due = Array.isArray(n.dueProposalIds) ? n.dueProposalIds.map(String) : [];
  return { ids: Array.isArray(ids) ? ids.map(String) : [], mode: String(n.paymentMode ?? "upfront"), dueIds: due };
}

export type Due = { proposalId: string; monthsPaid: number; months: number };

export function monthlyDues(proposals: ProposalLike[], payments: PaymentLike[]): Due[] {
  const paid = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const { ids, mode, dueIds } = notesOf(p.raw);
    // A monthly order pays one month of each line; an upfront order can still
    // carry next-month dues for monthly placements (dueProposalIds).
    for (const id of mode === "monthly" ? ids : dueIds) paid.set(id, (paid.get(id) ?? 0) + 1);
  }
  return proposals
    .filter((p) => p.status === "hired" && paid.has(p.id))
    .map((p) => ({
      proposalId: p.id,
      monthsPaid: paid.get(p.id)!,
      months: monthsOf(((p.offerDetails ?? {}) as Record<string, unknown>).duration),
    }))
    .filter((d) => d.monthsPaid < d.months);
}
