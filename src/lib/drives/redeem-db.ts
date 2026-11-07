import { createHash } from "node:crypto";

import type { PgClient } from "../db/pg-tx.ts";
import { hashDriveCode } from "./code-derive.ts";
import { redeemInTransaction, type RedeemResult, type RedeemTx } from "./redeem.ts";

/**
 * Postgres wiring for redeeming a drive code. Takes the client of an open
 * transaction (withPgTransaction); a failed result means the caller MUST roll
 * back (throw `RedeemRefused`), so nothing partial persists.
 */

/** There is no date of birth in the schema; like the promo flow, the student's 18+ tick is the proof. */
export const DECLARED_ADULT_DOB = new Date("1900-01-01T00:00:00Z");

/** Identical wording is rendered by the card (promoConsentNotice("your college")) and hashed here. */
export const DRIVE_CONSENT_VERSION = "promo-v2";
export const driveConsentHash = (notice: string) => createHash("sha256").update(notice).digest("hex");

export type BindingDecision = "bind" | "same" | "refuse";

/** An entry already linked to a student can only be redeemed by that student; an empty one binds the redeemer. */
export function entryBindingDecision(entryInternId: string | null | undefined, redeemerId: string): BindingDecision {
  if (!entryInternId) return "bind";
  return entryInternId === redeemerId ? "same" : "refuse";
}

export class RedeemRefused extends Error {
  readonly status: number;
  readonly publicMessage: string;
  constructor(status: number, publicMessage: string) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export type DriveRedeemOutcome = { collegeName: string; driveTitle?: string; collegeId: string; paymentId: string; codeId: string };

export const LOCK_BINDING_SQL =
  "SELECT c.id AS code_id, e.id AS entry_id, e.intern_id FROM drive_codes c JOIN drive_roster_entries e ON e.id = c.entry_id WHERE c.code_hash = $1 FOR UPDATE OF c";
export const BIND_ENTRY_SQL = "UPDATE drive_roster_entries SET intern_id = $2 WHERE id = $1 AND (intern_id IS NULL OR intern_id = $2)";
export const MEMBERSHIP_UPSERT_SQL = `INSERT INTO college_memberships (user_id, college_id, status, verified_by, consent_id, joined_at)
  VALUES ($1, $2, 'verified', 'drive_code', $3, now())
  ON CONFLICT (user_id) DO UPDATE SET
    year = CASE WHEN college_memberships.college_id = EXCLUDED.college_id AND college_memberships.left_at IS NULL THEN college_memberships.year ELSE NULL END,
    branch = CASE WHEN college_memberships.college_id = EXCLUDED.college_id AND college_memberships.left_at IS NULL THEN college_memberships.branch ELSE NULL END,
    college_id = EXCLUDED.college_id, status = 'verified', verified_by = 'drive_code',
    consent_id = EXCLUDED.consent_id, left_at = NULL, joined_at = now()`;

export async function redeemDriveCode(
  client: PgClient,
  input: { code: string; internId: string; secret: string; now: Date; consentNotice: string; declaredAdult: boolean },
): Promise<DriveRedeemOutcome> {
  const q = async (sql: string, params: unknown[]) => {
    const r = await client.query(sql, params);
    return { rows: r.rows as Record<string, unknown>[], rowCount: r.rowCount ?? 0 };
  };
  if (!input.declaredAdult) throw new RedeemRefused(400, "Confirm you are 18 or older to use your college's code.");

  // Same lock key as the Razorpay order route, so a code and a checkout cannot both settle this student's fee.
  await q("SELECT pg_advisory_xact_lock(hashtext($1))", [`intern-pay:${input.internId}`]);

  const lock = (await q(LOCK_BINDING_SQL, [hashDriveCode(input.code, input.secret)])).rows[0];
  if (lock && entryBindingDecision(lock.intern_id as string | null, input.internId) === "refuse") {
    // Same message as a code from another college: no hint whose code it is.
    throw new RedeemRefused(403, "This code is not valid for your college");
  }

  const mem = (await q("SELECT college_id, status FROM college_memberships WHERE user_id = $1 AND left_at IS NULL", [input.internId])).rows[0];
  let entitlementId = "";
  const tx: RedeemTx = {
    execute: q,
    async insertEntitlement(row) {
      const r = await q(
        "INSERT INTO drive_entitlements (code_id, intern_id, order_id, college_id, redeemed_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [row.codeId, row.internId, row.orderId, row.collegeId, row.redeemedAt],
      );
      entitlementId = String(r.rows[0].id);
    },
  };
  const res: RedeemResult = await redeemInTransaction(tx, {
    code: input.code,
    internId: input.internId,
    dateOfBirth: DECLARED_ADULT_DOB,
    membership: mem ? { collegeId: String(mem.college_id), status: String(mem.status) } : null,
    now: input.now,
    secret: input.secret,
  });
  if (!res.ok) throw new RedeemRefused(res.status, res.error);

  // A student whose fee is already settled would burn a seat for nothing.
  const paid = await q(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM intern_payments WHERE intern_id = $1 AND status = 'paid')
       OR EXISTS (SELECT 1 FROM intern_onboarding WHERE user_id = $1 AND coalesce(extra_data->'payment'->>'isPaid', '') = 'true')`,
    [input.internId],
  );
  if (paid.rowCount > 0) throw new RedeemRefused(409, "Your profile is already activated.");
  // A checkout still open for this fee is closed, as the order route does when a code replaces it.
  await q("UPDATE intern_payments SET status = 'failed', updated_at = now() WHERE intern_id = $1 AND status = 'created' AND gateway = 'razorpay'", [input.internId]);

  await q(BIND_ENTRY_SQL, [lock?.entry_id, input.internId]);

  // Waiver row: no invoice number, no GST (those are assigned only by settlement of a gateway payment).
  const w = res.waiverPayment;
  const orderRef = `drive:${res.codeId}`;
  const pay = await q(
    `INSERT INTO intern_payments (intern_id, gateway, order_id, payment_id, amount_minor, currency, status, raw, paid_at)
     VALUES ($1,$2,$3,$3,$4,'INR',$5,$6::jsonb,$7) RETURNING id`,
    [w.internId, w.gateway, orderRef, w.amountMinor, w.status, JSON.stringify(w.raw), input.now],
  );
  const paymentId = String(pay.rows[0].id);
  await q("UPDATE drive_entitlements SET payment_id = $2 WHERE id = $1", [entitlementId, paymentId]);

  const consent = await q(
    `INSERT INTO college_consents (user_id, college_id, notice_version, notice_hash, purposes, declared_adult)
     VALUES ($1,$2,$3,$4,$5::jsonb,true) RETURNING id`,
    [input.internId, res.collegeId, DRIVE_CONSENT_VERSION, driveConsentHash(input.consentNotice), JSON.stringify(["college_code_verification"])],
  );
  await q(MEMBERSHIP_UPSERT_SQL, [res.membership.userId, res.membership.collegeId, String(consent.rows[0].id)]);
  await q("DELETE FROM college_presence WHERE user_id = $1", [input.internId]);
  await q(
    "INSERT INTO college_audit_log (college_id, actor_type, actor_id, action, subject_user_id, meta) VALUES ($1,'intern',$2,'drive_code_redeemed',$2,$3::jsonb)",
    [res.collegeId, input.internId, JSON.stringify({ orderId: res.orderId, codeId: res.codeId })],
  );

  const info = (
    await q(
      `SELECT c.name AS college_name, d.title AS drive_title FROM college_drive_orders o
       JOIN colleges c ON c.id = o.college_id LEFT JOIN college_drives d ON d.id = o.drive_id WHERE o.id = $1`,
      [res.orderId],
    )
  ).rows[0];
  return {
    collegeId: res.collegeId,
    paymentId,
    codeId: res.codeId,
    collegeName: String(info?.college_name ?? "your college"),
    ...(info?.drive_title ? { driveTitle: String(info.drive_title) } : {}),
  };
}
