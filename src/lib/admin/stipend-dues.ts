import { internStipendInrMinor, parseOffer } from "../offer.ts";
import { isHiredProposal } from "../hire-status.ts";

/**
 * What Findtern owes an intern per hired placement, month by month (legacy
 * `GET /api/admin/interns/:id/employer-dues`, routes.ts:17013-17396, and the
 * dues table in admin-intern-detail.tsx).
 *
 * The monthly share is `internStipendInrMinor` (half the employer's monthly
 * amount in INR, ₹0 for a scored candidate below 6). Month `k` is due on the
 * start date + `k` months - stipends are paid at the end of each month worked.
 * Full-time offers have no stipend and are left out.
 */

type ProposalLike = {
  id: string;
  status: string;
  employerId: string | null;
  offerDetails: unknown;
  currency?: string | null;
  hiredAt?: Date | string | null;
};
type PayoutLike = { status: string; raw: unknown };

export type StipendDue = {
  proposalId: string;
  employerId: string;
  startDate: string | null;
  months: number;
  /** INR paise per month; 0 when the candidate is not stipend-eligible. */
  monthlyShareMinor: number;
  paidMonths: number;
  /** A payout already waiting to be paid for this placement. */
  pending: boolean;
  remainingMonths: number;
  remainingMinor: number;
  /** YYYY-MM-DD of the next unpaid month, null when nothing is left. */
  nextDate: string | null;
};

export function addMonthsIso(iso: string | null | undefined, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  // Clamp to the last day of the target month (31 Jan + 1 month = 28/29 Feb).
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, mo, Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

const proposalOf = (raw: unknown) => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = r.proposalId ?? r.proposal_id;
  return typeof id === "string" ? id : null;
};

export function stipendDues(proposals: ProposalLike[], payouts: PayoutLike[], score: number | null): StipendDue[] {
  const paid = new Map<string, number>();
  const pending = new Set<string>();
  for (const p of payouts) {
    const id = proposalOf(p.raw);
    if (!id) continue;
    if (p.status === "paid") paid.set(id, (paid.get(id) ?? 0) + 1);
    else if (p.status === "pending") pending.add(id);
  }
  return proposals
    .filter((p) => isHiredProposal(p))
    .map((p) => ({ p, offer: parseOffer(p.offerDetails, p.currency) }))
    .filter(({ offer }) => !offer.fullTime)
    .map(({ p, offer }) => {
      const months = offer.months;
      const share = internStipendInrMinor(offer, score) ?? 0;
      const paidMonths = Math.min(months, paid.get(p.id) ?? 0);
      const remainingMonths = Math.max(0, months - paidMonths);
      return {
        proposalId: p.id,
        employerId: p.employerId ?? "",
        startDate: offer.startDate,
        months,
        monthlyShareMinor: share,
        paidMonths,
        pending: pending.has(p.id),
        remainingMonths,
        remainingMinor: share * remainingMonths,
        nextDate: remainingMonths > 0 ? addMonthsIso(offer.startDate, paidMonths + 1) : null,
      };
    });
}

/**
 * What is still owed to an intern across their placements: every unpaid
 * month at their share, from the dues table - not just payout rows already
 * created, which made a hired intern with no payout scheduled read as owed
 * nothing. Payouts not tied to a placement are added on top.
 */
export function owedMinor(dues: StipendDue[], unlinkedPendingMinor: number): number {
  return dues.reduce((sum, d) => sum + d.remainingMinor, 0) + unlinkedPendingMinor;
}
