// Records a Razorpay refund against the employer order it came out of. Pure SQL over a pg client, no pool, so it tests with a fake.
/** The one method used; a pg client satisfies it, and so does a test fake. */
export type QueryClient = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };
import { orderRefunds, planRefundRecord } from "../refund-accounting.ts";

export const WEBHOOK_ACTOR = "system:refund-webhook";
export const AUDIT_SQL = `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, meta) VALUES ($1,$2,$3,$4,$5::jsonb)`;

export type EmployerRefundEvent = { id?: string; payment_id?: string; amount?: number; status?: string; created_at?: number };
export type EmployerRefundOutcome = "recorded" | "duplicate" | "over_paid" | "ignored" | "not_employer";

/**
 * Settles a verified refund.processed event for an employer order. The order keeps its status and amount (the
 * tax invoice stands); the refund is appended to `raw.refunds`, keyed by the gateway refund id, so a replayed
 * event changes nothing. Call inside one transaction: the row lock serialises two events for the same order.
 */
export async function recordEmployerRefund(c: QueryClient, entity: EmployerRefundEvent): Promise<EmployerRefundOutcome> {
  if (String(entity.status ?? "").toLowerCase() !== "processed") return "ignored";
  if (!entity.payment_id) return "not_employer";
  const found = await c.query(
    `SELECT id, status, amount_minor, currency, raw FROM employer_payments WHERE payment_id = $1 LIMIT 1 FOR UPDATE`,
    [entity.payment_id],
  );
  const row = found.rows[0];
  if (!row) return "not_employer";
  const plan = planRefundRecord({ status: String(row.status), amountMinor: Number(row.amount_minor), currency: String(row.currency), raw: row.raw }, entity);
  if (plan.kind !== "recorded") return plan.kind;
  const id = row.id as string;
  await c.query(`UPDATE employer_payments SET raw = $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(plan.raw)]);
  // Same transaction as the change: the refund and its audit row land together or not at all.
  const after = orderRefunds({ status: String(row.status), amountMinor: Number(row.amount_minor), currency: String(row.currency), raw: plan.raw });
  await c.query(AUDIT_SQL, [
    WEBHOOK_ACTOR, "refund.employer_recorded", "employer_payments", id,
    JSON.stringify({ orderId: id, gatewayRefundId: entity.id, amountMinor: Math.round(Number(entity.amount)), currency: after.currency, refundedAfterMinor: after.refundedMinor, paidMinor: after.paidMinor, trigger: "razorpay webhook" }),
  ]);
  return "recorded";
}
