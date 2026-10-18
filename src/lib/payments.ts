import { and, eq, inArray, ne } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";
import { recordPromoUse } from "@/lib/promo";

/**
 * Settling a paid Razorpay order. Called by the checkout verify routes and by
 * the webhook, so each step is idempotent: whichever arrives second is a no-op.
 */

type Raw = Record<string, unknown> | null | undefined;

/** Proposal IDs an employer order covers; same lookup as the legacy app. */
export function orderProposalIds(raw: Raw): string[] {
  const r = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const notes = r.notes ?? r.order?.notes ?? {};
  let ids = notes.proposalIds ?? notes.proposal_ids ?? r.proposalIds ?? r.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  return Array.isArray(ids) ? ids.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
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
  // row to paid goes on to hire and notify.
  const claimed = await db
    .update(schema.employerPayments)
    .set({ paymentId: input.paymentId, signature: input.signature ?? order.signature, status: "paid", paidAt: new Date() })
    .where(and(eq(schema.employerPayments.id, order.id), ne(schema.employerPayments.status, "paid")))
    .returning({ id: schema.employerPayments.id });
  if (claimed.length === 0) return { ok: true, hired: 0 };

  const promo = promoOf(order.raw);
  if (promo) {
    await recordPromoUse({ code: promo.code, subjectId: order.employerId, orderId: input.orderId, discountMinor: promo.discountMinor });
  }

  // Only the proposals this order paid for become hires.
  const ids = orderProposalIds(order.raw);
  if (ids.length === 0) return { ok: true, hired: 0 };
  const hired = await db
    .update(schema.proposals)
    .set({ status: "hired", hiredAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.proposals.employerId, order.employerId),
        inArray(schema.proposals.id, ids),
        inArray(schema.proposals.status, ["accepted", "processing"]),
      ),
    )
    .returning({ id: schema.proposals.id, internId: schema.proposals.internId });
  if (hired.length < ids.length) {
    // Paid for proposals that were withdrawn or already paid in between:
    // flag the order so accounts can refund the difference.
    await db
      .update(schema.employerPayments)
      .set({ raw: { ...((order.raw ?? {}) as Record<string, unknown>), needsReview: { reason: "not_all_hired", expected: ids.length, hired: hired.length } } })
      .where(eq(schema.employerPayments.id, order.id));
    console.error(`[payments] order ${input.orderId}: paid for ${ids.length}, hired ${hired.length} - needs review`);
  }
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
      hired.length === ids.length
        ? `Payment received. ${hired.length} hire${hired.length === 1 ? "" : "s"} confirmed.`
        : `Payment received. ${hired.length} of ${ids.length} hires confirmed; our team will contact you about the rest.`,
    data: { orderId: input.orderId },
    dedupeKey: `payment_completed_${input.orderId}`,
    email: emails.employerPaymentReceived({
      employerName: contact,
      role: hired.length === 1 ? roleOf(hired[0].id) : `${hired.length} hires`,
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
  return { ok: true, hired: hired.length };
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
  const claimed = await db
    .update(schema.internPayments)
    .set({ paymentId: input.paymentId, signature: input.signature ?? payment.signature, status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.internPayments.id, payment.id), ne(schema.internPayments.status, "paid")))
    .returning({ id: schema.internPayments.id });
  if (claimed.length > 0) {
    const promo = promoOf(payment.raw);
    if (promo) {
      await recordPromoUse({ code: promo.code, subjectId: payment.internId, orderId: input.orderId, discountMinor: promo.discountMinor });
    }
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
  return { ok: true };
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
  await db
    .update(schema.internOnboarding)
    .set({ extraData: { ...extra, payment: { ...current, isPaid: true, paidAt: new Date().toISOString(), ...ref } } })
    .where(eq(schema.internOnboarding.id, row.id));
}

/** Paid if either app says so. */
export async function isInternPaid(internId: string): Promise<boolean> {
  const db = getDb();
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
  return ((row?.extraData as Record<string, any> | null)?.payment?.isPaid ?? false) === true; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Tell the intern a payout landed (in-app + email). Safe to call twice. */
export async function notifyStipendPaid(payoutId: string) {
  const db = getDb();
  const [p] = await db.select().from(schema.internPayouts).where(eq(schema.internPayouts.id, payoutId)).limit(1);
  if (!p || p.status !== "paid") return;
  const proposalId = typeof p.raw?.proposalId === "string" ? p.raw.proposalId : null;
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
  await notify({
    to: { type: "intern", id: p.internId },
    type: "stipend_paid",
    title: "Stipend transferred",
    message: `${amount} has been sent to your bank account.`,
    data: { payoutId },
    dedupeKey: `stipend_paid_${payoutId}`,
    email: emails.stipendTransferred({ internName: await internFirstName(p.internId), role, amount }),
  });
}
