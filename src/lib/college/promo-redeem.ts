import { randomUUID } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { PgClient } from "@/lib/db/pg-tx";
import { hashDriveCode, driveCodeSecret } from "@/lib/drives/code-derive";
import { RedeemRefused } from "@/lib/drives/redeem-db";
import { redeemForStudent } from "@/lib/drives/redeem-flow";
import { openOrder } from "@/lib/intern-order-open";
import { settleInternOrder } from "@/lib/payments";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";
import { internProfileStatus } from "@/lib/profile-complete";
import { quotePromo } from "@/lib/promo";

import { collegeAccountState } from "./account-state";
import {
  classifyTypedCode,
  collegePromoDecision,
  COLLEGE_PROMO_FAIL,
  driveEntryDecision,
  type PromoRefusal,
  type RosterIdentity,
  type StudentIdentity,
} from "./identity-match";

/**
 * A college-account intern's promo field (WP4). The one place where a code AND the intern's identity are checked
 * against what the college gave Findtern, before the college's payment is recorded.
 *
 * Two kinds of code can be typed, told apart by shape (classifyTypedCode):
 *  - a personal drive code (XXXX-XXXX-XXXX), issued to one row of a college's drive roster: name, email, phone;
 *  - the college's shared promo (TPO) code, which only counts for a student the college's rosters list.
 * Both end in the same paid intern_payments row the existing flows write (redeemDriveCode / settleInternOrder),
 * so the unlock, the AI-interview gate and the admin views need no new case.
 */

export type PromoOutcome =
  | { ok: true; alreadyPaid: boolean; collegeName: string | null; kind: "drive" | "promo" | "none" }
  | { ok: false; status: number; error: string; reason: PromoRefusal | "not_college_account" | "bad_shape" | "settle" | "seats" | "busy" | "profile"; kind: "drive" | "promo" | "none"; mismatch?: string[] };

const generic = (reason: PromoRefusal | "bad_shape", kind: "drive" | "promo" | "none", mismatch?: string[]): PromoOutcome => ({ ok: false, status: 400, error: COLLEGE_PROMO_FAIL, reason, kind, ...(mismatch?.length ? { mismatch } : {}) });

async function loadStudent(uid: string): Promise<StudentIdentity | null> {
  const [u] = await getDb()
    .select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email, emailVerified: schema.users.emailVerified, countryCode: schema.users.countryCode, phone: schema.users.phoneNumber })
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  return u ? { name: `${u.first} ${u.last}`.trim(), email: u.email, emailVerified: u.emailVerified, phone: u.phone, countryCode: u.countryCode } : null;
}

/** What the college gave Findtern about this student: its drive rosters (name, email, phone) and its student list (name, email). */
async function rosterEntriesFor(collegeId: string, uid: string, email: string): Promise<RosterIdentity[]> {
  const db = getDb();
  const e = email.trim().toLowerCase();
  const [drive, list] = await Promise.all([
    db
      .select({ name: schema.driveRosterEntries.name, email: schema.driveRosterEntries.collegeEmailNorm, phone: schema.driveRosterEntries.phoneE164 })
      .from(schema.driveRosterEntries)
      .innerJoin(schema.collegeDriveOrders, eq(schema.collegeDriveOrders.id, schema.driveRosterEntries.orderId))
      .where(
        and(
          eq(schema.collegeDriveOrders.collegeId, collegeId),
          eq(schema.driveRosterEntries.state, "valid"),
          or(eq(schema.driveRosterEntries.internId, uid), eq(schema.driveRosterEntries.collegeEmailNorm, e)),
          or(isNull(schema.driveRosterEntries.internId), eq(schema.driveRosterEntries.internId, uid)),
        ),
      ),
    db
      .select({ name: schema.collegeRoster.name, email: schema.collegeRoster.email })
      .from(schema.collegeRoster)
      .where(and(eq(schema.collegeRoster.collegeId, collegeId), eq(schema.collegeRoster.email, e))),
  ]);
  return [...drive.map((r) => ({ name: r.name, email: r.email, phone: r.phone })), ...list.map((r) => ({ name: r.name, email: r.email, phone: null }))];
}

/** Reached only by an intern whose college link is verified but whose 18+ record is missing (older accounts). Says nothing about any code. */
export const NO_CONSENT_ON_RECORD = "We need your 18+ confirmation again. Open Settings, leave your college and join it again with its code, then come back.";

class Refused extends Error {
  constructor(readonly reason: PromoRefusal, readonly failed?: string[]) {
    super(reason);
  }
}

export async function redeemCollegePromo(input: { uid: string; typed: unknown }): Promise<PromoOutcome> {
  const { uid } = input;
  const state = await collegeAccountState(uid);
  // Idempotent: a retry, a second tab or a double click after the fee is settled changes nothing.
  if (state.paid) return { ok: true, alreadyPaid: true, collegeName: null, kind: "none" };
  if (state.home !== "college_unpaid" || !state.collegeId) return { ok: false, status: 403, error: "This is only for college accounts.", reason: "not_college_account", kind: "none" };

  // The 18+ tick was given with the college code and is on record; the browser sends no consent flag here.
  const [consent] = await getDb()
    .select({ id: schema.collegeConsents.id })
    .from(schema.collegeConsents)
    .where(and(eq(schema.collegeConsents.userId, uid), eq(schema.collegeConsents.collegeId, state.collegeId), eq(schema.collegeConsents.declaredAdult, true), isNull(schema.collegeConsents.withdrawnAt)))
    .limit(1);
  if (!consent) return { ok: false, status: 409, error: NO_CONSENT_ON_RECORD, reason: "no_consent", kind: "none" };
  // Profile first, then payment: the same line the order route draws. This says nothing about any code.
  const profile = await internProfileStatus(uid);
  if (!profile.complete) return { ok: false, status: 400, error: "Complete your profile first, then enter your college's promo code.", reason: "profile", kind: "none" };
  const typed = classifyTypedCode(input.typed);
  if (!typed) return generic("bad_shape", "none");
  const student = await loadStudent(uid);
  if (!student) return generic("identity", typed.kind);

  const done = async (kind: "drive" | "promo", collegeName: string | null): Promise<PromoOutcome> => {
    // Nothing to invalidate: internUnlockState never caches "locked" (intern-unlock.ts), so the paid row committed
    // above already lifts the payment lock on the very next request (verified by a source assertion in the tests).
    return { ok: true, alreadyPaid: false, collegeName, kind };
  };

  if (typed.kind === "drive") {
    try {
      const out = await redeemForStudent({
        uid,
        code: typed.code,
        declaredAdult: true,
        verify: async (client: PgClient) => {
          // Same key as the order route and redeemDriveCode: a code and a checkout cannot both settle this fee.
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`intern-pay:${uid}`]);
          const r = (
            await client.query(
              `SELECT e.name, e.college_email_norm AS email, e.phone_e164 AS phone, e.intern_id, o.college_id
                 FROM drive_codes c
                 JOIN drive_roster_entries e ON e.id = c.entry_id
                 JOIN college_drive_orders o ON o.id = e.order_id
                WHERE c.code_hash = $1 FOR UPDATE OF c`,
              [hashDriveCode(typed.code, driveCodeSecret())],
            )
          ).rows[0] as { name: string; email: string; phone: string | null; intern_id: string | null; college_id: string } | undefined;
          const d = driveEntryDecision({
            entry: r ? { name: r.name, email: r.email, phone: r.phone, internId: r.intern_id, collegeId: r.college_id } : null,
            membershipCollegeId: state.collegeId,
            uid,
            student,
          });
          if (!d.ok) throw new Refused(d.reason, d.failed);
        },
      });
      return done("drive", out.collegeName);
    } catch (e) {
      if (e instanceof Refused) return generic(e.reason, "drive", e.failed);
      if (e instanceof RedeemRefused) {
        // Money was already settled by a parallel request: that is the outcome the intern wanted.
        if (e.publicMessage === "Your profile is already activated.") return { ok: true, alreadyPaid: true, collegeName: null, kind: "drive" };
        // Not found, used, expired, withdrawn, other college, unpaid drive, 18+: one answer, so the code space tells nothing.
        return generic("no_code", "drive");
      }
      throw e;
    }
  }

  // The college's shared promo code.
  const fee = await getInternActivationFeeMinor();
  const quote = await quotePromo({ code: typed.code, subjectId: uid, orderMinor: fee, currency: "INR", audience: "intern" });
  const entries = await rosterEntriesFor(state.collegeId, uid, student.email);
  const d = collegePromoDecision({
    hasAdultConsent: true,
    quote: quote.ok ? { ok: true, promoCollegeId: quote.promo.collegeId, payableMinor: quote.payableMinor } : { ok: false },
    membershipCollegeId: state.collegeId,
    entries,
    student,
  });
  if (!d.ok) return generic(d.reason, "promo");
  if (!quote.ok) return generic("no_code", "promo");

  const orderId = `free_${quote.promo.code}_${uid}_${randomUUID().slice(0, 8)}`;
  const refused = await openOrder(uid, {
    internId: uid,
    orderId,
    gateway: "free",
    amountMinor: 0,
    currency: "INR",
    status: "created",
    raw: { promoCode: quote.promo.code, discountMinor: quote.discountMinor, declaredAdult: true, collegePromo: true },
  });
  if (refused) {
    if ("alreadyPaid" in refused && refused.alreadyPaid) return { ok: true, alreadyPaid: true, collegeName: null, kind: "promo" };
    return { ok: false, status: 409, error: "A payment is already being completed. Give it a moment, then refresh.", reason: "busy", kind: "promo" };
  }
  const close = () =>
    getDb()
      .update(schema.internPayments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(and(eq(schema.internPayments.orderId, orderId), eq(schema.internPayments.internId, uid), eq(schema.internPayments.status, "created")));
  const settled = await settleInternOrder({ orderId, paymentId: orderId, internId: uid }).catch(async (e) => {
    await close();
    throw e;
  });
  if (!settled.ok) {
    await close();
    // Only reachable after name, phone and email matched, so naming the seat cap tells a stranger nothing.
    return { ok: false, status: settled.status, error: settled.error, reason: "seats", kind: "promo" };
  }
  const [college] = await getDb().select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, state.collegeId)).limit(1);
  return done("promo", college?.name ?? null);
}

