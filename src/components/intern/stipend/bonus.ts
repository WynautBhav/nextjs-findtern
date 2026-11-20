import { formatMoney } from "../../../lib/format.ts";
import { payoutState, readScheduledForDate, type PayoutRow } from "../../../lib/journey.ts";

/**
 * The completion bonus on the intern's own Stipend page.
 *
 * A bonus is an `intern_payouts` row (kind "completion_bonus") tied to its hire
 * by `bonus_proposal_id`, once per hire in the database. It carries no
 * `raw.proposalId`, so the stipend plans never see it; this reads it apart and
 * hands it to the internship it belongs to. Bonuses are always INR.
 */
const INR = "INR";

export type BonusEntry = {
  id: string;
  amountMinor: number;
  state: "paid" | "pending" | "failed" | null;
  /** Paid date when paid, scheduled date when pending and one is set, else null. */
  when: Date | null;
  referenceId: string | null;
};

export type HireBonus = {
  proposalId: string;
  entries: BonusEntry[];
  paidMinor: number;
  pendingMinor: number;
  failedMinor: number;
};

const amount = (p: PayoutRow) => Math.max(0, Math.round(p.amountMinor ?? 0));

/** The hire a bonus row is for: `bonusProposalId`, else `raw.proposalId` (as payments.ts reads it). */
function bonusHire(p: PayoutRow): string {
  const raw = p.raw && typeof p.raw === "object" ? (p.raw as { proposalId?: unknown }) : null;
  return String(p.bonusProposalId ?? raw?.proposalId ?? "").trim();
}

const isInrBonus = (p: PayoutRow) => p.kind === "completion_bonus" && (p.currency ?? INR).toUpperCase() === INR;

const ORDER = { paid: 0, pending: 1, failed: 2 } as const;

/** Bonuses grouped by the hire they belong to (paid first, then scheduled, then failed). Hires without one are absent. */
export function completionBonusesByHire(payouts: PayoutRow[]): Map<string, HireBonus> {
  const out = new Map<string, HireBonus>();
  for (const p of payouts) {
    if (!isInrBonus(p)) continue;
    const proposalId = bonusHire(p);
    if (!proposalId) continue;
    const state = payoutState(p.status);
    const hb = out.get(proposalId) ?? { proposalId, entries: [], paidMinor: 0, pendingMinor: 0, failedMinor: 0 };
    const n = amount(p);
    if (state === "paid") hb.paidMinor += n;
    else if (state === "pending") hb.pendingMinor += n;
    else if (state === "failed") hb.failedMinor += n;
    hb.entries.push({
      id: p.id,
      amountMinor: n,
      state,
      when: state === "paid" ? (p.paidAt ?? p.createdAt) : state === "pending" ? readScheduledForDate(p) : null,
      referenceId: p.referenceId,
    });
    out.set(proposalId, hb);
  }
  for (const hb of out.values()) {
    hb.entries.sort((a, b) => (a.state ? ORDER[a.state] : 3) - (b.state ? ORDER[b.state] : 3) || (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
  }
  return out;
}

/** Every INR completion bonus on the account by state, tied to a hire or not: what the ledger below adds up too. */
export function bonusTotals(payouts: PayoutRow[]): { paidMinor: number; pendingMinor: number } {
  let paidMinor = 0;
  let pendingMinor = 0;
  for (const p of payouts) {
    if (!isInrBonus(p)) continue;
    const state = payoutState(p.status);
    if (state === "paid") paidMinor += amount(p);
    else if (state === "pending") pendingMinor += amount(p);
  }
  return { paidMinor, pendingMinor };
}

/**
 * "Stipend and completion bonus: ₹15,000 paid · ₹2,500 scheduled": stipend paid/scheduled from the plans plus the bonuses.
 * Null when no bonus is paid or scheduled, so nobody without one sees an extra line.
 */
export function totalWithBonusLine(stipend: { paidMinor: number; pendingMinor: number }, bonus: { paidMinor: number; pendingMinor: number }): string | null {
  if (bonus.paidMinor + bonus.pendingMinor <= 0) return null;
  const money = (n: number) => formatMoney(n, INR, { zeroLabel: false });
  const parts = [`${money(stipend.paidMinor + bonus.paidMinor)} paid`];
  if (stipend.pendingMinor + bonus.pendingMinor > 0) parts.push(`${money(stipend.pendingMinor + bonus.pendingMinor)} scheduled`);
  return `Including completion bonus: ${parts.join(" · ")}`;
}
