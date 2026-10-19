import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { stipendDues } from "@/lib/admin/stipend-dues";

/**
 * Legacy queued the following month as pending when a month was paid
 * (routes.ts:8615-8657). Only for a payout filed against a hired placement,
 * only while months remain, never twice (a pending payout for the placement
 * already counts), and never for a ₹0 share (score below 6).
 */
export async function queueNextMonth(
  db: ReturnType<typeof getDb>,
  internId: string,
  paid: { method: string; notes: string | null; raw: Record<string, unknown> | null },
) {
  const raw = paid.raw ?? {};
  const proposalId = typeof raw.proposalId === "string" ? raw.proposalId : null;
  if (!proposalId) return null;
  const [[proposal], payouts, [onboarding]] = await Promise.all([
    db
      .select({
        id: schema.proposals.id,
        status: schema.proposals.status,
        employerId: schema.proposals.employerId,
        offerDetails: schema.proposals.offerDetails,
        currency: schema.proposals.currency,
        internId: schema.proposals.internId,
      })
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId))
      .limit(1),
    db
      .select({ status: schema.internPayouts.status, raw: schema.internPayouts.raw })
      .from(schema.internPayouts)
      .where(eq(schema.internPayouts.internId, internId)),
    db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, internId))
      .limit(1),
  ]);
  if (!proposal || proposal.internId !== internId) return null;
  const scoreRaw = Number(((onboarding?.extraData ?? {}) as Record<string, unknown>).findternScore);
  const [due] = stipendDues([proposal], payouts, Number.isFinite(scoreRaw) ? scoreRaw : null);
  if (!due || due.pending || due.remainingMonths === 0 || due.monthlyShareMinor <= 0 || !due.nextDate) return null;

  const [created] = await db
    .insert(schema.internPayouts)
    .values({
      internId,
      amountMinor: due.monthlyShareMinor,
      currency: "INR",
      status: "pending",
      method: paid.method || "bank",
      notes: paid.notes,
      raw: { proposalId, employerId: proposal.employerId ?? raw.employerId, scheduledFor: due.nextDate, source: "auto-next-month" },
    })
    .returning({ id: schema.internPayouts.id, scheduledFor: sql<string>`${schema.internPayouts.raw}->>'scheduledFor'` });
  return created ?? null;
}
