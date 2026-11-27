import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProposalActionable } from "@/lib/projects/takedown-guard-server";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { emails, renderEmail } from "@/lib/emails";
import { cgpaEmails } from "@/lib/emails/cgpa";
import { readCgpaVerification } from "@/lib/cgpa-verification";
import { withAcceptedAt } from "@/lib/cgpa-verification-flow";
import { profileCompleteForHire, profileIncompleteBody } from "@/lib/hire-gate";
import { sendSmtpMail } from "@/lib/mailer";
import { SITE } from "@/lib/content/site";
import { initialsOf } from "@/lib/employer-candidates";
import { employerNames, internFirstName, notify, resolveOfferNotifications } from "@/lib/notify";
import { guaranteeMisses, guaranteeState } from "@/lib/guarantee";
import { FREE_DECLINES, offerPastStart, parseOffer, todayIst } from "@/lib/offer";
import { feeRateLabel, fullTimeRate } from "@/lib/checkout";
import { hasOpenOrderFor, OPEN_ORDER_MINUTES } from "@/lib/payments";
import { withLock, type Tx } from "@/lib/advisory-lock";
import { openOrderProposalIds } from "@/lib/employer-payable";
import { TAKEDOWN_BLOCKS, takedownBlock } from "@/lib/projects/takedown";
import { internLockResponse } from "@/lib/intern-unlock";
import { expiredStamp, withdrawRefusal } from "@/lib/proposal-expiry";
import { proposalActionRefusal } from "@/lib/proposal-permissions";
import { isHiredProposal } from "@/lib/hire-status";
import { ALREADY_LINED_UP, rowHoldsIntern } from "@/lib/candidate-hold";
import { heldProposalIds, ON_HOLD_REFUSAL } from "@/lib/moderation/hold";

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
  // ("withdrawn" from accepted: staff only, since 27 Nov the employer can't).
  // Which states each may withdraw from is proposal-permissions.ts. Staff never accept for a candidate: that
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
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { status } = parsed.data;
  const allowed = ALLOWED[session.role] ?? [];


  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `${session.role === "employer" ? "An" : "A"} ${session.role} cannot set a proposal to "${status}"` },
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
  // On hold (either side's account is frozen): paused, not withdrawn. Neutral; the other side learns nothing more.
  if (status === "accepted" && (await heldProposalIds(db, [id])).has(id)) {
    return NextResponse.json(ON_HOLD_REFUSAL, { status: 409 });
  }
  if (session.role === "employer") {
    const td = await assertProposalActionable(id, session.uid);
    if (!td.ok) return td.response;
  }

  // An expired offer (stored, or past its start day before the sweeper ran) is never withdrawn: 409 with the reason.
  if (status === "withdrawn") {
    const refusal = withdrawRefusal(proposal);
    if (refusal) return NextResponse.json({ error: refusal, code: "proposal_expired" }, { status: 409 });
  }

  // State-machine guard. The legacy routes had none, which meant a withdrawn
  // offer could be accepted afterwards and both parties could be told it was
  // live. Who may withdraw from which state is the one table in proposal-permissions.ts
  // (employer and staff: until the hire is paid, even after the candidate accepted, internship or full-time).
  const offerForCancel = parseOffer(proposal.offerDetails, proposal.currency);
  if (status === "withdrawn" && (session.role === "employer" || session.role === "admin")) {
    const refused = proposalActionRefusal("withdraw", session.role, { status: proposal.status, hiredAt: proposal.hiredAt, fullTime: Boolean(offerForCancel.fullTime) });
    if (refused) return NextResponse.json({ error: refused }, { status: 409 });
  }
  const cancelBeforePayment = (session.role === "admin" || session.role === "employer") && status === "withdrawn" && proposal.status === "accepted";
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
  // A taken-down listing freezes its offers: no acceptance (internship or full-time). Declining stays open.
  if (recordTerms && proposal.projectId) {
    const [project] = await db
      .select({ takenDownAt: schema.projects.takenDownAt })
      .from(schema.projects)
      .where(eq(schema.projects.id, proposal.projectId))
      .limit(1);
    const blocked = takedownBlock(project, "accept");
    if (blocked) return NextResponse.json({ error: blocked, code: "listing_taken_down" }, { status: 409 });
  }
  if (recordTerms && !parsed.data.agreedToTerms) {
    return NextResponse.json({ error: "Agree to the intern terms and NDA to accept." }, { status: 400 });
  }
  if (recordTerms && offer.fullTime && !parsed.data.agreedToFullTimeTerms) {
    return NextResponse.json({ error: "Agree to the full-time acceptance terms to accept." }, { status: 400 });
  }
  // An incomplete profile cannot be hired: refused here, before the offer leaves "sent" and long before any money moves (B-62).
  if (recordTerms) {
    const hire = await profileCompleteForHire(db, proposal.internId);
    if (!hire.ok) return NextResponse.json(profileIncompleteBody("intern", hire.missing), { status: 409 });
  }

  // Declines: the first FREE_DECLINES are free; the next one is allowed but
  // ends the placement guarantee, and only after the candidate saw that.
  const internDecline = session.role === "intern" && status === "rejected";
  let endsGuarantee = false;
  // A full-time conversion offer never counts as a miss (guarantee.ts), so
  // declining one neither warns nor ends the guarantee.
  if (internDecline && !offer.fullTime) {
    const [onboarding] = await db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, proposal.internId))
      .limit(1);
    const [previous, [membership]] = await Promise.all([
      db
        .select({ status: schema.proposals.status, offerDetails: schema.proposals.offerDetails, currency: schema.proposals.currency })
        .from(schema.proposals)
        .where(eq(schema.proposals.internId, proposal.internId)),
      db
        .select({ status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt })
        .from(schema.collegeMemberships)
        .where(eq(schema.collegeMemberships.userId, proposal.internId))
        .limit(1),
    ]);
    const misses = guaranteeMisses(previous);
    // A student who joined with a college code has no guarantee to lose: they decline freely (guarantee.ts).
    if (guaranteeState(onboarding?.extraData, misses, membership) === "active" && misses.total >= FREE_DECLINES) {
      if (!parsed.data.acknowledgeGuaranteeEnd) {
        return NextResponse.json(
          {
            error: `You have already turned down or let lapse ${misses.total} offers. Missing more than ${FREE_DECLINES} offers means you are no longer eligible for a refund under the guarantee.`,
            code: "guarantee_warning",
            declines: misses.total,
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
      // acceptedAt starts the CGPA check clock and the unpaid-offer rules; it is stamped the first time only.
      return { ...withAcceptedAt(base, new Date(now)), termsAcceptedAt: now, ...(offer.fullTime ? { fullTimeTermsAcceptedAt: now } : {}) };
    }
    if (internDecline) return { ...base, declinedBy: "intern", declinedAt: now };
    // Keep a lapsed `sent` offer countable once it leaves `sent` (withdraw / admin expire).
    const lapse = proposal.status === "sent" && offerPastStart(offer.startDate) ? { lapsedAt: now } : {};
    if (session.role === "admin") return { ...base, ...lapse, closedByAdminAt: now, closedByAdminStatus: status, ...(status === "expired" ? expiredStamp("admin_closed") : {}) };
    return lapse.lapsedAt ? { ...base, ...lapse } : null;
  };
  const details = stampedDetails();


  // One transaction: status flip, expiring the intern's other offers and the
  // cart cleanup land together. Locking the intern's proposal rows first makes
  // two simultaneous acceptances queue instead of both winning.
  let expired: { id: string; employerId: string }[] = [];
  // A withdraw runs under the order route's lock (`employer-pay:<employerId>`, taken first, before any row lock, as the
  // order route and the expiry sweep do), and the open-order check is re-read inside it. An order opened in another tab
  // either committed first (seen here, refused) or waits and then finds the offer withdrawn (its own re-check refuses).
  const lockedWithdraw = status === "withdrawn";
  const run = <T>(fn: (tx: Tx) => Promise<T>) => (lockedWithdraw ? withLock(`employer-pay:${proposal.employerId}`, fn) : db.transaction(fn));
  const updated = await run(async (tx) => {
    if (lockedWithdraw && (await openOrderProposalIds(tx, proposal.employerId)).has(proposal.id)) return "paying" as const;
    // In id order, the same order the takedown locks a project's offers in, so the two cannot deadlock.
    await tx.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.internId, proposal.internId)).orderBy(schema.proposals.id).for("update");
    // Re-check the takedown under a shared row lock: the admin takedown holds FOR UPDATE on the project
    // row, so it either committed before this read (seen here) or waits until this transaction ends.
    if (recordTerms && proposal.projectId) {
      const [live] = await tx
        .select({ takenDownAt: schema.projects.takenDownAt })
        .from(schema.projects)
        .where(eq(schema.projects.id, proposal.projectId))
        .for("share")
        .limit(1);
      if (takedownBlock(live, "accept")) return "taken_down" as const;
    }
    // One internship at a time (candidate-hold.ts): another offer accepted and not yet paid or lapsed, or a hire still
    // running or upcoming with ANOTHER company (a company's own earlier hire never blocks its full-time offer), blocks a
    // second acceptance. The rows are locked above, so this read is stable.
    if (status === "accepted") {
      const others = await tx
        .select({
          employerId: schema.proposals.employerId,
          status: schema.proposals.status,
          hiredAt: schema.proposals.hiredAt,
          endedAt: schema.proposals.endedAt,
          offerDetails: schema.proposals.offerDetails,
          currency: schema.proposals.currency,
        })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.internId, proposal.internId), ne(schema.proposals.id, id)));
      if (others.some((o) => (o.employerId !== proposal.employerId || !isHiredProposal(o)) && rowHoldsIntern(o))) return "busy" as const;
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
    if (status === "rejected") {
      // A declined candidate leaves the employer's shortlist (legacy routes.ts:14481). An expired offer does not:
      // the employer keeps the candidate shortlisted and re-proposes in one click.
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
          .set({
            status: "expired",
            updatedAt: new Date(),
            // Durable lapse stamp: a `sent` sibling past its start day still counts as a miss. And the reason it closed, so
            // every side reads the same thing: the employer "Closed · accepted elsewhere", the intern "Closed · you took another
            // offer" (without it the intern's legacy reading said "Withdrawn", which the company never did).
            offerDetails: sql`(CASE WHEN ${schema.proposals.status} = 'sent' AND left(${schema.proposals.offerDetails}->>'startDate', 10) <= ${todayIst()} THEN coalesce(${schema.proposals.offerDetails}, '{}'::jsonb) || jsonb_build_object('lapsedAt', now()) ELSE coalesce(${schema.proposals.offerDetails}, '{}'::jsonb) END) || ${JSON.stringify(expiredStamp("accepted_elsewhere"))}::jsonb`,
          })
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
  if (updated === "paying") {
    return NextResponse.json({ error: "A payment for this offer is in progress. Try again in a few minutes." }, { status: 409 });
  }
  if (updated === "taken_down") {
    return NextResponse.json({ error: TAKEDOWN_BLOCKS.accept, code: "listing_taken_down" }, { status: 409 });
  }
  if (updated === "busy") {
    return NextResponse.json({ error: ALREADY_LINED_UP, code: "candidate_unavailable" }, { status: 409 });
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
    // Accepted while the CGPA check is open: the mail must not say "pay now" for an offer that cannot be paid yet.
    const cgpaPending = status === "accepted" && (await cgpaPendingFor(proposal.internId));
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
      email: emails.proposalDecision({ employerName: contact, candidate, role, accepted: status === "accepted", proposalId: id, fullTime, feeRate: offer.fullTime ? feeRateLabel(fullTimeRate(offer.fullTime)) : undefined, cgpaPending }),
    });
    if (status === "accepted") {
      await requestCgpaCheck({ proposalId: id, internId: proposal.internId, employerId: proposal.employerId, role, startDate: offer.startDate ?? null });
    }
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

  return NextResponse.json({ proposal: { id: updated.id, status: updated.status } });
}

async function cgpaPendingFor(internId: string): Promise<boolean> {
  try {
    const [onboarding] = await getDb().select({ extraData: schema.internOnboarding.extraData }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, internId)).limit(1);
    return readCgpaVerification(onboarding?.extraData).status === "pending";
  } catch {
    return false;
  }
}

/**
 * An intern who chose a semester and entered a score is waiting for Findtern to verify the CGPA. When they accept an
 * offer, the clock starts: tell the admin team and promise the intern an answer in 24-48 hours. One in-app row per
 * proposal (dedupe key); the admin email goes only when that row was newly written, so a repeat sends nothing.
 * Best effort: nothing here can undo the acceptance.
 */
async function requestCgpaCheck(o: { proposalId: string; internId: string; employerId: string; role: string; startDate: string | null }) {
  try {
    const db = getDb();
    const [onboarding] = await db
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, o.internId))
      .limit(1);
    const v = readCgpaVerification(onboarding?.extraData);
    if (v.status !== "pending") return;
    const [user] = await db
      .select({ f: schema.users.firstName, l: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, o.internId))
      .limit(1);
    const internName = `${user?.f ?? ""} ${user?.l ?? ""}`.trim() || "A candidate";
    const first = await notify({
      to: { type: "intern", id: o.internId },
      type: "cgpa_verification_requested",
      title: "We'll verify your CGPA within 24-48 hours",
      message: "You'll get a confirmation call or email from Findtern. There is nothing else you need to do.",
      data: { proposalId: o.proposalId },
      dedupeKey: `cgpa_requested:${o.proposalId}`,
      email: cgpaEmails.requestedForIntern({ internName: user?.f ?? "", semester: v.semester, score: v.claimedScore, scoreType: v.scoreType }),
    });
    if (!first) return;
    const { company } = await employerNames(o.employerId);
    await sendSmtpMail({
      to: process.env.ADMIN_ALERT_EMAIL ?? SITE.adminEmail,
      ...renderEmail(
        cgpaEmails.dueForAdmin({ internName, internId: o.internId, proposalId: o.proposalId, semester: v.semester, score: v.claimedScore, scoreType: v.scoreType, company, role: o.role, startDate: o.startDate }),
      ),
    });
  } catch (err) {
    console.error("[proposal-status] CGPA check request failed", err);
  }
}
