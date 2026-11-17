// Postgres wiring for refunds: executor, scan, list, webhook settle. Callers must be authorised already.
import { withPgTransaction, type PgClient } from "../db/pg-tx.ts";
import { getDb } from "../db/index.ts";
import { createRefund } from "../razorpay.ts";
import {
  applyWebhook, initiateRefundFlow, type InitiateResult, type RefundExecutor, type RefundGateway,
} from "./refunds.ts";
import { AUDIT_SQL, recordEmployerRefund, WEBHOOK_ACTOR, type EmployerRefundOutcome } from "./employer-refund.ts";
import { parseRefundWebhook, planScan, type RazorpayRefundPayload, type ScanRow } from "./refunds-plan.ts";

export function pgExecutor(c: PgClient): RefundExecutor {
  return {
    async lockRefund(id) {
      const r = await c.query(
        `SELECT id, intern_payment_id, amount_minor, status, gateway_refund_id, idempotency_key, reason FROM payment_refunds WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const x = r.rows[0];
      return x ? { id: x.id, internPaymentId: x.intern_payment_id, amountMinor: x.amount_minor, status: x.status, gatewayRefundId: x.gateway_refund_id, idempotencyKey: x.idempotency_key, reason: x.reason ?? null } : null;
    },
    async getGatewayPaymentId(internPaymentId) {
      const r = await c.query(`SELECT payment_id, gateway, amount_minor FROM intern_payments WHERE id=$1`, [internPaymentId]);
      // Only money that went through Razorpay can come back through it: a full-waiver (or any zero-amount) order has nothing to refund.
      if (r.rows[0] && (r.rows[0].gateway === "promo_full_waiver" || Number(r.rows[0].amount_minor) <= 0)) return null;
      return (r.rows[0]?.payment_id as string | null) ?? null;
    },
    async claimInitiated(id) {
      const r = await c.query(
        `UPDATE payment_refunds SET status='initiated', initiated_at=now(), updated_at=now() WHERE id=$1 AND status IN ('eligible','review','pending')`,
        [id],
      );
      return r.rowCount ?? 0;
    },
    async recordGatewayRefund(id, gatewayRefundId, raw) {
      await c.query(`UPDATE payment_refunds SET gateway_refund_id=$2, raw=$3, updated_at=now() WHERE id=$1 AND status='initiated'`, [id, gatewayRefundId, JSON.stringify(raw)]);
    },
    async markAmbiguous(id, raw) {
      await c.query(`UPDATE payment_refunds SET raw=$2, updated_at=now() WHERE id=$1 AND status='initiated'`, [id, JSON.stringify(raw)]);
    },
    async markFailed(id, raw) {
      await c.query(`UPDATE payment_refunds SET status='failed', raw=$2, settled_at=now(), updated_at=now() WHERE id=$1 AND status='initiated'`, [id, JSON.stringify(raw)]);
    },
  };
}

const razorpayGateway: RefundGateway = { refund: (i) => createRefund(i) };

export function initiateRefund(input: { refundId: string; confirm: unknown; amountMinor: unknown }): Promise<InitiateResult> {
  return initiateRefundFlow({ tx: (fn) => withPgTransaction((c) => fn(pgExecutor(c))), gateway: razorpayGateway }, input);
}

/** Creates rows for students who now hold a drive entitlement redeemed after paying. Idempotent. */
export async function scanAndCreate(actor: string): Promise<{ created: number; review: number; candidates: number }> {
  const pool = getDb().$client;
  const found = await pool.query(
    `SELECT p.id AS payment_row_id, p.gateway, p.status, p.amount_minor, p.payment_id AS gateway_payment_id, p.paid_at,
            e.redeemed_at, e.interview_status,
            (SELECT count(*)::int FROM payment_refunds r WHERE r.intern_payment_id=p.id AND r.status='failed') AS failed_attempts,
            EXISTS (SELECT 1 FROM payment_refunds r WHERE r.intern_payment_id=p.id AND r.status<>'failed') AS has_live_refund
       FROM intern_payments p JOIN drive_entitlements e ON e.intern_id=p.intern_id
      WHERE p.gateway='razorpay' AND p.status='paid' AND p.amount_minor>0 AND p.paid_at <= e.redeemed_at
      LIMIT 5000`,
  );
  const rows: ScanRow[] = found.rows.map((r) => ({
    paymentRowId: r.payment_row_id, gateway: r.gateway, status: r.status, amountMinor: r.amount_minor,
    gatewayPaymentId: r.gateway_payment_id, paidAt: r.paid_at, redeemedAt: r.redeemed_at,
    interviewStatus: r.interview_status, failedAttempts: r.failed_attempts, hasLiveRefund: r.has_live_refund,
  }));
  const plan = planScan(rows, actor);
  let created = 0;
  let review = 0;
  for (const p of plan) {
    const r = await pool.query(
      `INSERT INTO payment_refunds (intern_payment_id, amount_minor, status, idempotency_key, reason, actor)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [p.row.internPaymentId, p.row.amountMinor, p.status, p.row.idempotencyKey, p.reason, actor],
    );
    if (r.rowCount) { created += 1; if (p.status === "review") review += 1; }
  }
  return { created, review, candidates: plan.length };
}

export interface RefundListRow {
  id: string; status: string; amountMinor: number; reason: string | null; createdAt: string | null;
  paidAt: string | null; studentName: string; studentEmail: string | null; gatewayRefundId: string | null;
}

export async function listRefunds(f: { status?: string; reason?: string; limit: number; offset: number }): Promise<{ rows: RefundListRow[]; total: number }> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status) { args.push(f.status); where.push(`r.status=$${args.length}`); }
  if (f.reason) { args.push(f.reason); where.push(`r.reason=$${args.length}`); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pool = getDb().$client;
  const total = await pool.query(`SELECT count(*)::int AS n FROM payment_refunds r ${w}`, args);
  args.push(f.limit, f.offset);
  const res = await pool.query(
    `SELECT r.id, r.status, r.amount_minor, r.reason, r.created_at, r.gateway_refund_id, p.paid_at,
            trim(coalesce(u.first_name,'')||' '||coalesce(u.last_name,'')) AS name, u.email
       FROM payment_refunds r JOIN intern_payments p ON p.id=r.intern_payment_id LEFT JOIN users u ON u.id=p.intern_id
       ${w} ORDER BY r.created_at DESC LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );
  return {
    total: total.rows[0]?.n ?? 0,
    rows: res.rows.map((r) => ({
      id: r.id, status: r.status, amountMinor: r.amount_minor, reason: r.reason,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
      studentName: r.name || "Unknown student", studentEmail: r.email ?? null, gatewayRefundId: r.gateway_refund_id,
    })),
  };
}

export type WebhookOutcome = "unknown" | "noop" | "refunded" | "failed" | "ignored" | `employer_${EmployerRefundOutcome}`;

/** Settles a verified refund.* webhook. Replays and out-of-order events are no-ops. */
export async function settleRefundWebhook(body: RazorpayRefundPayload): Promise<WebhookOutcome> {
  const ev = parseRefundWebhook(body);
  if (!ev) return "ignored";
  const pool = getDb().$client;
  const found = await pool.query(
    `SELECT id, status, reason, amount_minor FROM payment_refunds WHERE gateway_refund_id=$1 OR ($2::text IS NOT NULL AND idempotency_key=$2) LIMIT 1`,
    [ev.gatewayRefundId, ev.receipt],
  );
  const row = found.rows[0];
  if (!row) {
    // Not a student refund: an employer order refunded from the gateway. Recorded as a contra entry on the order.
    const entity = body.payload?.refund?.entity;
    if (!entity || body.event !== "refund.processed") return "unknown";
    const outcome = await withPgTransaction((c) => recordEmployerRefund(c, entity));
    return outcome === "not_employer" ? "unknown" : `employer_${outcome}`;
  }
  const next = applyWebhook({ status: row.status, amountMinor: Number(row.amount_minor) }, ev);
  if (!next) {
    if (row.status === "initiated" && ev.event === "refund.processed" && ev.amountMinor != null && ev.amountMinor !== Number(row.amount_minor)) {
      console.error("[refunds] processed webhook amount differs from the stored refund; left initiated for reconcile", row.id);
    }
    return "noop";
  }
  const upd = await pool.query(
    `UPDATE payment_refunds SET status=$2, settled_at=now(), updated_at=now(), gateway_refund_id=coalesce(gateway_refund_id,$3), raw=$4
      WHERE id=$1 AND status='initiated'`,
    [row.id, next, ev.gatewayRefundId, JSON.stringify(body.payload?.refund?.entity ?? {})],
  );
  if (!upd.rowCount) return "noop";
  // The status change is the record; the audit row names the system actor and the refund's reason. A failed audit write must not fail the webhook (Razorpay would retry a settled refund).
  await pool
    .query(AUDIT_SQL, [WEBHOOK_ACTOR, "refund.webhook", "payment_refunds", row.id, JSON.stringify({ refundId: row.id, from: row.status, to: next, gatewayRefundId: ev.gatewayRefundId, reason: row.reason ?? null, trigger: "razorpay webhook" })])
    .catch((e) => console.error("[refunds] webhook audit write failed", row.id, e));
  return next;
}
