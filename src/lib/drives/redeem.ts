import { hashDriveCode } from "./code-derive.ts";
import type { SqlExecutor } from "./codes.ts";

export type CodeState = {
  id: string;
  orderId: string;
  status: string;
  validUntil: Date;
};
export type OrderState = { id: string; collegeId: string; status: string };
export type RedeemReason =
  | "not_found"
  | "already_redeemed"
  | "wrong_college"
  | "expired_or_revoked"
  | "order_unpaid"
  | "under_18";

export type RedeemDecision = { ok: true } | { ok: false; reason: RedeemReason; status: number; error: string };

const FAIL: Record<RedeemReason, { status: number; error: string }> = {
  not_found: { status: 404, error: "Invalid code" },
  already_redeemed: { status: 409, error: "This code has already been used" },
  wrong_college: { status: 403, error: "This code is not valid for your college" },
  expired_or_revoked: { status: 410, error: "This code has expired or been withdrawn" },
  order_unpaid: { status: 402, error: "This drive is not active yet" },
  under_18: { status: 403, error: "Students under 18 need a parent's consent" },
};
const no = (reason: RedeemReason): RedeemDecision => ({ ok: false, reason, ...FAIL[reason] });

export function ageOn(dateOfBirth: Date, now: Date): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const m = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
}

export function redeemDecision(input: {
  code: CodeState | null;
  order: OrderState | null;
  intern: { dateOfBirth: Date | null };
  membership: { collegeId: string; status: string } | null;
  now: Date;
}): RedeemDecision {
  const { code, order, intern, membership, now } = input;
  if (!code || !order) return no("not_found");
  if (code.status === "redeemed") return no("already_redeemed");
  if (code.status === "revoked" || code.status === "expired" || code.validUntil.getTime() <= now.getTime()) {
    return no("expired_or_revoked");
  }
  if (order.status !== "paid") return no("order_unpaid");
  if (membership && membership.collegeId !== order.collegeId) return no("wrong_college");
  if (!intern.dateOfBirth || ageOn(intern.dateOfBirth, now) < 18) return no("under_18");
  return { ok: true };
}

export function waiverPaymentRow(a: { internId: string; driveOrderId: string; codeId: string }) {
  return {
    internId: a.internId,
    gateway: "college_drive",
    amountMinor: 0,
    status: "paid",
    raw: { driveOrderId: a.driveOrderId, codeId: a.codeId },
  } as const;
}

export function membershipUpsert(a: { userId: string; collegeId: string }) {
  return { userId: a.userId, collegeId: a.collegeId, status: "verified", verifiedBy: "drive_code" } as const;
}

export type RedeemTx = SqlExecutor & {
  insertEntitlement(row: {
    codeId: string;
    internId: string;
    orderId: string;
    collegeId: string;
    redeemedAt: Date;
  }): Promise<void>;
};

export const LOCK_CODE_SQL =
  "SELECT id, order_id, status, valid_until FROM drive_codes WHERE code_hash = $1 FOR UPDATE";
export const LOAD_ORDER_SQL = "SELECT id, college_id, status FROM college_drive_orders WHERE id = $1";
export const MARK_REDEEMED_SQL =
  "UPDATE drive_codes SET status = 'redeemed', redeemed_at = $2 WHERE id = $1 AND status = 'issued'";
export const BUMP_REDEEMED_SQL =
  "UPDATE college_drive_orders SET redeemed_count = redeemed_count + 1 WHERE id = $1 AND redeemed_count < issued_count";

export type RedeemInput = {
  code: string;
  internId: string;
  dateOfBirth: Date | null;
  membership: { collegeId: string; status: string } | null;
  now: Date;
  secret: string;
};

export type RedeemResult =
  | {
      ok: true;
      codeId: string;
      orderId: string;
      collegeId: string;
      waiverPayment: ReturnType<typeof waiverPaymentRow>;
      membership: ReturnType<typeof membershipUpsert>;
    }
  | Extract<RedeemDecision, { ok: false }>;

/** Run inside one transaction; any non-ok result means the caller rolls back. */
export async function redeemInTransaction(tx: RedeemTx, input: RedeemInput): Promise<RedeemResult> {
  const locked = await tx.execute(LOCK_CODE_SQL, [hashDriveCode(input.code, input.secret)]);
  const r = locked.rows[0];
  if (!r) return no("not_found") as RedeemResult & { ok: false };
  const code: CodeState = {
    id: String(r.id),
    orderId: String(r.order_id),
    status: String(r.status),
    validUntil: new Date(r.valid_until as string | Date),
  };
  const o = (await tx.execute(LOAD_ORDER_SQL, [code.orderId])).rows[0];
  const order: OrderState | null = o ? { id: String(o.id), collegeId: String(o.college_id), status: String(o.status) } : null;
  const d = redeemDecision({
    code,
    order,
    intern: { dateOfBirth: input.dateOfBirth },
    membership: input.membership,
    now: input.now,
  });
  if (!d.ok) return d;
  const o2 = order as OrderState;
  if ((await tx.execute(MARK_REDEEMED_SQL, [code.id, input.now])).rowCount === 0) return no("already_redeemed") as RedeemResult & { ok: false };
  if ((await tx.execute(BUMP_REDEEMED_SQL, [o2.id])).rowCount === 0) return no("already_redeemed") as RedeemResult & { ok: false };
  try {
    await tx.insertEntitlement({
      codeId: code.id,
      internId: input.internId,
      orderId: o2.id,
      collegeId: o2.collegeId,
      redeemedAt: input.now,
    });
  } catch (e) {
    // unique (order_id, intern_id): this student already holds a seat on the order. The caller rolls back.
    if ((e as { code?: string }).code === "23505") return no("already_redeemed") as RedeemResult & { ok: false };
    throw e;
  }
  return {
    ok: true,
    codeId: code.id,
    orderId: o2.id,
    collegeId: o2.collegeId,
    waiverPayment: waiverPaymentRow({ internId: input.internId, driveOrderId: o2.id, codeId: code.id }),
    membership: membershipUpsert({ userId: input.internId, collegeId: o2.collegeId }),
  };
}
