import { and, eq, isNull, sql } from "drizzle-orm";

import { schema } from "@/lib/db";
import { grantCompletionBonus } from "@/lib/admin/ratings";
import { bonusDueDate, completionBonusPlan, isEngagementComplete } from "@/lib/completion-bonus";
import { isoDay, todayIst } from "@/lib/timesheet-days";
import { parseOffer } from "@/lib/offer";
import { incentivePlan } from "@/lib/college/wallet";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { Tx } from "@/lib/advisory-lock";

export type CompletionResult =
  | { completed: false; reason: "not_found" | "not_hired" | "incomplete" | "already" | "ended" | "full_time" }
  | { completed: true; prev: Record<string, unknown>; next: Record<string, unknown>; internId: string; amountMinor: number; bandId: string; scoreBefore: number | null };

/**
 * Complete a hire when every engagement month has an approved timesheet: +1
 * score (cap 10) and one pending Findtern-paid bonus payout, in the caller's
 * transaction (hold withLock("complete:"+proposalId)). The conditional claim
 * on proposals.completion_bonus_at plus the unique index make it once-only.
 */
export async function completeInternship(tx: Tx, proposalId: string, by: string | null, internId?: string): Promise<CompletionResult> {
  const [p] = await tx.select().from(schema.proposals).where(eq(schema.proposals.id, proposalId)).limit(1);
  if (!p || (internId && p.internId !== internId)) return { completed: false, reason: "not_found" };
  if (p.status !== "hired" && !p.hiredAt) return { completed: false, reason: "not_hired" };
  if (p.completionBonusAt) return { completed: false, reason: "already" };
  const offer = parseOffer(p.offerDetails, p.currency);
  if (offer.fullTime) return { completed: false, reason: "full_time" };
  if (p.endedAt) return { completed: false, reason: "ended" };

  const sheets = await tx
    .select({ s: schema.timesheets.periodStart, e: schema.timesheets.periodEnd })
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.proposalId, proposalId), eq(schema.timesheets.status, "approved")));
  if (!isEngagementComplete(offer.startDate, offer.months, sheets.map((x) => ({ start: isoDay(x.s), end: isoDay(x.e) })), p.hiredAt)) {
    return { completed: false, reason: "incomplete" };
  }

  const [onboarding] = await tx
    .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, p.internId))
    .limit(1)
    .for("update");
  const prev = (onboarding?.extraData as Record<string, unknown>) ?? {};
  const plan = completionBonusPlan({ alreadyGranted: false, fullTime: false, ended: false, extra: prev });
  if (!plan) return { completed: false, reason: "already" };

  const claimed = await tx
    .update(schema.proposals)
    .set({ completionBonusAt: sql`now()`, completionBonusBy: by })
    .where(and(eq(schema.proposals.id, proposalId), isNull(schema.proposals.completionBonusAt)))
    .returning({ id: schema.proposals.id });
  if (claimed.length === 0) return { completed: false, reason: "already" };

  const next = grantCompletionBonus(prev);
  if (onboarding) await tx.update(schema.internOnboarding).set({ extraData: next }).where(eq(schema.internOnboarding.id, onboarding.id));
  // raw.proposalId stays off on purpose: stipend code must never link this row to a placement.
  await tx.insert(schema.internPayouts).values({
    internId: p.internId,
    kind: "completion_bonus",
    bonusProposalId: proposalId,
    status: "pending",
    method: "bank",
    amountMinor: plan.amountMinor,
    currency: "INR",
    notes: offer.roleTitle || null,
    raw: { source: "completion_bonus", bandId: plan.bandId, scheduledFor: bonusDueDate(todayIst()) },
  });
  // College incentive: once per proposal (unique index); skipped quietly when the intern isn't a verified member of a partner college.
  const [m] = await tx
    .select({ collegeId: schema.collegeMemberships.collegeId, status: schema.collegeMemberships.status, leftAt: schema.collegeMemberships.leftAt, isPartner: schema.colleges.isPartner })
    .from(schema.collegeMemberships)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeMemberships.collegeId))
    .where(eq(schema.collegeMemberships.userId, p.internId))
    .limit(1);
  const inc = incentivePlan(m, plan.scoreBefore);
  if (m && inc) {
    await tx.insert(schema.collegeWalletEntries).values({ collegeId: m.collegeId, kind: "incentive", amountMinor: inc.amountMinor, proposalId, internId: p.internId, bandId: inc.bandId }).onConflictDoNothing();
  }
  return { completed: true, prev, next, internId: p.internId, amountMinor: plan.amountMinor, bandId: plan.bandId, scoreBefore: plan.scoreBefore };
}

/** After commit: tell the intern. Deduped per hire. */
export function notifyCompleted(proposalId: string, r: Extract<CompletionResult, { completed: true }>) {
  return notify({
    to: { type: "intern", id: r.internId },
    type: "internship_completed",
    title: "Internship completed: +1 Findtern Score",
    message: `Your internship is complete. Your Findtern Score went up by 1 (the maximum is 10) and a ${formatMoney(r.amountMinor, "INR", { zeroLabel: false })} completion bonus is on its way.`,
    data: { proposalId, findternScore: r.next.findternScore ?? null },
    dedupeKey: `internship_completed:${proposalId}`,
  }).catch(() => undefined);
}
