// Refund reconcile: settles refunds stuck in 'initiated' by asking Razorpay what became of them. No DB or HTTP here:
// the store and the gateway are injected, so the whole state machine is unit-tested with fakes.
//
// INVARIANTS (each has a test in refund-reconcile.test.ts):
//  1. Forward only. The one transition is initiated -> refunded | failed. Every other status is never touched.
//  2. Compare-and-set. The change is `UPDATE ... WHERE id=$1 AND status='initiated'`; whoever matches a row wins and
//     only the winner writes the audit row (same transaction). A webhook or a second run racing us gets a no-op.
//  3. Read-only towards Razorpay: only GET calls. It never creates, retries or cancels a refund, so it cannot double refund.
//  4. Amounts are never written. A gateway amount that differs from the stored amount_minor, or a payment id that
//     differs, is flagged for a human and the row stays 'initiated'.
//  5. Any gateway error, 404, unknown status, or 'pending' leaves the status alone.
//  6. A row with no gateway refund id is only matched by Razorpay's echoed `receipt` (= the idempotency key), exactly
//     one match. Zero or several matches are flagged, never guessed, and never marked failed: absence at the gateway
//     is not proof that no refund will appear.
//  7. Only rows older than the threshold are looked at, so a refund the admin has just initiated is left to its webhook.

import { refundReceipt } from "../razorpay.ts";

export const DEFAULT_MIN_AGE_MINUTES = 30;
export const DEFAULT_BATCH_LIMIT = 25;
export const DEFAULT_BUDGET_MS = 40_000;
export const RECONCILE_ACTOR = "system:refund-reconcile";

export interface StuckRefund {
  id: string;
  internPaymentId: string;
  amountMinor: number;
  gatewayRefundId: string | null;
  idempotencyKey: string;
  /** intern_payments.payment_id (pay_...), null if the payment row has none. */
  gatewayPaymentId: string | null;
  initiatedAt: Date | null;
}

export interface GatewayRefund {
  id: string;
  status: string;
  amountMinor: number | null;
  paymentId: string | null;
  receipt: string | null;
}

/** Read-only view of Razorpay. Throws on any failure to answer; null means a definite 404. */
export interface RefundStatusGateway {
  getRefund(gatewayRefundId: string): Promise<GatewayRefund | null>;
  listPaymentRefunds(gatewayPaymentId: string): Promise<GatewayRefund[]>;
}

export type Flag =
  | "not_found_at_gateway"
  | "id_mismatch"
  | "no_gateway_payment"
  | "no_gateway_refund"
  | "ambiguous_receipt"
  | "amount_mismatch"
  | "payment_mismatch"
  | "unknown_status";

export type StampInfo = { checkedAt: string; outcome: string; flag?: Flag; gatewayStatus?: string; error?: string };

export interface ReconcileStore {
  /**
   * status='initiated' and initiated_at (else updated_at) at least `minAgeMinutes` ago, least recently checked first.
   * The age is computed by the database clock (the columns are timestamp-without-zone; a JS Date parameter would be
   * shifted by the Node process's time zone).
   */
  findStuck(o: { minAgeMinutes: number; limit: number }): Promise<StuckRefund[]>;
  /**
   * One transaction: UPDATE payment_refunds SET status=to ... WHERE id AND status='initiated'; only if that changed a
   * row, write the audit entry. Returns false when the row was no longer 'initiated' (someone else settled it).
   */
  settle(refund: StuckRefund, to: "refunded" | "failed", gateway: GatewayRefund, at: Date): Promise<boolean>;
  /** Records the check in raw.reconcile (status untouched). Returns true when `flag` is new for this row. */
  stamp(refundId: string, info: StampInfo): Promise<{ flagChanged: boolean }>;
  /** Informational audit entry (a flag a human should look at). */
  auditFlag(refund: StuckRefund, flag: Flag, detail: Record<string, unknown>, at: Date): Promise<void>;
}

export interface ReconcileSummary {
  checked: number;
  refunded: number;
  failed: number;
  pending: number;
  noop: number;
  flagged: number;
  errors: number;
  stoppedBy: "done" | "budget";
}

export function mapGatewayStatus(status: string): "refunded" | "failed" | "pending" | null {
  if (status === "processed") return "refunded";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return null;
}

/** Positive integer minutes from env, else the default. Never below 5 (a refund the admin just made is the webhook's), at most 7 days. */
export function minAgeMinutes(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_MIN_AGE_MINUTES;
  return Math.min(Math.max(n, 5), 7 * 24 * 60);
}

type Resolved = { ok: true; gateway: GatewayRefund } | { ok: false; flag: Flag; detail?: Record<string, unknown> };

async function resolveGatewayRefund(r: StuckRefund, gw: RefundStatusGateway): Promise<Resolved> {
  if (r.gatewayRefundId) {
    const g = await gw.getRefund(r.gatewayRefundId);
    if (!g) return { ok: false, flag: "not_found_at_gateway" };
    if (g.id !== r.gatewayRefundId) return { ok: false, flag: "id_mismatch", detail: { gatewayId: g.id } };
    return { ok: true, gateway: g };
  }
  if (!r.gatewayPaymentId) return { ok: false, flag: "no_gateway_payment" };
  const receipt = refundReceipt(r.idempotencyKey);
  const hits = (await gw.listPaymentRefunds(r.gatewayPaymentId)).filter((g) => g.receipt === receipt);
  if (hits.length === 0) return { ok: false, flag: "no_gateway_refund" };
  if (hits.length > 1) return { ok: false, flag: "ambiguous_receipt", detail: { matches: hits.length } };
  return { ok: true, gateway: hits[0] };
}

function redact(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/(rzp_(?:live|test)_\w+|[A-Za-z0-9]{24,})/g, "[redacted]").slice(0, 200);
}

export async function reconcileRefunds(deps: {
  store: ReconcileStore;
  gateway: RefundStatusGateway;
  now?: () => Date;
  minAgeMinutes?: number;
  limit?: number;
  budgetMs?: number;
}): Promise<ReconcileSummary> {
  const { store, gateway } = deps;
  const clock = deps.now ?? (() => new Date());
  const started = clock().getTime();
  const budget = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const out: ReconcileSummary = { checked: 0, refunded: 0, failed: 0, pending: 0, noop: 0, flagged: 0, errors: 0, stoppedBy: "done" };

  const stuck = await store.findStuck({ minAgeMinutes: deps.minAgeMinutes ?? DEFAULT_MIN_AGE_MINUTES, limit: deps.limit ?? DEFAULT_BATCH_LIMIT });
  for (const r of stuck) {
    if (clock().getTime() - started >= budget) {
      out.stoppedBy = "budget";
      break;
    }
    out.checked += 1;
    const at = clock();
    const checkedAt = at.toISOString();
    try {
      const res = await resolveGatewayRefund(r, gateway);
      let flag: Flag | null = null;
      let detail: Record<string, unknown> = {};
      let g: GatewayRefund | null = null;
      if (!res.ok) {
        flag = res.flag;
        detail = res.detail ?? {};
      } else {
        g = res.gateway;
        if (g.amountMinor !== null && g.amountMinor !== r.amountMinor) {
          flag = "amount_mismatch";
          detail = { gatewayAmountMinor: g.amountMinor, storedAmountMinor: r.amountMinor };
        } else if (g.paymentId && r.gatewayPaymentId && g.paymentId !== r.gatewayPaymentId) {
          flag = "payment_mismatch";
          detail = { gatewayPaymentId: g.paymentId };
        }
      }
      if (!flag && g) {
        const next = mapGatewayStatus(g.status);
        if (next === "refunded" || next === "failed") {
          if (await store.settle(r, next, g, at)) out[next] += 1;
          else out.noop += 1;
          continue;
        }
        if (next === "pending") {
          out.pending += 1;
          await store.stamp(r.id, { checkedAt, outcome: "pending", gatewayStatus: g.status });
          continue;
        }
        flag = "unknown_status";
        detail = { gatewayStatus: g.status.slice(0, 40) };
      }
      out.flagged += 1;
      const { flagChanged } = await store.stamp(r.id, { checkedAt, outcome: "flagged", flag: flag!, gatewayStatus: g?.status });
      if (flagChanged) await store.auditFlag(r, flag!, { ...detail, gatewayRefundId: g?.id ?? r.gatewayRefundId }, at);
    } catch (e) {
      out.errors += 1;
      // The status is left exactly as it was; only the diagnostic stamp is attempted.
      await store.stamp(r.id, { checkedAt, outcome: "error", error: redact(e) }).catch(() => undefined);
    }
  }
  return out;
}
