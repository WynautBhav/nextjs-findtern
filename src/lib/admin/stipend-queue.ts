import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { nextFromCycle, proposalOf, stipendDues, type StipendDue } from "@/lib/admin/stipend-dues";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Stipend dues for one placement of one intern, from the database. Used by
 * the payout routes to refuse a payout that would pay twice or overpay.
 */
export async function loadPlacementDue(
  db: Db | Tx,
  internId: string,
  proposalId: string,
): Promise<{ due: StipendDue | undefined; proposal: { employerId: string; projectId: string; roleTitle: string } | null }> {
  const [[proposal], payouts, [onboarding]] = await Promise.all([
    db
      .select({
        id: schema.proposals.id,
        status: schema.proposals.status,
        employerId: schema.proposals.employerId,
        projectId: schema.proposals.projectId,
        offerDetails: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
        internId: schema.proposals.internId,
        hiredAt: schema.proposals.hiredAt,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(eq(schema.proposals.id, proposalId))
      .limit(1),
    db
      .select({
        id: schema.internPayouts.id,
        status: schema.internPayouts.status,
        raw: schema.internPayouts.raw,
        amountMinor: schema.internPayouts.amountMinor,
        currency: schema.internPayouts.currency,
        paidAt: schema.internPayouts.paidAt,
        createdAt: schema.internPayouts.createdAt,
      })
      .from(schema.internPayouts)
      .where(eq(schema.internPayouts.internId, internId)),
    db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, internId))
      .limit(1),
  ]);
  if (!proposal || proposal.internId !== internId) return { due: undefined, proposal: null };
  const scoreRaw = Number(((onboarding?.extraData ?? {}) as Record<string, unknown>).findternScore);
  const [due] = stipendDues([proposal], payouts, Number.isFinite(scoreRaw) ? scoreRaw : null);
  const offer = (proposal.offerDetails ?? {}) as Record<string, unknown>;
  return {
    due,
    proposal: {
      employerId: proposal.employerId,
      projectId: proposal.projectId,
      // Legacy reads payout `notes` as the role name in the stipend email (DB-17).
      roleTitle: String(offer.roleTitle ?? "").trim() || proposal.projectName || "",
    },
  };
}

/**
 * Serialises payout writes per placement, so two admins pressing "Create
 * payout" at once cannot both pass the pending check.
 */
export async function lockPlacement(tx: Tx, proposalId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payout:${proposalId}`}))`);
}

/**
 * Queue the next month after a payout is marked paid.
 *
 *  - A payout with a saved schedule (`raw.cycle`, written by legacy and now
 *    by this app too) continues that series as legacy does (ADP-21): same
 *    amount and method, one step later, one month fewer to go.
 *  - A placement payout without one falls back to the dues table: the next
 *    unpaid month at the intern's share (routes.ts:8615-8657).
 *
 * Either way, never for a ₹0 share, never past what is owed, and never when
 * a payout is already pending for the placement.
 */
export async function queueNextMonth(
  db: Db,
  internId: string,
  paid: { amountMinor?: number; currency?: string; method: string; notes: string | null; raw: Record<string, unknown> | null },
) {
  const raw = paid.raw ?? {};
  const proposalId = proposalOf(raw);
  // A saved schedule that has run out ends the series, as in legacy; only a
  // payout with no schedule at all falls back to the dues table.
  const hasCycle = Boolean(raw.cycle && typeof raw.cycle === "object");
  const fromCycle = nextFromCycle({
    amountMinor: paid.amountMinor ?? 0,
    currency: paid.currency ?? "INR",
    method: paid.method,
    raw,
  });
  if (hasCycle && !fromCycle) return null;

  return db.transaction(async (tx) => {
    let values: typeof schema.internPayouts.$inferInsert;
    if (proposalId) {
      await lockPlacement(tx, proposalId);
      const { due, proposal } = await loadPlacementDue(tx, internId, proposalId);
      if (!due || !proposal || due.pending || due.remainingMonths === 0 || due.monthlyShareMinor <= 0 || !due.nextDate) return null;
      const base = {
        internId,
        status: "pending",
        notes: paid.notes ?? (proposal.roleTitle || null),
      };
      if (fromCycle) {
        values = {
          ...base,
          amountMinor: Math.min(fromCycle.amountMinor, due.remainingMinor),
          currency: fromCycle.currency,
          method: fromCycle.method,
          raw: {
            ...raw,
            proposalId,
            scheduledFor: fromCycle.scheduledFor,
            cycle: fromCycle.cycle,
            source: "auto-next-month",
            opsNote: undefined,
          },
        };
      } else {
        values = {
          ...base,
          amountMinor: due.monthlyShareMinor,
          currency: "INR",
          method: paid.method || "bank",
          raw: {
            proposalId,
            employerId: proposal.employerId ?? raw.employerId,
            scheduledFor: due.nextDate,
            source: "auto-next-month",
            // Written like legacy so the series also continues if the legacy
            // admin marks this one paid (DB-18).
            cycle: { remaining: due.remainingMonths, monthsStep: 1, amountMinor: due.monthlyShareMinor, currency: "INR", method: paid.method || "bank" },
          },
        };
      }
    } else {
      // An unlinked series (legacy): continue it as legacy would.
      if (!fromCycle) return null;
      values = {
        internId,
        status: "pending",
        notes: paid.notes,
        amountMinor: fromCycle.amountMinor,
        currency: fromCycle.currency,
        method: fromCycle.method,
        raw: { ...raw, scheduledFor: fromCycle.scheduledFor, cycle: fromCycle.cycle, source: "auto-next-month", opsNote: undefined },
      };
    }
    const [created] = await tx
      .insert(schema.internPayouts)
      .values(values)
      .returning({ id: schema.internPayouts.id, scheduledFor: sql<string>`${schema.internPayouts.raw}->>'scheduledFor'` });
    return created ?? null;
  });
}
