import type { PaymentRefund, RefundStatus } from "../db/schema.ts";
import type { RazorpayRefund } from "../razorpay.ts";

/**
 * College-seat refunds (directive §4, owner OA6): a student on a partner
 * college's roster (or verified with it) who paid the activation fee
 * themselves gets back what they actually paid, only while the AI interview
 * is not taken, and the refund uses one of the college's paid seats.
 *
 * State machine (frozen in PLAN §2.3):
 *   eligible | requires_review  (opened by an admin)
 *   eligible|failed --initiate--> pending --Razorpay--> initiated | refunded | failed
 *   pending (no gateway id, stale) --refresh finds nothing--> failed (safe to retry)
 *   requires_review --mark_manual--> refunded
 *   eligible|requires_review|failed --reject--> rejected
 *   pending (no gateway id, stale, nothing at Razorpay) --cancel--> eligible (seat released)
 * The final status comes only from Razorpay (webhook, refresh, cron), never from our own call.
 *
 * The rules at the top are pure (unit-tested); the DB work below loads its
 * modules lazily so the rules stay importable from plain-node tests.
 */

/** Our gateway call times out at 20 s; a `pending` row with no gateway id older than this is not in flight any more. */
export const REFUND_STALE_MS = 2 * 60_000;
/** The reconcile job looks at `pending` / `initiated` rows older than this. */
export const RECONCILE_AFTER_MS = 15 * 60_000;

export const REFUND_ERRORS = {
  usedCode: "This student used the college code",
  notPaid: "Not a paid activation",
  noSeats: "College has no seats left",
  noSeatCode: "This college has no seat code yet, so a refund can't use one of its seats.",
  notLinked: "This student isn't on a partner college's roster or verified with one.",
  open: "A refund is already open for this payment.",
  interviewNow: "The student has taken the AI interview since this refund was opened, so it now needs review.",
  inFlight: "A refund call to Razorpay may still be in progress. Refresh this refund in two minutes before retrying.",
} as const;

export const REVIEW_REASON_LABELS: Record<string, string> = {
  interview_taken: "AI interview taken",
  not_gateway: "Not paid through Razorpay",
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  eligible: "Eligible",
  requires_review: "Needs review",
  pending: "Sending to Razorpay",
  initiated: "Refund started",
  refunded: "Refunded",
  failed: "Failed",
  rejected: "Rejected",
};

export type RefundDecision =
  | { kind: "eligible" }
  | { kind: "requires_review"; reason: "interview_taken" | "not_gateway" }
  | { kind: "none"; error: string };

type PaymentFacts = { status: string; amountMinor: number; gateway: string; paymentId: string | null };

/** A Razorpay payment we can refund through the API (not manual, test, free, or a checkout that never captured). */
export function isGatewayPayment(p: Pick<PaymentFacts, "gateway" | "paymentId">): boolean {
  return p.gateway === "razorpay" && /^pay_[A-Za-z0-9]+$/.test(p.paymentId ?? "");
}

/**
 * The AI interview counts as taken once a link is out (scheduled or sent) or it is done: a sent link
 * can't be taken back, so only "not applied / applied / expired" refund automatically.
 * Input is `aiInterviewStatus()` from lib/admin/scope.
 */
export function interviewTakenFrom(aiStatus: string | null | undefined): boolean {
  return aiStatus === "completed" || aiStatus === "sent" || aiStatus === "scheduled";
}

/** What a refund for this payment would be. Pure. */
export function refundDecision(input: {
  payment: PaymentFacts;
  usedCollegeCode: boolean;
  interviewTaken: boolean;
  /** The payment's latest refund row, if any. */
  existingRefund: { status: RefundStatus } | null;
}): RefundDecision {
  const { payment, existingRefund } = input;
  if (existingRefund && existingRefund.status !== "rejected") return { kind: "none", error: REFUND_ERRORS.open };
  if (payment.status !== "paid" || payment.amountMinor <= 0) return { kind: "none", error: REFUND_ERRORS.notPaid };
  if (input.usedCollegeCode) return { kind: "none", error: REFUND_ERRORS.usedCode };
  if (input.interviewTaken) return { kind: "requires_review", reason: "interview_taken" };
  if (!isGatewayPayment(payment)) return { kind: "requires_review", reason: "not_gateway" };
  return { kind: "eligible" };
}

export type RefundAction = "initiate" | "refresh" | "mark_manual" | "reject" | "cancel";

type RowFacts = Pick<PaymentRefund, "status" | "gatewayRefundId" | "updatedAt">;

/** A `pending` row whose gateway call never answered and is certainly over. */
export function stalePending(row: RowFacts, now: Date): boolean {
  return row.status === "pending" && !row.gatewayRefundId && now.getTime() - row.updatedAt.getTime() > REFUND_STALE_MS;
}

/** Why this action is refused in the row's state, or null when it is allowed. Pure. */
export function actionProblem(action: RefundAction, row: RowFacts, now: Date): string | null {
  const s = row.status;
  switch (action) {
    case "initiate":
      if (s === "pending" && !row.gatewayRefundId) return REFUND_ERRORS.inFlight;
      return s === "eligible" || s === "failed" ? null : `A refund that is ${REFUND_STATUS_LABELS[s].toLowerCase()} can't be started.`;
    case "refresh":
      return null;
    case "mark_manual":
      return s === "requires_review" ? null : "Only a refund that needs review can be marked as refunded by hand.";
    case "reject":
      return s === "eligible" || s === "requires_review" || s === "failed" ? null : `A refund that is ${REFUND_STATUS_LABELS[s].toLowerCase()} can't be rejected.`;
    case "cancel":
      if (s !== "pending" || row.gatewayRefundId) return "Only a refund stuck before Razorpay answered can be cancelled.";
      return stalePending(row, now) ? null : REFUND_ERRORS.inFlight;
  }
}

/**
 * The row's next status from a Razorpay refund status, or null for no change.
 * `refunded` and `rejected` are final; a `failed` row can still be adopted by a late success
 * (the stale-pending case, where our call timed out but Razorpay made the refund).
 */
export function statusFromGateway(current: RefundStatus, gatewayStatus: string): RefundStatus | null {
  if (current !== "pending" && current !== "initiated" && current !== "failed") return null;
  const next: RefundStatus | null =
    gatewayStatus === "processed" ? "refunded" : gatewayStatus === "failed" ? "failed" : gatewayStatus === "pending" ? "initiated" : null;
  if (!next || next === current) return null;
  // A failed row only moves forward on a real success; a "pending" answer about an old attempt doesn't reopen it.
  if (current === "failed" && next !== "refunded") return null;
  return next;
}

/** The refund in Razorpay's list that this row made (our notes or receipt carry the row id). */
export function matchRefund(items: RazorpayRefund[], refundId: string): RazorpayRefund | undefined {
  return items.find((r) => {
    const notes = r.notes && !Array.isArray(r.notes) ? (r.notes as Record<string, string>) : {};
    return notes.refund_id === refundId || (typeof r.receipt === "string" && r.receipt.startsWith(refundId.slice(0, 26)));
  });
}

/**
 * Razorpay refuses a second refund with the same receipt on a payment. The first attempt uses the row id, so a
 * retry after a timeout cannot double-refund; a retry after a refund Razorpay itself failed needs a new receipt,
 * derived from the failed refund so it too is the same on every try.
 */
export function receiptFor(refundId: string, lastFailedGatewayId: string | null): string {
  return lastFailedGatewayId ? `${refundId.slice(0, 26)}-${lastFailedGatewayId.slice(-13)}` : refundId;
}

/** The id of the Razorpay refund that failed last on this row, kept in `gateway_response`. */
export function lastFailedGatewayId(row: Pick<PaymentRefund, "gatewayResponse">): string | null {
  const r = row.gatewayResponse as { id?: unknown; status?: unknown } | null;
  return r && r.status === "failed" && typeof r.id === "string" ? r.id : null;
}

/* ── DB work ─────────────────────────────────────────────────────────── */

export type RefundResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

class Refused extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function deps() {
  const [db, orm, promo, payments, audit, scope, razorpay] = await Promise.all([
    import("@/lib/db"),
    import("drizzle-orm"),
    import("@/lib/promo"),
    import("@/lib/payments"),
    import("@/lib/admin/audit"),
    import("@/lib/admin/scope"),
    import("@/lib/razorpay"),
  ]);
  return { ...db, orm, promo, payments, audit, scope, razorpay };
}

type Deps = Awaited<ReturnType<typeof deps>>;
type Db = ReturnType<Deps["getDb"]>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Audit actor for webhook / cron writes. */
export const SYSTEM_ACTOR = "system";

export type RefundCandidate = {
  internPaymentId: string;
  internId: string;
  studentName: string;
  registeredEmail: string;
  collegeEmail: string | null;
  phone: string | null;
  collegeId: string;
  collegeName: string;
  orderId: string;
  paymentId: string | null;
  gateway: string;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  interviewStatus: string;
  decision: RefundDecision;
  refund: {
    id: string;
    status: RefundStatus;
    reviewReason: string | null;
    gatewayRefundId: string | null;
    lastError: string | null;
    manualReference: string | null;
    amountMinor: number;
    updatedAt: string;
  } | null;
};

/**
 * Paid individual activations of students linked to a college: a verified membership, else a roster row matched
 * by email or linked by an admin. One row per paid payment with its latest refund. Small by nature (paying
 * students of partner colleges), so filtering by status happens after the decision is known.
 */
export async function refundCandidates(filter: { collegeId?: string; internPaymentId?: string; status?: string } = {}): Promise<RefundCandidate[]> {
  const d = await deps();
  const { sql } = d.orm;
  const s = d.schema;
  const res = await d.getDb().execute(sql`
    WITH linked AS (
      SELECT DISTINCT ON (user_id) user_id, college_id FROM (
        SELECT m.user_id, m.college_id, 0 AS rank FROM ${s.collegeMemberships} m WHERE m.left_at IS NULL AND m.status = 'verified'
        UNION ALL
        SELECT r.matched_user_id, r.college_id, 1 FROM ${s.collegeRoster} r WHERE r.matched_user_id IS NOT NULL AND r.match_status IN ('email', 'linked')
      ) x ORDER BY user_id, rank
    )
    SELECT p.id AS payment_row_id, p.intern_id, p.order_id, p.payment_id, p.gateway, p.amount_minor, p.currency, p.status AS payment_status,
      (p.paid_at AT TIME ZONE 'UTC') AS paid_at,
      ${s.users.firstName} AS first_name, ${s.users.lastName} AS last_name, ${s.users.email} AS email,
      ${s.users.countryCode} AS country_code, ${s.users.phoneNumber} AS phone_number,
      coalesce(rf.college_id, l.college_id) AS college_id, c.name AS college_name,
      (SELECT r.email FROM ${s.collegeRoster} r WHERE r.college_id = coalesce(rf.college_id, l.college_id)
         AND (r.matched_user_id = p.intern_id OR r.email = lower(${s.users.email})) ORDER BY (r.matched_user_id = p.intern_id) DESC LIMIT 1) AS college_email,
      ${d.scope.aiInterviewStatus()} AS ai_status,
      EXISTS (SELECT 1 FROM ${s.promoCodeUsages} u JOIN ${s.promoCodes} pc ON pc.id = u.promo_code_id
        WHERE u.user_id = p.intern_id AND pc.college_id = coalesce(rf.college_id, l.college_id)
          AND coalesce(u.order_id, '') NOT LIKE 'refund:%') AS used_code,
      rf.id AS refund_id, rf.status AS refund_status, rf.review_reason, rf.gateway_refund_id, rf.last_error, rf.manual_reference,
      rf.amount_minor AS refund_amount_minor, (rf.updated_at AT TIME ZONE 'UTC') AS refund_updated_at
    FROM ${s.internPayments} p
    JOIN ${s.users} ON ${s.users.id} = p.intern_id
    LEFT JOIN ${s.internOnboarding} ON ${s.internOnboarding.userId} = p.intern_id
    LEFT JOIN linked l ON l.user_id = p.intern_id
    LEFT JOIN LATERAL (
      SELECT * FROM ${s.paymentRefunds} x WHERE x.intern_payment_id = p.id ORDER BY x.created_at DESC LIMIT 1
    ) rf ON true
    JOIN ${s.colleges} c ON c.id = coalesce(rf.college_id, l.college_id)
    WHERE p.status = 'paid' AND p.amount_minor > 0
      ${filter.collegeId ? sql`AND c.id = ${filter.collegeId}` : sql``}
      ${filter.internPaymentId ? sql`AND p.id = ${filter.internPaymentId}` : sql``}
    ORDER BY p.paid_at DESC NULLS LAST, p.id
    LIMIT 2000
  `);
  const rows = (res.rows as Record<string, unknown>[]).map((r): RefundCandidate => {
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
    const refundStatus = str(r.refund_status) as RefundStatus | null;
    const payment = { status: String(r.payment_status), amountMinor: Number(r.amount_minor), gateway: String(r.gateway), paymentId: str(r.payment_id) };
    const interviewStatus = String(r.ai_status ?? "not_applied");
    const phone = str(r.phone_number);
    return {
      internPaymentId: String(r.payment_row_id),
      internId: String(r.intern_id),
      studentName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Student",
      registeredEmail: String(r.email),
      collegeEmail: str(r.college_email),
      phone: phone ? `${str(r.country_code) ?? ""} ${phone}`.trim() : null,
      collegeId: String(r.college_id),
      collegeName: String(r.college_name),
      orderId: String(r.order_id),
      paymentId: payment.paymentId,
      gateway: payment.gateway,
      amountMinor: payment.amountMinor,
      currency: String(r.currency ?? "INR"),
      paidAt: d.dbTimestamp(r.paid_at)?.toISOString() ?? null,
      interviewStatus,
      decision: refundDecision({
        payment,
        usedCollegeCode: r.used_code === true,
        interviewTaken: interviewTakenFrom(interviewStatus),
        // The eligibility column is about the payment itself; the refund row is shown beside it.
        existingRefund: null,
      }),
      refund: r.refund_id
        ? {
            id: String(r.refund_id),
            status: refundStatus!,
            reviewReason: str(r.review_reason),
            gatewayRefundId: str(r.gateway_refund_id),
            lastError: str(r.last_error),
            manualReference: str(r.manual_reference),
            amountMinor: Number(r.refund_amount_minor),
            updatedAt: d.dbTimestamp(r.refund_updated_at)?.toISOString() ?? "",
          }
        : null,
    };
  });
  if (!filter.status) return rows;
  return rows.filter((r) => displayStatus(r) === filter.status);
}

/** The status shown in the table: the refund row's, else what opening one would give ("none" = not refundable). */
export function displayStatus(c: Pick<RefundCandidate, "refund" | "decision">): RefundStatus | "none" {
  if (c.refund) return c.refund.status;
  return c.decision.kind === "none" ? "none" : c.decision.kind;
}

/** POST /api/admin/refunds: opens the refund row for a payment, or returns the open one. */
export async function openRefund(internPaymentId: string, adminId: string): Promise<RefundResult<{ refundId: string; status: RefundStatus; amountMinor: number; reviewReason: string | null; created: boolean }>> {
  const d = await deps();
  const [c] = await refundCandidates({ internPaymentId });
  if (!c) {
    const p = d.schema.internPayments;
    const [pay] = await d.getDb().select({ status: p.status, amountMinor: p.amountMinor }).from(p).where(d.orm.eq(p.id, internPaymentId)).limit(1);
    if (!pay) return { ok: false, status: 404, error: "Payment not found." };
    return { ok: false, status: 409, error: pay.status !== "paid" || pay.amountMinor <= 0 ? REFUND_ERRORS.notPaid : REFUND_ERRORS.notLinked };
  }
  if (c.refund && c.refund.status !== "rejected") {
    return { ok: true, value: { refundId: c.refund.id, status: c.refund.status, amountMinor: c.refund.amountMinor, reviewReason: c.refund.reviewReason, created: false } };
  }
  if (c.decision.kind === "none") return { ok: false, status: 409, error: c.decision.error };
  const status: RefundStatus = c.decision.kind;
  const reviewReason = c.decision.kind === "requires_review" ? c.decision.reason : null;
  const db = d.getDb();
  try {
    const row = await db.transaction(async (tx) => {
      const [rosterRow] = await tx
        .select({ id: d.schema.collegeRoster.id })
        .from(d.schema.collegeRoster)
        .where(d.orm.and(d.orm.eq(d.schema.collegeRoster.collegeId, c.collegeId), d.orm.or(d.orm.eq(d.schema.collegeRoster.matchedUserId, c.internId), d.orm.eq(d.schema.collegeRoster.email, c.registeredEmail.toLowerCase()))))
        .limit(1);
      const [inserted] = await tx
        .insert(d.schema.paymentRefunds)
        .values({
          internPaymentId: c.internPaymentId,
          internId: c.internId,
          collegeId: c.collegeId,
          rosterId: rosterRow?.id ?? null,
          amountMinor: c.amountMinor,
          status,
          reviewReason,
          gateway: c.gateway,
        })
        .returning();
      await d.audit.recordAdminAudit(tx, { adminId, action: "refund.create", targetType: "payment_refund", targetId: inserted.id, meta: { internId: c.internId, collegeId: c.collegeId, internPaymentId: c.internPaymentId, amountMinor: c.amountMinor, status, reviewReason } }, { strict: true });
      return inserted;
    });
    return { ok: true, value: { refundId: row.id, status: row.status, amountMinor: row.amountMinor, reviewReason: row.reviewReason, created: true } };
  } catch (e) {
    // Two admins at once: the live-row index lets one insert win; the other gets that row.
    if (!d.promo.isUniqueViolation(e)) throw e;
    const [live] = await refundCandidates({ internPaymentId });
    if (!live?.refund) throw e;
    return { ok: true, value: { refundId: live.refund.id, status: live.refund.status, amountMinor: live.refund.amountMinor, reviewReason: live.refund.reviewReason, created: false } };
  }
}

async function lockRow(d: Deps, tx: Tx, id: string): Promise<PaymentRefund> {
  const [row] = await tx.select().from(d.schema.paymentRefunds).where(d.orm.eq(d.schema.paymentRefunds.id, id)).for("update").limit(1);
  if (!row) throw new Refused(404, "Refund not found.");
  return row;
}

async function interviewStatusOf(d: Deps, ex: Db | Tx, internId: string): Promise<string> {
  const [r] = await ex
    .select({ s: d.scope.aiInterviewStatus() })
    .from(d.schema.users)
    .leftJoin(d.schema.internOnboarding, d.orm.eq(d.schema.internOnboarding.userId, d.schema.users.id))
    .where(d.orm.eq(d.schema.users.id, internId))
    .limit(1);
  return r?.s ?? "not_applied";
}

/**
 * One college seat for this refund, in the caller's transaction: reuses this refund's own use on a retry,
 * otherwise records a use of the college's code under the cap. Throws Refused (rolling the transaction back) when
 * the college has no seats, its code is switched off, or the student already used the code.
 */
async function claimSeat(d: Deps, tx: Tx, row: PaymentRefund): Promise<string> {
  const { eq, and } = d.orm;
  const s = d.schema;
  const [code] = await tx.select({ id: s.promoCodes.id, code: s.promoCodes.code }).from(s.promoCodes).where(eq(s.promoCodes.collegeId, row.collegeId)).orderBy(s.promoCodes.createdAt).limit(1);
  if (!code) throw new Refused(409, REFUND_ERRORS.noSeatCode);
  const orderId = `refund:${row.id}`;
  const [prior] = await tx
    .select({ id: s.promoCodeUsages.id, orderId: s.promoCodeUsages.orderId })
    .from(s.promoCodeUsages)
    .where(and(eq(s.promoCodeUsages.promoCodeId, code.id), eq(s.promoCodeUsages.userId, row.internId)))
    .limit(1);
  if (prior) {
    if (prior.orderId === orderId) return prior.id;
    throw new Refused(409, prior.orderId?.startsWith("refund:") ? "This student already has a refund that used a college seat." : REFUND_ERRORS.usedCode);
  }
  const use = await d.promo.recordPromoUse({ code: code.code, subjectId: row.internId, orderId, discountMinor: row.amountMinor, enforceCap: true }, tx);
  if (use.refused) throw new Refused(409, use.refused);
  if (use.capped) throw new Refused(409, REFUND_ERRORS.noSeats);
  const [mine] = await tx
    .select({ id: s.promoCodeUsages.id })
    .from(s.promoCodeUsages)
    .where(and(eq(s.promoCodeUsages.promoCodeId, code.id), eq(s.promoCodeUsages.userId, row.internId), eq(s.promoCodeUsages.orderId, orderId)))
    .limit(1);
  if (!mine) throw new Refused(409, REFUND_ERRORS.noSeats);
  return mine.id;
}

/** The seat covers the student like the college code does: verified with that college (only when not verified with it already). */
async function verifyMember(d: Deps, tx: Tx, row: PaymentRefund): Promise<void> {
  const m = d.schema.collegeMemberships;
  const [mine] = await tx.select({ collegeId: m.collegeId, status: m.status, leftAt: m.leftAt }).from(m).where(d.orm.eq(m.userId, row.internId)).limit(1);
  if (mine && mine.collegeId === row.collegeId && mine.status === "verified" && !mine.leftAt) return;
  await d.payments.verifyByCollegeCode(tx, row.internId, row.collegeId);
}

async function run<T>(fn: () => Promise<T>): Promise<RefundResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof Refused) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
}

async function loadRow(d: Deps, id: string): Promise<PaymentRefund | null> {
  const [row] = await d.getDb().select().from(d.schema.paymentRefunds).where(d.orm.eq(d.schema.paymentRefunds.id, id)).limit(1);
  return row ?? null;
}

async function paymentOf(d: Deps, ex: Db | Tx, row: PaymentRefund) {
  const p = d.schema.internPayments;
  const [payment] = await ex.select({ status: p.status, amountMinor: p.amountMinor, paymentId: p.paymentId, gateway: p.gateway }).from(p).where(d.orm.eq(p.id, row.internPaymentId)).limit(1);
  return payment ?? null;
}

/**
 * Applies a Razorpay refund to the row (adopting its id when the row had none). Conditional on the status read,
 * so a webhook and a refresh racing apply once. Audited when the status changes.
 */
async function applyGateway(d: Deps, row: PaymentRefund, refund: RazorpayRefund, actor: string): Promise<PaymentRefund> {
  const { eq, and } = d.orm;
  const s = d.schema.paymentRefunds;
  const next = statusFromGateway(row.status, refund.status);
  const now = new Date();
  const db = d.getDb();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(s)
      .set({
        gatewayRefundId: refund.id,
        gatewayStatus: refund.status,
        gatewayResponse: refund as Record<string, unknown>,
        ...(next ? { status: next } : {}),
        ...(next === "refunded" ? { settledAt: now, lastError: null } : {}),
        ...(next === "failed" ? { lastError: "Razorpay could not process this refund. You can retry it." } : {}),
        ...(next === "initiated" ? { lastError: null } : {}),
        updatedAt: now,
      })
      .where(and(eq(s.id, row.id), eq(s.status, row.status)))
      .returning();
    if (!updated) return (await tx.select().from(s).where(eq(s.id, row.id)).limit(1))[0];
    if (next === "refunded" || next === "failed") {
      await d.audit.recordAdminAudit(
        tx,
        { adminId: actor, action: next === "refunded" ? "refund.settle" : "refund.fail", targetType: "payment_refund", targetId: row.id, meta: { gatewayRefundId: refund.id, gatewayStatus: refund.status, amountMinor: refund.amount } },
        { strict: true },
      );
    }
    return updated;
  });
}

/** PATCH initiate: claims the seat and moves to `pending` in one transaction, then calls Razorpay outside it. */
export async function initiateRefund(id: string, adminId: string, confirmAmountMinor: number): Promise<RefundResult<{ status: RefundStatus; gatewayRefundId: string | null }>> {
  const d = await deps();
  const db = d.getDb();
  const s = d.schema.paymentRefunds;
  const now = new Date();
  const locked = await run(() =>
    db.transaction(async (tx) => {
      const row = await lockRow(d, tx, id);
      const problem = actionProblem("initiate", row, now);
      if (problem) throw new Refused(409, problem);
      if (confirmAmountMinor !== row.amountMinor) throw new Refused(409, "The amount you confirmed doesn't match this refund. Reload and confirm again.");
      const payment = await paymentOf(d, tx, row);
      if (!payment || payment.status !== "paid" || payment.amountMinor !== row.amountMinor) throw new Refused(409, REFUND_ERRORS.notPaid);
      if (!isGatewayPayment(payment)) throw new Refused(409, "This payment didn't go through Razorpay. Mark it refunded by hand once you have paid it back.");
      if (interviewTakenFrom(await interviewStatusOf(d, tx, row.internId))) {
        await tx.update(s).set({ status: "requires_review", reviewReason: "interview_taken", updatedAt: now }).where(d.orm.eq(s.id, row.id));
        return { row, payment, review: true as const };
      }
      const seatUsageId = await claimSeat(d, tx, row);
      await verifyMember(d, tx, row);
      const [pending] = await tx
        .update(s)
        .set({ status: "pending", seatUsageId, initiatedBy: adminId, initiatedAt: now, gatewayRefundId: null, gatewayStatus: null, lastError: null, updatedAt: now })
        .where(d.orm.eq(s.id, row.id))
        .returning();
      await d.audit.recordAdminAudit(tx, { adminId, action: "refund.initiate", targetType: "payment_refund", targetId: row.id, meta: { amountMinor: row.amountMinor, seatUsageId, retry: row.status === "failed" } }, { strict: true });
      return { row: pending, previous: row, payment, review: false as const };
    }),
  );
  if (!locked.ok) return locked;
  if (locked.value.review) return { ok: false, status: 409, error: REFUND_ERRORS.interviewNow };
  const { row, previous, payment } = locked.value;

  const receipt = receiptFor(row.id, lastFailedGatewayId(previous));
  try {
    const refund = await d.razorpay.createRefund(payment.paymentId!, row.amountMinor, receipt, { refund_id: row.id, intern_id: row.internId, college_id: row.collegeId });
    const after = await applyGateway(d, row, refund, adminId);
    return { ok: true, value: { status: after.status, gatewayRefundId: after.gatewayRefundId } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Razorpay refund call failed";
    // A refused or timed-out call may still have made the refund (a duplicate receipt says it did): adopt it if so.
    const adopted = await d.razorpay.listRefunds(payment.paymentId!).then((items) => matchRefund(items, row.id)).catch(() => undefined);
    if (adopted) {
      const after = await applyGateway(d, row, adopted, adminId);
      return { ok: true, value: { status: after.status, gatewayRefundId: after.gatewayRefundId } };
    }
    await db.update(s).set({ lastError: message.slice(0, 500) }).where(d.orm.and(d.orm.eq(s.id, row.id), d.orm.eq(s.status, "pending")));
    return { ok: false, status: 502, error: `Razorpay didn't take the refund: ${message}. Refresh it in two minutes before trying again.` };
  }
}

/**
 * PATCH refresh (and the reconcile job): the row's state from Razorpay. With a gateway id, fetch that refund;
 * without one, look for ours among the payment's refunds; a stale `pending` with nothing there becomes `failed`.
 */
export async function refreshRefund(id: string, actor: string): Promise<RefundResult<{ status: RefundStatus; gatewayRefundId: string | null; lastError: string | null }>> {
  const d = await deps();
  const row = await loadRow(d, id);
  if (!row) return { ok: false, status: 404, error: "Refund not found." };
  const out = (r: PaymentRefund) => ({ ok: true as const, value: { status: r.status, gatewayRefundId: r.gatewayRefundId, lastError: r.lastError } });
  if (row.status !== "pending" && row.status !== "initiated" && row.status !== "failed") return out(row);
  const db = d.getDb();
  const payment = await paymentOf(d, db, row);
  if (!payment || !isGatewayPayment(payment)) return out(row);
  try {
    if (row.gatewayRefundId) {
      if (row.status === "failed") return out(row); // Razorpay's failed is final; a retry starts a new refund
      return out(await applyGateway(d, row, await d.razorpay.fetchRefund(row.gatewayRefundId), actor));
    }
    const found = matchRefund(await d.razorpay.listRefunds(payment.paymentId!), row.id);
    if (found) return out(await applyGateway(d, row, found, actor));
    if (!stalePending(row, new Date())) return out(row);
    const s = d.schema.paymentRefunds;
    const failed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(s)
        .set({ status: "failed", lastError: "No refund reached Razorpay for this attempt. You can retry it.", updatedAt: new Date() })
        .where(d.orm.and(d.orm.eq(s.id, row.id), d.orm.eq(s.status, "pending"), d.orm.isNull(s.gatewayRefundId)))
        .returning();
      if (updated) await d.audit.recordAdminAudit(tx, { adminId: actor, action: "refund.fail", targetType: "payment_refund", targetId: row.id, meta: { reason: "no_refund_at_gateway" } }, { strict: true });
      return updated;
    });
    return out(failed ?? (await loadRow(d, id))!);
  } catch (e) {
    return { ok: false, status: 502, error: `Couldn't reach Razorpay: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

/** Webhook `refund.processed` / `refund.failed`: by gateway id, else (a call that timed out) by our row id in the notes. */
export async function settleFromWebhook(entity: RazorpayRefund): Promise<"updated" | "ignored"> {
  const d = await deps();
  const s = d.schema.paymentRefunds;
  const db = d.getDb();
  let [row] = await db.select().from(s).where(d.orm.eq(s.gatewayRefundId, entity.id)).limit(1);
  if (!row) {
    const notes = entity.notes && !Array.isArray(entity.notes) ? (entity.notes as Record<string, string>) : {};
    const byNote = typeof notes.refund_id === "string" ? await loadRow(d, notes.refund_id) : null;
    if (!byNote || byNote.gatewayRefundId) return "ignored";
    const payment = await paymentOf(d, db, byNote);
    if (!payment || payment.paymentId !== entity.payment_id) return "ignored";
    row = byNote;
  }
  const before = row.status;
  const after = await applyGateway(d, row, entity, SYSTEM_ACTOR);
  return after.status !== before || after.gatewayRefundId !== row.gatewayRefundId ? "updated" : "ignored";
}

/** PATCH mark_manual: the money went back outside the API (manual / test payment, or after review). Uses one seat too (OA6). */
export async function markManualRefund(id: string, adminId: string, reference: string): Promise<RefundResult<{ status: RefundStatus }>> {
  const d = await deps();
  const s = d.schema.paymentRefunds;
  return run(() =>
    d.getDb().transaction(async (tx) => {
      const row = await lockRow(d, tx, id);
      const problem = actionProblem("mark_manual", row, new Date());
      if (problem) throw new Refused(409, problem);
      const seatUsageId = await claimSeat(d, tx, row);
      await verifyMember(d, tx, row);
      const now = new Date();
      await tx.update(s).set({ status: "refunded", manualReference: reference, seatUsageId, initiatedBy: adminId, initiatedAt: now, settledAt: now, lastError: null, updatedAt: now }).where(d.orm.eq(s.id, row.id));
      await d.audit.recordAdminAudit(tx, { adminId, action: "refund.manual", targetType: "payment_refund", targetId: row.id, meta: { reference, amountMinor: row.amountMinor, seatUsageId, reviewReason: row.reviewReason } }, { strict: true });
      return { status: "refunded" as const };
    }),
  );
}

/** PATCH reject: closes the refund with a reason; a seat a failed attempt held goes back to the college. */
export async function rejectRefund(id: string, adminId: string, reason: string): Promise<RefundResult<{ status: RefundStatus }>> {
  const d = await deps();
  const s = d.schema.paymentRefunds;
  return run(() =>
    d.getDb().transaction(async (tx) => {
      const row = await lockRow(d, tx, id);
      const problem = actionProblem("reject", row, new Date());
      if (problem) throw new Refused(409, problem);
      if (row.seatUsageId) await d.promo.releasePromoUse(row.seatUsageId, tx);
      await tx.update(s).set({ status: "rejected", reviewReason: reason, seatUsageId: null, updatedAt: new Date() }).where(d.orm.eq(s.id, row.id));
      await d.audit.recordAdminAudit(tx, { adminId, action: "refund.reject", targetType: "payment_refund", targetId: row.id, meta: { reason, from: row.status, releasedSeat: row.seatUsageId } }, { strict: true });
      return { status: "rejected" as const };
    }),
  );
}

/**
 * PATCH cancel: a `pending` row whose call never answered, once Razorpay confirms it has no refund for it.
 * Goes back to `eligible` and releases the seat. If Razorpay does have it, the row adopts it instead (409).
 */
export async function cancelRefund(id: string, adminId: string): Promise<RefundResult<{ status: RefundStatus }>> {
  const d = await deps();
  const s = d.schema.paymentRefunds;
  const row = await loadRow(d, id);
  if (!row) return { ok: false, status: 404, error: "Refund not found." };
  const problem = actionProblem("cancel", row, new Date());
  if (problem) return { ok: false, status: 409, error: problem };
  const payment = await paymentOf(d, d.getDb(), row);
  if (payment && isGatewayPayment(payment)) {
    let found: RazorpayRefund | undefined;
    try {
      found = matchRefund(await d.razorpay.listRefunds(payment.paymentId!), row.id);
    } catch (e) {
      return { ok: false, status: 502, error: `Couldn't check Razorpay first: ${e instanceof Error ? e.message : "unknown error"}` };
    }
    if (found) {
      await applyGateway(d, row, found, adminId);
      return { ok: false, status: 409, error: "Razorpay has this refund, so it can't be cancelled. Its status is now updated." };
    }
  }
  return run(() =>
    d.getDb().transaction(async (tx) => {
      const locked = await lockRow(d, tx, id);
      const again = actionProblem("cancel", locked, new Date());
      if (again) throw new Refused(409, again);
      if (locked.seatUsageId) await d.promo.releasePromoUse(locked.seatUsageId, tx);
      await tx.update(s).set({ status: "eligible", seatUsageId: null, initiatedBy: null, initiatedAt: null, lastError: null, updatedAt: new Date() }).where(d.orm.eq(s.id, locked.id));
      await d.audit.recordAdminAudit(tx, { adminId, action: "refund.cancel", targetType: "payment_refund", targetId: locked.id, meta: { releasedSeat: locked.seatUsageId } }, { strict: true });
      return { status: "eligible" as const };
    }),
  );
}

/** The reconcile job: every `pending` / `initiated` Razorpay refund untouched for 15 minutes, refreshed. */
export async function reconcileRefunds(now: Date = new Date()): Promise<{ checked: number; settled: number; failed: number }> {
  const d = await deps();
  const s = d.schema.paymentRefunds;
  const rows = await d
    .getDb()
    .select({ id: s.id })
    .from(s)
    .where(d.orm.and(d.orm.inArray(s.status, ["pending", "initiated"]), d.orm.eq(s.gateway, "razorpay"), d.orm.lt(s.updatedAt, new Date(now.getTime() - RECONCILE_AFTER_MS))))
    .orderBy(s.updatedAt)
    .limit(200);
  let settled = 0;
  let failed = 0;
  for (const { id } of rows) {
    const r = await refreshRefund(id, SYSTEM_ACTOR).catch((e) => {
      console.error("[refund reconcile]", id, e);
      return null;
    });
    if (r?.ok && r.value.status === "refunded") settled++;
    if (r?.ok && r.value.status === "failed") failed++;
  }
  return { checked: rows.length, settled, failed };
}
