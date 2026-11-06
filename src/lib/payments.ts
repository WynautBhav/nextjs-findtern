import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";
import { applyPendingRatings } from "@/lib/admin/score-live";
import { recordPromoUse } from "@/lib/promo";
import { SEATS_USED_UP } from "@/lib/promo-rules";
import { PROMO_CONSENT_VERSION } from "@/lib/college/promo-consent";
import { consentProblem, membershipFromPromo, promoConsentHash } from "@/lib/college/promo-membership";
import { assignInvoiceNumber } from "@/lib/invoice-number";
import { monthMismatches } from "@/lib/billing-plan";
import { orderProposalIds } from "@/lib/order-ids";

/**
 * Settling a paid Razorpay order. Called by the checkout verify routes and by
 * the webhook, so each step is idempotent: whichever arrives second is a no-op.
 */

export { orderProposalIds };

type Raw = Record<string, unknown> | null | undefined;

/** Of those, the monthly instalments of placements that are already hired. */
export function orderDueIds(raw: Raw): string[] {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const due = (r.notes ?? r.order?.notes ?? {}).dueProposalIds;
  return Array.isArray(due) ? due.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
}

/** How long an unpaid checkout order stays open. */
export const OPEN_ORDER_MINUTES = 30;

/**
 * Is a payment for this proposal open right now? The checkout keeps an
 * unpaid order for 30 minutes; changing the offer under it would bill (or
 * hire on) terms the employer is no longer offering.
 */
export async function hasOpenOrderFor(employerId: string, proposalId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ raw: schema.employerPayments.raw })
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.employerId, employerId),
        eq(schema.employerPayments.status, "created"),
        gte(schema.employerPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
      ),
    );
  return rows.some((r) => orderProposalIds(r.raw).includes(proposalId));
}

/**
 * DB-05: legacy never stores an unpaid order, and its admin counts every
 * "created" row as billed. An order still unpaid after 30 minutes is closed
 * as "failed", a status legacy knows ("cancelled" is not one). Settlement
 * still accepts a late capture: it flips any unpaid row to paid.
 */
export async function expireStaleEmployerOrders(employerId?: string): Promise<number> {
  const rows = await getDb()
    .update(schema.employerPayments)
    .set({ status: "failed" })
    .where(
      and(
        employerId ? eq(schema.employerPayments.employerId, employerId) : undefined,
        eq(schema.employerPayments.status, "created"),
        lt(schema.employerPayments.createdAt, new Date(Date.now() - OPEN_ORDER_MINUTES * 60_000)),
      ),
    )
    .returning({ id: schema.employerPayments.id });
  return rows.length;
}

/**
 * DB-04: the legacy admin Companies list reads the order from `raw.order`
 * alone; without it a new-app order counts against every hire of the company.
 * Same keys the legacy order route stores (Razorpay's order object).
 */
export function legacyOrderRaw(order: { id: string; amountMinor: number; currency: string; notes: Record<string, unknown> }) {
  return { id: order.id, amount: order.amountMinor, currency: order.currency, notes: order.notes };
}

function promoOf(raw: Raw) {
  const r = (raw ?? {}) as { promoCode?: string; discountMinor?: number; promo?: { promoCode?: string; discountMinor?: number } };
  const code = r.promo?.promoCode ?? r.promoCode;
  return code ? { code, discountMinor: r.promo?.discountMinor ?? r.discountMinor ?? 0 } : null;
}

export async function settleEmployerOrder(input: {
  orderId: string;
  paymentId: string;
  signature?: string;
  employerId?: string;
}): Promise<{ ok: true; hired: number } | { ok: false; status: number; error: string }> {
  const db = getDb();
  const [order] = await db
    .select()
    .from(schema.employerPayments)
    .where(
      and(
        eq(schema.employerPayments.orderId, input.orderId),
        input.employerId ? eq(schema.employerPayments.employerId, input.employerId) : undefined,
      ),
    )
    .limit(1);
  if (!order) return { ok: false, status: 404, error: "Unknown order" };
  // Verify and the webhook can arrive together: only the one that flips the
  // row to paid goes on to hire and notify. Every write commits with the
  // claim or not at all, so a failure leaves the order open for the retry.
  const ids = orderProposalIds(order.raw);
  const dueIds = new Set(orderDueIds(order.raw));
  const hireIds = ids.filter((pid) => !dueIds.has(pid));
  const hired = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(schema.employerPayments)
      .set({ paymentId: input.paymentId, signature: input.signature ?? order.signature, status: "paid", paidAt: new Date() })
      .where(and(eq(schema.employerPayments.id, order.id), ne(schema.employerPayments.status, "paid")))
      .returning({ id: schema.employerPayments.id });
    if (claimed.length === 0) return null;
    // A free (test-mode) order is not a sale, so it takes no invoice number.
    if (order.amountMinor > 0) await assignInvoiceNumber("employer", order.id, new Date(), tx);

    const promo = promoOf(order.raw);
    if (promo) {
      await recordPromoUse({ code: promo.code, subjectId: order.employerId, orderId: input.orderId, discountMinor: promo.discountMinor }, tx);
    }

    // Only the proposals this order paid for become hires. A month's instalment
    // for a running placement (dueProposalIds) is already hired: it is paid,
    // not hired again, and must not count as a missing hire.
    const hired = hireIds.length === 0 ? [] : await tx
      .update(schema.proposals)
      .set({ status: "hired", hiredAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.proposals.employerId, order.employerId),
          inArray(schema.proposals.id, hireIds),
          inArray(schema.proposals.status, ["accepted", "processing"]),
        ),
      )
      .returning({ id: schema.proposals.id, internId: schema.proposals.internId });
    // A month paid out of turn (the hire's paid months are not the due month - 1, e.g. two
    // checkouts for the same month) is still recorded as paid; accounts review it.
    const others = dueIds.size === 0
      ? []
      : await tx
          .select({ status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt })
          .from(schema.employerPayments)
          .where(and(eq(schema.employerPayments.employerId, order.employerId), eq(schema.employerPayments.status, "paid"), ne(schema.employerPayments.id, order.id)));
    const wrongMonth = monthMismatches(order.raw, others);
    if (hired.length < hireIds.length || wrongMonth.length > 0) {
      // Paid for proposals that were withdrawn or already paid in between:
      // flag the order so accounts can refund the difference.
      const needsReview =
        hired.length < hireIds.length
          ? { reason: "not_all_hired", expected: hireIds.length, hired: hired.length, ...(wrongMonth.length ? { monthMismatch: wrongMonth } : {}) }
          : { reason: "month_mismatch", lines: wrongMonth };
      await tx
        .update(schema.employerPayments)
        .set({ raw: { ...((order.raw ?? {}) as Record<string, unknown>), needsReview } })
        .where(eq(schema.employerPayments.id, order.id));
      console.error(`[payments] order ${input.orderId}: needs review (${needsReview.reason})`);
    }
    // EMB-26: once hired, the candidate leaves every shortlist of this company
    // (legacy removed them from all its carts), so the cart count stays true.
    if (hired.length > 0) {
      await tx
        .delete(schema.employerCartItems)
        .where(
          and(
            eq(schema.employerCartItems.employerId, order.employerId),
            inArray(schema.employerCartItems.internId, hired.map((p) => p.internId)),
          ),
        );
    }
    // Legacy routes.ts:15658: a hired intern's onboarding status moves to
    // "Onboarding" until they are set up with the company.
    for (const p of hired) {
      const [ob] = await tx
        .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, p.internId))
        .limit(1);
      if (!ob) continue;
      await tx
        .update(schema.internOnboarding)
        .set({ extraData: { ...((ob.extraData ?? {}) as Record<string, unknown>), onboardingStatus: "Onboarding", isOnboarded: false } })
        .where(eq(schema.internOnboarding.id, ob.id));
    }
    return hired;
  });
  if (!hired || ids.length === 0) return { ok: true, hired: 0 };

  const { contact, company } = await employerNames(order.employerId);
  const roles = await db
    .select({ id: schema.proposals.id, offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
    .from(schema.proposals)
    .where(inArray(schema.proposals.id, ids));
  const roleOf = (pid: string) => {
    const r = roles.find((x) => x.id === pid);
    return (r && parseOffer(r.offer, r.currency).roleTitle) || "your internship";
  };
  await notify({
    to: { type: "employer", id: order.employerId },
    type: "payment_completed",
    title: "Payment received",
    message:
      hireIds.length === 0
        ? "Monthly payment received."
        : hired.length === hireIds.length
          ? `Payment received. ${hired.length} hire${hired.length === 1 ? "" : "s"} confirmed.`
          : `Payment received. ${hired.length} of ${hireIds.length} hires confirmed; our team will contact you about the rest.`,
    data: { orderId: input.orderId },
    dedupeKey: `payment_completed_${input.orderId}`,
    email: emails.employerPaymentReceived({
      employerName: contact,
      role:
        hireIds.length === 0
          ? ids.length === 1 ? `this month of ${roleOf(ids[0])}` : `this month of ${ids.length} placements`
          : hired.length === 1 ? roleOf(hired[0].id) : `${hired.length} hires`,
      amount: formatMoney(order.amountMinor, order.currency, { zeroLabel: false }),
    }),
  });
  for (const p of hired) {
    await notify({
      to: { type: "intern", id: p.internId },
      type: "proposal_hired",
      title: "You are hired",
      message: "Payment is complete and your offer is now a hire. Timesheets open for your first period.",
      data: { proposalId: p.id },
      dedupeKey: `hired_${p.id}`,
      email: emails.hireConfirmed({ internName: await internFirstName(p.internId), companyName: company, role: roleOf(p.id) }),
    });
  }

  // Full-time hires also get the hiring-fee receipt (legacy routes.ts:15806).
  for (const p of hired) {
    const r = roles.find((x) => x.id === p.id);
    const offer = r ? parseOffer(r.offer, r.currency) : null;
    if (!offer?.fullTime) continue;
    const [intern] = await db
      .select({ first: schema.users.firstName, last: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, p.internId))
      .limit(1);
    const candidate = `${intern?.first ?? ""} ${intern?.last ?? ""}`.trim() || "Candidate";
    await notify({
      to: { type: "employer", id: order.employerId },
      type: "full_time_fee_paid",
      title: "Hiring fee received",
      message: `Full-time hiring fee received for ${candidate}.`,
      data: { proposalId: p.id, orderId: input.orderId },
      dedupeKey: `full_time_fee_paid:${p.id}`,
      email: emails.fullTimeFeePaid({
        employerName: contact,
        candidate,
        role: roleOf(p.id),
        ctc: offer.fullTime.annualCtcMinor ? formatMoney(offer.fullTime.annualCtcMinor, offer.currency, { zeroLabel: false }) : "As per offer",
        // One order can pay for several hires; the total is only this hire's when it is the only one.
        amount: hired.length === 1 ? formatMoney(order.amountMinor, order.currency, { zeroLabel: false }) : "Included in this order",
      }),
    });
  }
  return { ok: true, hired: hired.length };
}

class SettleRefused extends Error {
  constructor(message: string = SEATS_USED_UP) {
    super(message);
  }
}

/** The code is the proof: verify the student with that college and record the 18+ consent, in the settlement's transaction. */
async function verifyByCollegeCode(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], userId: string, collegeId: string) {
  const [existing] = await tx.select().from(schema.collegeMemberships).where(eq(schema.collegeMemberships.userId, userId)).limit(1);
  const [college] = await tx.select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, collegeId)).limit(1);
  const [consent] = await tx
    .insert(schema.collegeConsents)
    .values({ userId, collegeId, noticeVersion: PROMO_CONSENT_VERSION, noticeHash: promoConsentHash(college?.name ?? "your college"), purposes: ["college_code_verification"], declaredAdult: true })
    .returning({ id: schema.collegeConsents.id });
  const values = { ...membershipFromPromo(existing ?? null, collegeId), consentId: consent.id };
  await tx
    .insert(schema.collegeMemberships)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.collegeMemberships.userId, set: { ...values, joinedAt: sql`now()` } });
  await tx.delete(schema.collegePresence).where(eq(schema.collegePresence.userId, userId));
}

/**
 * Marks the intern activation fee paid, in both places the apps look:
 * the intern_payments row and the legacy `extraData.payment.isPaid` flag.
 */
export async function settleInternOrder(input: {
  orderId: string;
  paymentId: string;
  signature?: string;
  internId?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(schema.internPayments)
    .where(
      and(
        eq(schema.internPayments.orderId, input.orderId),
        input.internId ? eq(schema.internPayments.internId, input.internId) : undefined,
      ),
    )
    .limit(1);
  if (!payment) return { ok: false, status: 404, error: "Unknown order" };
  // The claim, its invoice number and the promo use commit together, so a
  // failure leaves the order open for the retry; notify only after commit.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.internPayments)
      .set({ paymentId: input.paymentId, signature: input.signature ?? payment.signature, status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.internPayments.id, payment.id), ne(schema.internPayments.status, "paid")))
      .returning({ id: schema.internPayments.id });
    if (rows.length === 0) return false;
    if (payment.amountMinor > 0) await assignInvoiceNumber("intern", payment.id, new Date(), tx);
    const promo = promoOf(payment.raw);
    if (promo) {
      const use = await recordPromoUse({ code: promo.code, subjectId: payment.internId, orderId: input.orderId, discountMinor: promo.discountMinor, enforceCap: payment.amountMinor === 0 }, tx);
      // Throwing rolls back the claim above too, so the seat and the order stay unspent.
      if (use.capped) throw new SettleRefused(use.refused);
      if (use.collegeId) {
        if (consentProblem((payment.raw as { declaredAdult?: unknown } | null)?.declaredAdult)) throw new SettleRefused(consentProblem(false)!);
        await verifyByCollegeCode(tx, payment.internId, use.collegeId);
      }
    }
    return true;
  }).catch((e) => (e instanceof SettleRefused ? e : Promise.reject(e)));
  if (claimed instanceof SettleRefused) return { ok: false, status: 409, error: claimed.message };
  if (claimed === true) {
    await notify({
      to: { type: "intern", id: payment.internId },
      type: "payment_completed",
      title: "Profile activated",
      message: "Your payment is received. Your AI interview is unlocked.",
      dedupeKey: `activation_${input.orderId}`,
      email: emails.activationPaid({
        internName: await internFirstName(payment.internId),
        amount: formatMoney(payment.amountMinor, payment.currency, { zeroLabel: false }),
      }),
    });
  }
  await markInternPaidFlag(payment.internId, { orderId: input.orderId, paymentId: input.paymentId });
  await applyPendingRatings(payment.internId).catch((e) => console.error("[settleInternOrder] pending ratings", e));
  return { ok: true };
}

/**
 * Legacy `extraData.payment` (routes.ts:14882): besides the flag, the order,
 * the promo and the three amounts, read from the intern_payments row.
 */
async function paymentRecord(orderId: string | undefined): Promise<Record<string, unknown>> {
  if (!orderId) return {};
  const db = getDb();
  const [row] = await db
    .select({ amountMinor: schema.internPayments.amountMinor, gateway: schema.internPayments.gateway, raw: schema.internPayments.raw })
    .from(schema.internPayments)
    .where(eq(schema.internPayments.orderId, orderId))
    .limit(1);
  if (!row) return {};
  const promo = promoOf(row.raw);
  const free = orderId.startsWith("free_");
  const discount = promo?.discountMinor ?? 0;
  return {
    gateway: free ? "free" : row.gateway,
    promoCode: promo?.code ?? null,
    originalAmountMinor: row.amountMinor + discount,
    discountAmountMinor: discount,
    finalAmountMinor: row.amountMinor,
  };
}

export async function markInternPaidFlag(internId: string, ref: { orderId?: string; paymentId?: string } = {}) {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, internId))
    .limit(1);
  if (!row) return;
  const extra = (row.extraData ?? {}) as Record<string, unknown>;
  const current = (extra.payment ?? {}) as Record<string, unknown>;
  if (current.isPaid === true) return;
  const record = await paymentRecord(ref.orderId);
  await db
    .update(schema.internOnboarding)
    .set({ extraData: { ...extra, payment: { ...current, isPaid: true, paidAt: new Date().toISOString(), ...record, ...ref } } })
    .where(eq(schema.internOnboarding.id, row.id));
}

/** Paid if either app says so. Pass a transaction to read inside it. */
export async function isInternPaid(internId: string, db: ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0] = getDb()): Promise<boolean> {
  const [paid] = await db
    .select({ id: schema.internPayments.id })
    .from(schema.internPayments)
    .where(and(eq(schema.internPayments.internId, internId), eq(schema.internPayments.status, "paid")))
    .limit(1);
  if (paid) return true;
  const [row] = await db
    .select({ extraData: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, internId))
    .limit(1);
  // Same rule as feePaidSql: boolean true or the string "true" (SQL `->>` reads both as 'true').
  const flag = (row?.extraData as Record<string, any> | null)?.payment?.isPaid; // eslint-disable-line @typescript-eslint/no-explicit-any
  return flag === true || flag === "true";
}

/** What the intern actually paid for activation (the row the invoice and email use), or null when no paid row exists. */
export async function internPaidMinor(internId: string): Promise<number | null> {
  const [paid] = await getDb()
    .select({ amountMinor: schema.internPayments.amountMinor })
    .from(schema.internPayments)
    .where(and(eq(schema.internPayments.internId, internId), eq(schema.internPayments.status, "paid")))
    .limit(1);
  return paid?.amountMinor ?? null;
}

/** Tell the intern a payout landed (in-app + email). Safe to call twice. */
export async function notifyStipendPaid(payoutId: string) {
  const db = getDb();
  const [p] = await db.select().from(schema.internPayouts).where(eq(schema.internPayouts.id, payoutId)).limit(1);
  if (!p || p.status !== "paid") return;
  // A completion bonus has no placement link in raw (stipend code must not match it); its hire is bonusProposalId.
  const proposalId = typeof p.raw?.proposalId === "string" ? p.raw.proposalId : p.bonusProposalId;
  let role = "your internship";
  if (proposalId) {
    const [pr] = await db
      .select({ offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId))
      .limit(1);
    role = (pr && parseOffer(pr.offer, pr.currency).roleTitle) || role;
  }
  const amount = formatMoney(p.amountMinor, p.currency, { zeroLabel: false });
  if (p.kind === "completion_bonus") {
    await notify({
      to: { type: "intern", id: p.internId },
      type: "completion_bonus_paid",
      title: "Completion bonus transferred",
      message: `${amount} completion bonus has been sent to your bank account.`,
      data: { payoutId },
      dedupeKey: `completion_bonus_paid:${payoutId}`,
      email: emails.completionBonusPaid({ internName: await internFirstName(p.internId), role, amount }),
    });
    return;
  }
  await notify({
    to: { type: "intern", id: p.internId },
    type: "stipend_paid",
    title: "Stipend transferred",
    message: `${amount} has been sent to your bank account.`,
    data: { payoutId },
    // Legacy key format; both apps share the notifications table.
    dedupeKey: `stipend_paid:${payoutId}`,
    email: emails.stipendTransferred({ internName: await internFirstName(p.internId), role, amount }),
  });
}
