import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { withLock } from "@/lib/advisory-lock";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { openOrderProposalIds } from "@/lib/employer-payable";
import { notify, resolveOfferNotifications } from "@/lib/notify";
import { expiredStamp } from "@/lib/proposal-expiry";
import { holdCutoff } from "./strikes";

/**
 * D3: an unpaid offer or proposal whose intern OR employer has been frozen for 14 days lapses (status `expired`, reason
 * `admin_closed`, which every screen already words neutrally as "Closed by Findtern"; `holdExpired: true` marks why). Offers
 * resume untouched on unfreeze before then, because the pause is derived from `frozen_at`, never stored.
 *
 * Same shape as the unpaid-offer sweeper (proposal-expiry-db.ts): per employer, ONE transaction under the SAME advisory lock
 * the order route uses (`employer-pay:<id>`), rows selected FOR UPDATE, open payment orders read inside the lock, one bounded UPDATE
 * with status and hired_at re-asserted, one strict audit row per offer; notices after COMMIT, deduped per proposal and side. Never
 * touches `processing` or `hired` rows (paid / running hires keep going). Idempotent.
 */
const MAX_EMPLOYERS = 100;
const MAX_ROWS = 200;
const OPEN = ["sent", "interview_scheduled", "accepted"] as const;
const SYSTEM_ACTOR = "system";

export type HoldSweep = { expired: number; ids: string[] };

const frozenLongEnough = (cutoffIso: string) =>
  sql`(exists (select 1 from users u where u.id = ${schema.proposals.internId} and u.frozen_at is not null and u.frozen_at <= ${cutoffIso}::timestamp)
    or exists (select 1 from employers e where e.id = ${schema.proposals.employerId} and e.frozen_at is not null and e.frozen_at <= ${cutoffIso}::timestamp))`;

export async function expireHeldOffers(now: Date = new Date()): Promise<HoldSweep> {
  const cutoffIso = holdCutoff(now).toISOString();
  const employers = await getDb()
    .selectDistinct({ id: schema.proposals.employerId })
    .from(schema.proposals)
    .where(and(inArray(schema.proposals.status, [...OPEN]), isNull(schema.proposals.hiredAt), frozenLongEnough(cutoffIso)))
    .orderBy(schema.proposals.employerId)
    .limit(MAX_EMPLOYERS);

  const all: { id: string; employerId: string; internId: string }[] = [];
  for (const e of employers) {
    const rows = await withLock(`employer-pay:${e.id}`, async (tx) => {
      const candidates = await tx
        .select()
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, e.id), inArray(schema.proposals.status, [...OPEN]), isNull(schema.proposals.hiredAt), frozenLongEnough(cutoffIso)))
        .orderBy(schema.proposals.id)
        .limit(MAX_ROWS)
        .for("update");
      if (candidates.length === 0) return [];
      const open = await openOrderProposalIds(tx, e.id, now);
      const ids = candidates.filter((p) => !open.has(p.id)).map((p) => p.id);
      if (ids.length === 0) return [];
      const stamp = JSON.stringify({ ...expiredStamp("admin_closed", now), holdExpired: true });
      const done = await tx
        .update(schema.proposals)
        .set({ status: "expired", updatedAt: now, offerDetails: sql`coalesce(${schema.proposals.offerDetails}, '{}'::jsonb) || ${stamp}::jsonb` })
        .where(and(inArray(schema.proposals.id, ids), inArray(schema.proposals.status, [...OPEN]), isNull(schema.proposals.hiredAt)))
        .returning({ id: schema.proposals.id, employerId: schema.proposals.employerId, internId: schema.proposals.internId });
      for (const p of done) {
        await recordAdminAudit(tx, { adminId: SYSTEM_ACTOR, action: "proposal.expired_hold", targetType: "proposal", targetId: p.id, meta: { proposalId: p.id, employerId: p.employerId, internId: p.internId, reason: "hold_expired" } }, { strict: true });
      }
      return done;
    });
    all.push(...rows);
  }

  for (const r of all) {
    try {
      const body = { title: "Closed", message: "A proposal that was on hold has now closed after 14 days.", data: { proposalId: r.id } };
      await notify({ to: { type: "employer", id: r.employerId }, type: "proposal_hold_closed", ...body, dedupeKey: `hold_closed:${r.id}:employer` });
      await notify({ to: { type: "intern", id: r.internId }, type: "proposal_hold_closed", ...body, dedupeKey: `hold_closed:${r.id}:intern` });
      await resolveOfferNotifications(r.internId, [r.id]);
    } catch (err) {
      console.error("[hold-expiry] notify failed", r.id, err);
    }
  }
  if (all.length > 0) console.log(`[hold-expiry] closed ${all.length} offer(s) held for 14 days`);
  return { expired: all.length, ids: all.map((r) => r.id) };
}
