// What the Refunds screen leads with: money still to send back, money sent, credit notes still owed.
// Pure (rows in, figures out) so the grouping is tested; the one query that feeds it is `loadRefundSummary`.

export type RefundStatusGroup = { status: string; count: number; amountMinor: number };

export type RefundSummary = {
  /** Eligible, under review or pending: not yet sent to the gateway. */
  toSendMinor: number;
  toSendCount: number;
  /** Sent and waiting for the gateway to confirm. */
  inFlightCount: number;
  refundedMinor: number;
  refundedCount: number;
  failedCount: number;
};

const TO_SEND = new Set(["eligible", "review", "pending"]);

export function summariseRefunds(groups: readonly RefundStatusGroup[]): RefundSummary {
  const s: RefundSummary = { toSendMinor: 0, toSendCount: 0, inFlightCount: 0, refundedMinor: 0, refundedCount: 0, failedCount: 0 };
  for (const g of groups) {
    const count = Math.max(0, Number(g.count) || 0);
    const amount = Math.max(0, Number(g.amountMinor) || 0);
    if (TO_SEND.has(g.status)) {
      s.toSendMinor += amount;
      s.toSendCount += count;
    } else if (g.status === "initiated") s.inFlightCount += count;
    else if (g.status === "refunded") {
      s.refundedMinor += amount;
      s.refundedCount += count;
    } else if (g.status === "failed") s.failedCount += count;
  }
  return s;
}

export async function loadRefundSummary(): Promise<RefundSummary> {
  const { getDb } = await import("@/lib/db");
  const res = await getDb().$client.query(`SELECT status, count(*)::int AS count, coalesce(sum(amount_minor),0)::bigint AS amount FROM payment_refunds GROUP BY status`);
  return summariseRefunds(res.rows.map((r: { status: string; count: number; amount: string | number }) => ({ status: r.status, count: r.count, amountMinor: Number(r.amount) })));
}
