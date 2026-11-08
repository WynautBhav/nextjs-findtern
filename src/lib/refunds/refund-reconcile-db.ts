// Postgres + Razorpay wiring for the refund reconcile job. Callers must already be authorised (the cron route).
import { redactMeta } from "../admin/audit.ts";
import { getDb } from "../db/index.ts";
import { withPgTransaction } from "../db/pg-tx.ts";
import { fetchGatewayRefund, listGatewayPaymentRefunds, razorpayConfigured } from "../razorpay.ts";
import {
  RECONCILE_ACTOR, minAgeMinutes, reconcileRefunds,
  type ReconcileStore, type ReconcileSummary, type RefundStatusGateway,
} from "./refund-reconcile.ts";

const AUDIT_SQL = `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, meta) VALUES ($1,'refund.reconcile','payment_refunds',$2,$3::jsonb)`;

export function pgReconcileStore(): ReconcileStore {
  const pool = () => getDb().$client;
  return {
    async findStuck({ olderThan, limit }) {
      // Never-checked rows first, then the least recently checked (ISO strings sort as time), so rows that stay
      // unresolved cannot starve newer ones.
      const r = await pool().query(
        `SELECT r.id, r.intern_payment_id, r.amount_minor, r.gateway_refund_id, r.idempotency_key, r.initiated_at,
                p.payment_id AS gateway_payment_id
           FROM payment_refunds r LEFT JOIN intern_payments p ON p.id = r.intern_payment_id
          WHERE r.status = 'initiated' AND coalesce(r.initiated_at, r.updated_at, r.created_at) <= $1
          ORDER BY coalesce(r.raw->'reconcile'->>'checkedAt', '') ASC, r.initiated_at ASC NULLS FIRST
          LIMIT $2`,
        [olderThan, limit],
      );
      return r.rows.map((x) => ({
        id: x.id, internPaymentId: x.intern_payment_id, amountMinor: x.amount_minor, gatewayRefundId: x.gateway_refund_id,
        idempotencyKey: x.idempotency_key, gatewayPaymentId: x.gateway_payment_id ?? null, initiatedAt: x.initiated_at ?? null,
      }));
    },

    async settle(refund, to, g, at) {
      return withPgTransaction(async (c) => {
        const upd = await c.query(
          `UPDATE payment_refunds
              SET status = $2, settled_at = now(), updated_at = now(), gateway_refund_id = coalesce(gateway_refund_id, $3),
                  raw = coalesce(raw, '{}'::jsonb) || $4::jsonb
            WHERE id = $1 AND status = 'initiated'`,
          [refund.id, to, g.id, JSON.stringify({ id: g.id, status: g.status, amount: g.amountMinor, reconcile: { via: "cron", checkedAt: at.toISOString(), outcome: to } })],
        );
        if (!upd.rowCount) return false;
        const meta = redactMeta({
          refundId: refund.id, from: "initiated", to, gatewayRefundId: g.id, gatewayStatus: g.status,
          gatewayAmountMinor: g.amountMinor, storedAmountMinor: refund.amountMinor, trigger: "refund-reconcile cron", at: at.toISOString(),
        });
        // In the same transaction: the status change and its audit row commit together or not at all.
        await c.query(AUDIT_SQL, [RECONCILE_ACTOR, refund.id, JSON.stringify(meta)]);
        return true;
      });
    },

    async stamp(refundId, info) {
      return withPgTransaction(async (c) => {
        const cur = await c.query(`SELECT raw->'reconcile'->>'flag' AS flag FROM payment_refunds WHERE id = $1 AND status = 'initiated' FOR UPDATE`, [refundId]);
        if (!cur.rows[0]) return { flagChanged: false }; // settled meanwhile: leave it be
        await c.query(
          `UPDATE payment_refunds SET raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('reconcile', $2::jsonb) WHERE id = $1 AND status = 'initiated'`,
          [refundId, JSON.stringify(info)],
        );
        return { flagChanged: info.flag !== undefined && cur.rows[0].flag !== info.flag };
      });
    },

    async auditFlag(refund, flag, detail, at) {
      const meta = redactMeta({ refundId: refund.id, flag, ...detail, storedAmountMinor: refund.amountMinor, trigger: "refund-reconcile cron", at: at.toISOString() });
      await pool().query(AUDIT_SQL, [RECONCILE_ACTOR, refund.id, JSON.stringify(meta)]);
    },
  };
}

export const razorpayStatusGateway: RefundStatusGateway = {
  getRefund: (id) => fetchGatewayRefund(id),
  listPaymentRefunds: (paymentId) => listGatewayPaymentRefunds(paymentId),
};

export type ReconcileRun = { skipped: true; reason: string } | ({ skipped: false } & ReconcileSummary);

/**
 * The cron entry point. Off unless REFUND_RECONCILE=1 AND the Razorpay keys are present; when off it touches
 * neither the database nor Razorpay.
 */
export async function runRefundReconcile(env: Record<string, string | undefined> = process.env): Promise<ReconcileRun> {
  if (env.REFUND_RECONCILE !== "1") return { skipped: true, reason: "REFUND_RECONCILE is off" };
  if (!razorpayConfigured(env)) return { skipped: true, reason: "Razorpay keys are not configured" };
  const summary = await reconcileRefunds({
    store: pgReconcileStore(),
    gateway: razorpayStatusGateway,
    minAgeMinutes: minAgeMinutes(env.REFUND_RECONCILE_MIN_AGE_MINUTES),
  });
  return { skipped: false, ...summary };
}
