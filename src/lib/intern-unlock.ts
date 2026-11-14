import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { AI_INTERVIEW_EMAIL } from "@/lib/admin/scope";
import { lockEnabled, unlockReason, type UnlockFacts, type UnlockState } from "@/lib/intern-lock";

/**
 * Is this intern unlocked (paid, or grandfathered)? Server-side, one query.
 *
 * Caching: only a positive answer is kept (5 min). Paid and grandfathered don't
 * revert in practice, and a refund waiting a few minutes to re-lock costs
 * nothing, but "locked" is never cached, so the next request after a payment
 * (card, promo, TPO or drive code, admin "mark paid") already sees it. Requests
 * in flight for the same intern share one lookup; that window is a few ms.
 * A failed lookup is "unknown" and is not cached either.
 */
const POSITIVE_TTL_MS = 5 * 60_000;
const store = globalThis as typeof globalThis & {
  __ftInternUnlocked?: Map<string, number>;
  __ftInternUnlockInflight?: Map<string, Promise<UnlockState>>;
};
const unlockedAt = (store.__ftInternUnlocked ??= new Map());
const inflight = (store.__ftInternUnlockInflight ??= new Map());

/** For tests and for code that has just recorded a payment. */
export function forgetInternUnlock(uid?: string) {
  if (uid) unlockedAt.delete(uid);
  else unlockedAt.clear();
}

export async function internUnlockFacts(uid: string): Promise<UnlockFacts> {
  const { rows } = await getDb().execute<{
    paid_row: boolean;
    legacy_paid: boolean;
    has_proposal: boolean;
    has_company_interview: boolean;
  }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM intern_payments WHERE intern_id = ${uid} AND status = 'paid') AS paid_row,
      EXISTS (
        SELECT 1 FROM intern_onboarding
        WHERE user_id = ${uid} AND coalesce(extra_data->'payment'->>'isPaid', '') = 'true'
      ) AS legacy_paid,
      EXISTS (SELECT 1 FROM proposals WHERE intern_id = ${uid}) AS has_proposal,
      EXISTS (
        SELECT 1 FROM interviews i
        WHERE i.intern_id = ${uid}
          AND i.employer_id <> 'admin'
          AND NOT EXISTS (
            SELECT 1 FROM employers e WHERE e.id = i.employer_id AND lower(e.company_email) = ${AI_INTERVIEW_EMAIL}
          )
      ) AS has_company_interview
  `);
  const r = rows[0];
  return {
    paidRow: r?.paid_row === true,
    legacyPaid: r?.legacy_paid === true,
    hasProposal: r?.has_proposal === true,
    hasCompanyInterview: r?.has_company_interview === true,
  };
}

/** Never throws. "unknown" when the database could not answer. */
export async function internUnlockState(uid: string): Promise<UnlockState> {
  const hit = unlockedAt.get(uid);
  if (hit !== undefined && Date.now() - hit < POSITIVE_TTL_MS) return "unlocked";
  const pending = inflight.get(uid);
  if (pending) return pending;
  const run = (async (): Promise<UnlockState> => {
    try {
      const reason = unlockReason(await internUnlockFacts(uid));
      if (!reason) {
        unlockedAt.delete(uid);
        return "locked";
      }
      if (unlockedAt.size > 20_000) unlockedAt.clear();
      unlockedAt.set(uid, Date.now());
      return "unlocked";
    } catch (err) {
      console.error("[intern-lock] lookup failed", err);
      return "unknown";
    } finally {
      inflight.delete(uid);
    }
  })();
  inflight.set(uid, run);
  return run;
}

/**
 * Route-level re-check for the APIs the locked pages call. Returns the refusal
 * to send, or null to carry on. A no-op for every role but intern, and when the
 * kill switch is off. Fails CLOSED: if the lookup fails the call is refused (503).
 */
export async function internLockResponse(session: { role: string; uid: string }): Promise<NextResponse | null> {
  if (session.role !== "intern" || !lockEnabled()) return null;
  const state = await internUnlockState(session.uid);
  if (state === "unlocked") return null;
  return state === "locked"
    ? NextResponse.json({ error: "Unlocks after payment. Activate your profile to use this.", code: "intern_locked" }, { status: 403 })
    : NextResponse.json({ error: "Could not check your account right now. Try again in a moment." }, { status: 503 });
}
