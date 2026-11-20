import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { LIVE_STATUSES } from "@/lib/employer-offer-status";
import { HOLD_EXPIRY_DAYS, type StrikeSubject } from "./strikes";

/**
 * D3: while one side is frozen, offers and proposals between the two are PAUSED, never withdrawn. Nothing is stored for the
 * pause: it is derived from `users.frozen_at` / `employers.frozen_at` (the shared reads in lib/moderation/hold.ts), so it ends
 * the moment the account is released. This file only TELLS the other side, neutrally: "On hold", no reason, no name, nothing private.
 */
const OPEN = [...LIVE_STATUSES] as string[];

export async function notifyCounterpartiesOfHold(subject: { type: StrikeSubject; id: string }, change: "held" | "released", strikeId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.proposals.id, internId: schema.proposals.internId, employerId: schema.proposals.employerId })
    .from(schema.proposals)
    .where(and(subject.type === "intern" ? eq(schema.proposals.internId, subject.id) : eq(schema.proposals.employerId, subject.id), inArray(schema.proposals.status, OPEN), isNull(schema.proposals.hiredAt)))
    .limit(200);
  const other = subject.type === "intern" ? "employer" : "intern";
  let sent = 0;
  for (const p of rows) {
    const to = { type: other, id: other === "employer" ? p.employerId : p.internId } as const;
    const held = change === "held";
    try {
      await notify({
        to,
        type: held ? "proposal_on_hold" : "proposal_hold_released",
        title: held ? "On hold" : "Back on track",
        message: held
          ? `A proposal is on hold right now and cannot move forward. It continues if it is released, or closes after ${HOLD_EXPIRY_DAYS} days.`
          : "A proposal that was on hold continues again.",
        data: { proposalId: p.id },
        // Per proposal and strike: a retry never doubles, a later freeze (a new strike) notifies again.
        dedupeKey: `hold:${change}:${p.id}:${strikeId}`,
      });
      sent++;
    } catch (err) {
      console.error("[hold] counterparty notice failed", p.id, err);
    }
  }
  return sent;
}

