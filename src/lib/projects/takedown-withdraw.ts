import { and, eq, gte, inArray } from "drizzle-orm";

import { emails } from "@/lib/emails";
import { getDb, schema } from "@/lib/db";
import { internFirstName, notify, resolveOfferNotifications } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";
import { orderProposalIds } from "@/lib/order-ids";
import { OPEN_ORDER_MINUTES } from "@/lib/payments";
import { TAKEDOWN_WITHDRAW_STATUSES, takedownWithdraws } from "./takedown";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface WithdrawnOffer {
  id: string;
  internId: string;
  role: string;
  previousStatus: string;
}

/**
 * First step of the takedown transaction: lock the project's open offers, before the project row (see
 * the lock-order note in `applyTakedown`). `withdrawOpenOffers` reads them again once the project is
 * locked, so an offer committed in between is still withdrawn.
 */
export async function lockOpenOfferRows(tx: Tx, projectId: string): Promise<void> {
  await tx
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.projectId, projectId), inArray(schema.proposals.status, [...TAKEDOWN_WITHDRAW_STATUSES])))
    .orderBy(schema.proposals.id)
    .for("update");
}

/**
 * Part of the takedown transaction: withdraw every open offer on the project, so no window exists
 * between the project going down and its offers closing. Same transition as the admin withdraw in
 * `PATCH /api/proposals/[id]/status` (status `withdrawn`, `offerDetails.closedByAdminAt` so a
 * closed-by-staff offer is not counted as a decline miss), done in one UPDATE per offer guarded on
 * the status we read.
 *
 * Untouched on purpose: hired / processing placements and later monthly payments (money already
 * moving), a full-time acceptance (that was the hire), and an accepted offer with a checkout order
 * open (an order opened before the takedown settles normally).
 *
 * Restoring the project does NOT revive these: they stay withdrawn and the employer sends new ones.
 */
export async function withdrawOpenOffers(tx: Tx, input: { projectId: string; employerId: string }): Promise<WithdrawnOffer[]> {
  const candidates = await tx
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.projectId, input.projectId), inArray(schema.proposals.status, [...TAKEDOWN_WITHDRAW_STATUSES])))
    .for("update");
  if (candidates.length === 0) return [];

  const open = await tx
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.employerId, input.employerId),
        eq(schema.employerPayments.status, "created"),
        gte(schema.employerPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
      ),
    );
  const inOpenOrder = new Set(open.flatMap((o) => orderProposalIds(o.raw)));

  const out: WithdrawnOffer[] = [];
  const now = new Date().toISOString();
  for (const p of candidates) {
    const offer = parseOffer(p.offerDetails, p.currency);
    if (!takedownWithdraws({ status: p.status, hiredAt: p.hiredAt, fullTime: Boolean(offer.fullTime), hasOpenOrder: inOpenOrder.has(p.id) })) continue;
    const base = (p.offerDetails ?? {}) as Record<string, unknown>;
    const [row] = await tx
      .update(schema.proposals)
      .set({
        status: "withdrawn",
        updatedAt: new Date(),
        offerDetails: { ...base, closedByAdminAt: now, closedByAdminStatus: "withdrawn", closedByTakedownAt: now },
      })
      .where(and(eq(schema.proposals.id, p.id), eq(schema.proposals.status, p.status)))
      .returning({ id: schema.proposals.id });
    if (row) out.push({ id: p.id, internId: p.internId, role: offer.roleTitle || "the role", previousStatus: p.status });
  }
  return out;
}

/**
 * After the commit: tell each intern their offer closed (the neutral "closed by Findtern" wording of
 * the admin withdraw, no blame) and clear their "you have an offer" prompts. The employer is told in
 * the takedown notice itself. Each failure costs one notification, never the committed takedown.
 */
export async function notifyWithdrawnOffers(offers: WithdrawnOffer[], projectId: string): Promise<void> {
  for (const o of offers) {
    try {
      await resolveOfferNotifications(o.internId, [o.id]);
      await notify({
        to: { type: "intern", id: o.internId },
        type: "proposal_withdrawn",
        title: "Offer closed",
        message: `The offer for ${o.role} has been closed by Findtern.`,
        data: { proposalId: o.id, projectId },
        dedupeKey: `takedown-withdraw:${o.id}`,
        email: emails.proposalClosed({ internName: await internFirstName(o.internId), role: o.role }),
      });
    } catch (err) {
      console.error("[admin/projects/takedown] intern notice failed", err);
    }
  }
}
