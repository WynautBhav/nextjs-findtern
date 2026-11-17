import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { withLock } from "@/lib/advisory-lock";
import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { initialsOf } from "@/lib/employer-candidates";
import { openOrderProposalIds } from "@/lib/employer-payable";
import { employerNames, notify, resolveOfferNotifications } from "@/lib/notify";
import { parseOffer, todayIst } from "@/lib/offer";
import { tryPublicOrigin } from "@/lib/origin";
import { expiryDedupeKey, expiryNotices, planExpiry } from "@/lib/proposal-expiry-plan";
import { expiredStamp } from "@/lib/proposal-expiry";

/**
 * The unpaid-offer sweeper: persists what the pay gate already enforces. An ACCEPTED offer that is not hired, has no open
 * payment order, and whose start day has begun (00:00 IST) becomes status `expired` with `offerDetails.expiredReason =
 * "unpaid_past_start"`. Idempotent: a second run finds nothing. Never sets `lapsedAt` (not a guarantee miss).
 *
 * Money safety. The sweep for one employer runs under the SAME advisory lock the order route opens an order under
 * (`employer-pay:<id>`), and reads the open orders inside it. So an order that commits first freezes the offer (the sweep sees
 * it and leaves the offer accepted), and a sweep that commits first makes the order route's re-check refuse. There is no
 * interleaving in which an order is open on an offer this has expired. `processing` and `hired` rows are never selected, and a
 * payment webhook that settles an order opened before midnight still hires: settlement (payments.ts) is not touched.
 *
 * Shape: per employer, one transaction = SELECT candidates FOR UPDATE -> pure plan (planExpiry, the pay gate's own rule)
 * -> one bounded UPDATE of exactly those ids (status and hired_at re-asserted) -> one audit row each (strict, same tx).
 * Notifications go out after the commit and are deduped per proposal and side, so a retry never doubles them.
 *
 * A taken-down project's offer is expired like any other (it can no longer be paid either way), but its employer is not
 * notified: the listing is view-only for them and Findtern is handling it. The candidate is still told.
 */

const MAX_EMPLOYERS_PER_RUN = 200;
const MAX_ROWS_PER_EMPLOYER = 200;
const SYSTEM_ACTOR = "system";

export type ExpirySweep = { expired: number; employers: number; ids: string[]; notified: number };

type Expired = { id: string; employerId: string; internId: string; projectId: string; offerDetails: Record<string, unknown> | null; currency: string };

/** SQL for "the start day has begun": the offer's start date is a real-looking day on or before today in India. */
const startBegun = (today: string) =>
  sql`(left(${schema.proposals.offerDetails}->>'startDate', 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and left(${schema.proposals.offerDetails}->>'startDate', 10) <= ${today})`;

async function expireForEmployer(employerId: string, now: Date, today: string): Promise<Expired[]> {
  return withLock(`employer-pay:${employerId}`, async (tx) => {
    const candidates = await tx
      .select()
      .from(schema.proposals)
      .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.status, "accepted"), isNull(schema.proposals.hiredAt), startBegun(today)))
      .orderBy(schema.proposals.id)
      .limit(MAX_ROWS_PER_EMPLOYER)
      .for("update");
    if (candidates.length === 0) return [];
    const open = await openOrderProposalIds(tx, employerId, now);
    const toExpire = planExpiry(candidates, open, now);
    if (toExpire.length === 0) return [];
    const stamp = JSON.stringify(expiredStamp("unpaid_past_start", now));
    const done = await tx
      .update(schema.proposals)
      .set({ status: "expired", updatedAt: now, offerDetails: sql`coalesce(${schema.proposals.offerDetails}, '{}'::jsonb) || ${stamp}::jsonb` })
      .where(and(inArray(schema.proposals.id, toExpire.map((p) => p.id)), eq(schema.proposals.status, "accepted"), isNull(schema.proposals.hiredAt)))
      .returning({ id: schema.proposals.id });
    const doneIds = new Set(done.map((d) => d.id));
    const rows = toExpire.filter((p) => doneIds.has(p.id));
    for (const p of rows) {
      await recordAdminAudit(
        tx,
        {
          adminId: SYSTEM_ACTOR,
          action: "proposal.expired_unpaid",
          targetType: "proposal",
          targetId: p.id,
          meta: { proposalId: p.id, employerId: p.employerId, internId: p.internId, startDate: String((p.offerDetails as Record<string, unknown> | null)?.startDate ?? "").slice(0, 10), reason: "unpaid_past_start" },
        },
        { strict: true },
      );
    }
    return rows.map((p) => ({ id: p.id, employerId: p.employerId, internId: p.internId, projectId: p.projectId, offerDetails: p.offerDetails, currency: p.currency }));
  });
}

async function notifyExpired(rows: Expired[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();
  const projects = await db
    .select({ id: schema.projects.id, takenDownAt: schema.projects.takenDownAt })
    .from(schema.projects)
    .where(inArray(schema.projects.id, [...new Set(rows.map((r) => r.projectId))]));
  const down = new Set(projects.filter((p) => p.takenDownAt).map((p) => p.id));
  const users = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(inArray(schema.users.id, [...new Set(rows.map((r) => r.internId))]));
  const initials = new Map(users.map((u) => [u.id, initialsOf((u.firstName || "").trim(), (u.lastName || "").trim())]));
  const site = tryPublicOrigin();
  let sent = 0;
  for (const r of rows) {
    try {
      const offer = parseOffer(r.offerDetails, r.currency);
      const { company } = await employerNames(r.employerId);
      const n = expiryNotices({
        proposalId: r.id,
        role: offer.roleTitle || "your internship",
        initials: initials.get(r.internId) ?? "the candidate",
        company,
        startDate: offer.startDate ?? "",
        site,
        projectTakenDown: down.has(r.projectId),
      });
      if (n.employer) {
        await notify({ to: { type: "employer", id: r.employerId }, type: "proposal_expired_unpaid", title: n.employer.title, message: n.employer.message, data: n.employer.data, dedupeKey: expiryDedupeKey(r.id, "employer"), email: n.employer.email });
        sent++;
      }
      await notify({ to: { type: "intern", id: r.internId }, type: "proposal_expired_unpaid", title: n.intern.title, message: n.intern.message, data: n.intern.data, dedupeKey: expiryDedupeKey(r.id, "intern") });
      sent++;
      // The intern's "you have an offer" rows no longer ask for anything.
      await resolveOfferNotifications(r.internId, [r.id]);
    } catch (err) {
      // A failed notice never undoes the expiry: the row is committed, and a re-run would not re-send (nothing left to sweep),
      // so the loss is logged, not silent.
      console.error("[proposal-expiry] notify failed", r.id, err);
    }
  }
  return sent;
}

/** Expire every accepted-unpaid offer past its start day, for all employers. Safe to run at any time, by any number of callers. */
export async function expireUnpaidPastStart(now: Date = new Date()): Promise<ExpirySweep> {
  const today = todayIst(now);
  const employers = await getDb()
    .selectDistinct({ id: schema.proposals.employerId })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.status, "accepted"), isNull(schema.proposals.hiredAt), startBegun(today)))
    .orderBy(schema.proposals.employerId)
    .limit(MAX_EMPLOYERS_PER_RUN);
  const all: Expired[] = [];
  for (const e of employers) all.push(...(await expireForEmployer(e.id, now, today)));
  const notified = await notifyExpired(all);
  if (all.length > 0) console.log(`[proposal-expiry] expired ${all.length} unpaid offer(s) for ${employers.length} employer(s)`);
  return { expired: all.length, employers: employers.length, ids: all.map((r) => r.id), notified };
}
