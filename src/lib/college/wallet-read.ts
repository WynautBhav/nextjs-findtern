import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { availableMinor } from "./money";

/**
 * The one read of a college's wallet, shared by the TPO earnings page and the
 * admin panel so the two can never show different numbers.
 */

export type WalletSummary = {
  balanceMinor: number;
  openRequest: { id: string; amountMinor: number; createdAt: Date } | null;
  availableMinor: number;
};

export type WalletLedgerRow = {
  id: string;
  kind: "incentive" | "adjustment" | "payout" | (string & {});
  /** Signed paise: credits positive, paid withdrawals negative. */
  amountMinor: number;
  at: Date;
  /** incentive rows only; never a company name (owner answer 26). */
  student: string | null;
  role: string | null;
  bandId: string | null;
  /** payout rows only. */
  referenceId: string | null;
  /** A rejected request, shown at ₹0 with its reason (kind "payout_rejected"). */
  rejectReason?: string | null;
};

export async function walletSummary(collegeId: string): Promise<WalletSummary> {
  const db = getDb();
  const w = schema.collegeWalletEntries;
  const p = schema.collegePayouts;
  const [[bal], [open]] = await Promise.all([
    db.select({ sum: sql<number>`coalesce(sum(${w.amountMinor}), 0)::int` }).from(w).where(eq(w.collegeId, collegeId)),
    db
      .select({ id: p.id, amountMinor: p.amountMinor, createdAt: p.createdAt })
      .from(p)
      .where(and(eq(p.collegeId, collegeId), eq(p.status, "requested")))
      .limit(1),
  ]);
  const balanceMinor = bal?.sum ?? 0;
  return { balanceMinor, openRequest: open ?? null, availableMinor: availableMinor(balanceMinor, open?.amountMinor ?? 0) };
}

/**
 * Newest first: wallet entries (credits and paid-withdrawal debits) plus
 * rejected requests at ₹0. Open requests are not rows here; `walletSummary`
 * reports them.
 */
export async function walletLedger(collegeId: string, limit = 100): Promise<WalletLedgerRow[]> {
  const db = getDb();
  const w = schema.collegeWalletEntries;
  const p = schema.collegePayouts;
  const [entries, rejected] = await Promise.all([
    db
      .select({
        id: w.id,
        kind: w.kind,
        amountMinor: w.amountMinor,
        at: w.createdAt,
        bandId: w.bandId,
        student: sql<string | null>`case when ${w.kind} = 'incentive' then coalesce(u.first_name || ' ' || u.last_name, 'Student') end`,
        role: sql<string | null>`p.offer_details->>'roleTitle'`,
        referenceId: sql<string | null>`cp.reference_id`,
      })
      .from(w)
      .leftJoin(sql`users u`, sql`u.id = ${w.internId}`)
      .leftJoin(sql`proposals p`, sql`p.id = ${w.proposalId}`)
      .leftJoin(sql`college_payouts cp`, sql`cp.id = ${w.payoutId}`)
      .where(eq(w.collegeId, collegeId))
      .orderBy(desc(w.createdAt))
      .limit(limit),
    db
      .select({ id: p.id, at: p.updatedAt, notes: p.notes })
      .from(p)
      .where(and(eq(p.collegeId, collegeId), eq(p.status, "rejected")))
      .orderBy(desc(p.updatedAt))
      .limit(limit),
  ]);
  const rows: WalletLedgerRow[] = [
    ...entries.map((e) => ({ ...e, rejectReason: null })),
    ...rejected.map((r) => ({
      id: r.id,
      kind: "payout_rejected",
      amountMinor: 0,
      at: r.at,
      student: null,
      role: null,
      bandId: null,
      referenceId: null,
      rejectReason: r.notes,
    })),
  ];
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
