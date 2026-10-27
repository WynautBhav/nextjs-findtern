import { lineCharge } from "./checkout.ts";
import { monthsOf, parseOffer } from "./offer.ts";

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

/* ── Placement ledger (EMH-11) ──────────────────────────────────────────
 * Legacy's "Upcoming payments" listed every hire with its total, what was
 * paid, what is left, the dates paid and the next date due. Worked out from
 * the offer (what the hire costs) and the paid orders (which months they
 * covered); old multi-hire orders can't be split per hire by amount, so the
 * offer is the source of the figures. */

type PaidOrderLike = PaymentLike & { paidAt?: Date | string | null };
type HireLike = ProposalLike & { currency?: string | null };

export type PlacementLedger = {
  proposalId: string;
  plan: "upfront" | "monthly" | "full_time" | "unpaid";
  currency: "INR" | "USD";
  /** Whole engagement incl. the one-time hiring fee (or the full-time fee). Minor units. */
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  months: number;
  monthsPaid: number;
  /** ISO times of the payments that covered this hire, oldest first. */
  paidOn: string[];
  /** YYYY-MM-DD the next month falls due (start + months paid); null when nothing is left. */
  nextDue: string | null;
  /** YYYY-MM-DD the engagement ends (start + months); null without a start date or for full time. */
  endsOn: string | null;
  status: "fully_paid" | "partially_paid" | "unpaid";
};

function addMonths(isoDay: string | null, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDay ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(Number(m[3]), last))).toISOString().slice(0, 10);
}

export function placementLedger(hire: HireLike, payments: readonly PaidOrderLike[]): PlacementLedger {
  const offer = parseOffer(hire.offerDetails, hire.currency);
  const upfront = lineCharge(offer, 10, "upfront");
  const monthly = lineCharge(offer, 10, "monthly", { firstPayment: false });
  let upfrontPaid = false;
  let monthsPaid = 0;
  const paidOn: string[] = [];
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const { ids, mode, dueIds } = notesOf(p.raw);
    const asDue = dueIds.includes(hire.id);
    if (!ids.includes(hire.id) && !asDue) continue;
    if (mode === "monthly" || asDue) monthsPaid += 1;
    else upfrontPaid = true;
    const at = p.paidAt ? new Date(p.paidAt) : null;
    if (at && !Number.isNaN(at.getTime())) paidOn.push(at.toISOString());
  }
  paidOn.sort();
  const months = offer.fullTime ? 1 : offer.months;
  const totalMinor = upfront.totalMinor;
  const plan: PlacementLedger["plan"] = offer.fullTime
    ? "full_time"
    : upfrontPaid
      ? "upfront"
      : monthsPaid > 0
        ? "monthly"
        : "unpaid";
  const paidMinor =
    plan === "upfront" || (plan === "full_time" && paidOn.length > 0)
      ? totalMinor
      : plan === "monthly"
        ? Math.min(totalMinor, upfront.perHireMinor + monthly.totalMinor * monthsPaid)
        : 0;
  const dueMinor = Math.max(0, totalMinor - paidMinor);
  const covered = plan === "upfront" || (plan === "full_time" && paidMinor > 0) ? months : Math.min(monthsPaid, months);
  return {
    proposalId: hire.id,
    plan,
    currency: offer.currency,
    totalMinor,
    paidMinor,
    dueMinor,
    months,
    monthsPaid: covered,
    paidOn,
    nextDue: dueMinor > 0 && covered < months ? addMonths(offer.startDate, covered) : null,
    endsOn: offer.fullTime ? null : addMonths(offer.startDate, offer.months),
    status: dueMinor === 0 && paidMinor > 0 ? "fully_paid" : paidMinor > 0 ? "partially_paid" : "unpaid",
  };
}
