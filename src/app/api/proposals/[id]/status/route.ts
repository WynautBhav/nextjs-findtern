import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { emails } from "@/lib/emails";
import { initialsOf } from "@/lib/employer-candidates";
import { employerNames, internFirstName, notify, resolveOfferNotifications } from "@/lib/notify";
import { FREE_DECLINES, offerPastStart, parseOffer } from "@/lib/offer";
import { hasOpenOrderFor, OPEN_ORDER_MINUTES } from "@/lib/payments";

/**
 * Which role may set which status.
 *
 * A proposal has two parties and the legal transitions differ by which one is
 * asking: only the employer may withdraw, only the intern may accept or
 * reject. Encoding that as a map keeps the rule in one readable place instead
 * of scattered through conditionals.
 */
const ALLOWED: Record<string, string[]> = {
  // Only the intern accepts. An employer accepting their own offer would let
  // them pay and hire without the candidate ever agreeing.
  // Withdraw only: "rejected" is the candidate's answer, never the
  // company's (legacy had no employer reject; EMH-40).
  employer: ["withdrawn"],
  intern: ["accepted", "rejected"],
  // Staff can close a stale offer ("expired"), reject on the candidate's
  // behalf, or cancel an accepted offer the employer has not paid for
  // ("withdrawn" from accepted). Staff never accept for a candidate: that
  // would skip the candidate agreeing to the terms.
  admin: ["withdrawn", "rejected", "expired"],
};

/** Statuses the intern can still answer. */
const ANSWERABLE = ["sent", "interview_scheduled"];

/** Statuses from which no further transition is meaningful. "expired" is
 *  set when the intern accepted another offer; withdrawing it afterwards
 *  would email them about an offer that was already closed (EMH-40). */
const TERMINAL = ["accepted", "rejected", "withdrawn", "hired", "expired"];

const bodySchema = z.object({
  status: z.enum(["withdrawn", "accepted", "rejected", "expired"]),
  /** Intern accepting: agreed to the intern terms and NDA. */
  agreedToTerms: z.boolean().optional(),
  /** Intern accepting a full-time offer: the binding joining agreement. */
  agreedToFullTimeTerms: z.boolean().optional(),
  /** Intern declining past the free allowance: has seen the guarantee end. */
  acknowledgeGuaranteeEnd: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["intern", "employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { status } = parsed.data;
  const allowed = ALLOWED[session.role] ?? [];


  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `A ${session.role} cannot set a proposal to "${status}"` },
      { status: 403 },
    );
  }

  if (!limiters.generic.take(bucketKey(clientIp(req.headers), session.uid))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await ctx.params;
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(schema.proposals)
    .where(eq(schema.proposals.id, id))
    .limit(1);

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership against the party that actually belongs to this proposal.
  // Sequential ids made the legacy `/api/proposals/:id` route an IDOR;
  // this check is the fix and it must not be skipped.
  const ownsIt =
    session.role === "admin" ||
    (session.role === "employer" && proposal.employerId === session.uid) ||
    (session.role === "intern" && proposal.internId === session.uid);
  if (!ownsIt) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // State-machine guard. The legacy routes had none, which meant a withdrawn
  // offer could be accepted afterwards and both parties could be told it was
  // live.
  // Withdrawing an accepted offer before it is paid for: staff, and since the
  // bug sheet of 23 Oct the employer too. A full-time acceptance is the hire
  // itself, and a paid one is hired, so neither can be withdrawn.
  const offerForCancel = parseOffer(proposal.offerDetails, proposal.currency);
  const cancelBeforePayment =
    (session.role === "admin" || session.role === "employer") &&
    status === "withdrawn" &&
    proposal.status === "accepted" &&
    !proposal.hiredAt &&
    !offerForCancel.fullTime;
  if (cancelBeforePayment && (await hasOpenOrderFor(proposal.employerId, proposal.id))) {
    return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
  }
  // EMH-35: "processing" is legacy's accepted-and-paying state. While that
  // checkout is open (30 minutes) nothing may change the offer under it;
  // after that it is an abandoned checkout and closes like an accepted offer.
  if (proposal.status === "processing" && session.role !== "intern") {
    const recent = proposal.updatedAt && Date.now() - new Date(proposal.updatedAt).getTime() < OPEN_ORDER_MINUTES * 60_000;
    if (recent || status !== "withdrawn" || proposal.hiredAt || offerForCancel.fullTime) {
      return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
    }
  }
  if (TERMINAL.includes(proposal.status) && !cancelBeforePayment) {
    return NextResponse.json(
      { error: proposal.hiredAt ? "This candidate is already hired, so the offer can't be changed." : `Proposal is already ${proposal.status}` },
      { status: 409 },
    );
  }
  if (session.role === "intern" && !ANSWERABLE.includes(proposal.status)) {
    return NextResponse.json({ error: "This offer can't be answered any more" }, { status: 409 });
  }
  const offer = parseOffer(proposal.offerDetails, proposal.currency);
  // Legacy rule: an offer can only be answered while its start date is ahead.
  if (session.role === "intern" && offerPastStart(offer.startDate)) {
    return NextResponse.json(
      { error: "This offer expired on its start date and can no longer be answered." },
      { status: 409 },
    );
  }
  const recordTerms = session.role === "intern" && status === "accepted";
  if (recordTerms && !parsed.data.agreedToTerms) {
    return NextResponse.json({ error: "Agree to the intern terms and NDA to accept." }, { status: 400 });
  }
  if (recordTerms && offer.fullTime && !parsed.data.agreedToFullTimeTerms) {
    return NextResponse.json({ error: "Agree to the full-time acceptance terms to accept." }, { status: 400 });
  }

  // Declines: the first FREE_DECLINES are free; the next one is allowed but
  // ends the placement guarantee, and only after the candidate saw that.
  const internDecline = session.role === "intern" && status === "rejected";
  let endsGuarantee = false;
  if (internDecline) {
    const [onboarding] = await db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    const ended = typeof ((onboarding?.extraData ?? {}) as Record<string, unknown>).guaranteeEndedAt === "string";
    const previous = await db
      .select({ id: schema.proposals.id })
      .from(schema.proposals)
      .where(
        and(
          eq(schema.proposals.internId, proposal.internId),
          eq(schema.proposals.status, "rejected"),
          sql`${schema.proposals.offerDetails}->>'declinedBy' = 'intern'`,
        ),
      );
    if (!ended && previous.length >= FREE_DECLINES) {
      if (!parsed.data.acknowledgeGuaranteeEnd) {
        return NextResponse.json(
          {
            error: `You have already turned down ${previous.length} offers. Turn down more than ${FREE_DECLINES} and you are no longer eligible for a refund under the guarantee.`,
            code: "guarantee_warning",
            declines: previous.length,
          },
          { status: 409 },
        );
      }
      endsGuarantee = true;
    }
  }

  const stampedDetails = (): Record<string, unknown> | null => {
    const base = (proposal.offerDetails ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    if (recordTerms) {
      return { ...base, termsAcceptedAt: now, ...(offer.fullTime ? { fullTimeTermsAcceptedAt: now } : {}) };
    }
    if (internDecline) return { ...base, declinedBy: "intern", declinedAt: now };
    if (session.role === "admin") return { ...base, closedByAdminAt: now, closedByAdminStatus: status };
    return null;
  };
  const details = stampedDetails();


  // One transaction: status flip, expiring the intern's other offers and the
  // cart cleanup land together. Locking the intern's proposal rows first makes
  // two simultaneous acceptances queue instead of both winning.
  let expired: { id: string; employerId: string }[] = [];
  const updated = await db.transaction(async (tx) => {
    await tx.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.internId, proposal.internId)).for("update");
    // One internship at a time: an offer accepted elsewhere and not yet
    // closed (awaiting payment) blocks a second acceptance.
    if (status === "accepted") {
      const [other] = await tx
        .select({ id: schema.proposals.id })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.internId, proposal.internId),
            ne(schema.proposals.id, id),
            inArray(schema.proposals.status, ["accepted", "processing"]),
          ),
        )
        .limit(1);
      if (other) return "busy" as const;
    }
    const [row] = await tx
      .update(schema.proposals)
      .set({
        status,
        updatedAt: new Date(),
        ...(details ? { offerDetails: details } : {}),
      })
      // Only if nobody changed it since we read it (accept vs withdraw race).
      .where(and(eq(schema.proposals.id, id), eq(schema.proposals.status, proposal.status)))
      .returning();
    if (!row) return null;

    // Accepting closes the intern's other open offers from every company (one
    // internship at a time) and takes them off this employer's shortlist.
    if (status === "rejected" || status === "expired") {
      // A declined or expired candidate leaves the employer's shortlist
      // (legacy routes.ts:14481).
      await tx
        .delete(schema.employerCartItems)
        .where(
          and(
            eq(schema.employerCartItems.employerId, proposal.employerId),
            eq(schema.employerCartItems.internId, proposal.internId),
            eq(schema.employerCartItems.projectId, proposal.projectId),
          ),
        );
    }
    if (status === "accepted") {
      expired = await tx
          .update(schema.proposals)
          .set({ status: "expired", updatedAt: new Date() })
          .where(
            and(
              eq(schema.proposals.internId, proposal.internId),
              ne(schema.proposals.id, id),
              inArray(schema.proposals.status, ["draft", "sent", "interview_scheduled"]),
            ),
          )
          .returning({ id: schema.proposals.id, employerId: schema.proposals.employerId });
      await tx
        .delete(schema.employerCartItems)
        .where(
          and(
            eq(schema.employerCartItems.employerId, proposal.employerId),
            eq(schema.employerCartItems.internId, proposal.internId),
          ),
        );
    }
    return row;
  });
  if (updated === "busy") {
    return NextResponse.json({ error: "You have already accepted another offer. Only one internship at a time." }, { status: 409 });
  }
  if (!updated) {
    return NextResponse.json({ error: "This offer changed a moment ago. Refresh and try again." }, { status: 409 });
  }

  // Any status change here closes the offer as something to act on.
  await resolveOfferNotifications(proposal.internId, [id, ...expired.map((e) => e.id)]).catch(() => {});
  // Other companies learn their offer closed because the candidate took another.
  for (const e of expired.filter((e) => e.employerId !== proposal.employerId)) {
    await notify({
      to: { type: "employer", id: e.employerId },
      type: "proposal_expired",
      title: "Offer closed",
      message: "The candidate accepted another internship, so your offer has closed.",
      data: { proposalId: e.id },
      dedupeKey: `proposal_expired_${e.id}`,
    }).catch((err) => console.error("[proposal status] expiry notice failed", err));
  }

  if (endsGuarantee) {
    const [onboarding] = await db
      .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    if (onboarding) {
      await db
        .update(schema.internOnboarding)
        .set({
          extraData: {
            ...((onboarding.extraData ?? {}) as Record<string, unknown>),
            guaranteeEndedAt: new Date().toISOString(),
            guaranteeEndedReason: "declined_offer_limit",
            guaranteeEndedProposalId: id,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.internOnboarding.id, onboarding.id));
    }
  }

  // Tell the other party. Names stay initials until a hire (legacy rule).
  const role = offer.roleTitle || "the role";
  if (session.role === "intern" && (status === "accepted" || status === "rejected")) {
    const [intern] = await db
      .select({ f: schema.users.firstName, l: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, proposal.internId))
      .limit(1);
    const candidate = `Candidate ${initialsOf(intern?.f ?? "", intern?.l ?? "")}`;
    const { contact } = await employerNames(proposal.employerId);
    const fullTime = Boolean(offer.fullTime);
    await notify({
      to: { type: "employer", id: proposal.employerId },
      type: fullTime ? `full_time_offer_${status}` : `proposal_${status}`,
      title: fullTime
        ? status === "accepted"
          ? "Full-time offer accepted"
          : "Full-time offer declined"
        : status === "accepted"
          ? "Offer accepted"
          : "Offer declined",
      message: `${candidate} ${status === "accepted" ? "accepted" : "declined"} your ${fullTime ? "full-time offer" : "offer"} for ${role}.`,
      data: { proposalId: id },
      email: emails.proposalDecision({ employerName: contact, candidate, role, accepted: status === "accepted", proposalId: id, fullTime }),
    });
    // Accepting a full-time offer is the hire itself (legacy routes.ts:14570).
    if (status === "accepted" && fullTime) {
      const { company } = await employerNames(proposal.employerId);
      await notify({
        to: { type: "intern", id: proposal.internId },
        type: "full_time_hired",
        title: "Full-time hired",
        message: `You are hired full-time at ${company}.`,
        data: { proposalId: id, employerId: proposal.employerId, employerName: company },
        dedupeKey: `full_time_hired:${id}:${proposal.internId}`,
      });
    }
  } else if (session.role === "admin") {
    // Staff actions read as neutral closures, never as the company's doing.
    const internName = await internFirstName(proposal.internId);
    await notify({
      to: { type: "intern", id: proposal.internId },
      type: `proposal_${status}`,
      title: status === "expired" ? "Offer expired" : "Offer closed",
      message:
        status === "expired"
          ? `The offer for ${role} has expired.`
          : `The offer for ${role} has been closed by Findtern.`,
      data: { proposalId: id },
      email: status === "expired" ? undefined : emails.proposalClosed({ internName, role }),
    });
    if (cancelBeforePayment) {
      await notify({
        to: { type: "employer", id: proposal.employerId },
        type: "proposal_cancelled",
        title: "Offer cancelled",
        message: `Findtern cancelled the accepted offer for ${role} before payment.`,
        data: { proposalId: id },
      });
    }
  } else {
    await notify({
      to: { type: "intern", id: proposal.internId },
      type: `proposal_${status}`,
      title: status === "expired" ? "Offer expired" : "Offer withdrawn",
      message: `The proposal for ${role} is now ${status}.`,
      data: { proposalId: id },
      email:
        status === "withdrawn" || status === "rejected"
          ? emails.proposalWithdrawn({ internName: await internFirstName(proposal.internId), role })
          : undefined,
    });
  }

  return NextResponse.json({ proposal: updated });
}
