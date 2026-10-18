import { and, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { emails } from "@/lib/emails";
import { initialsOf } from "@/lib/employer-candidates";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";

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
  employer: ["withdrawn", "rejected"],
  intern: ["accepted", "rejected"],
  // Staff can additionally expire a stale trail. "expired" never comes from
  // a party - the admin tracker is its only writer.
  admin: ["withdrawn", "accepted", "rejected", "expired"],
};

/** Statuses the intern can still answer. */
const ANSWERABLE = ["sent", "interview_scheduled"];

/** Statuses from which no further transition is meaningful. */
const TERMINAL = ["accepted", "rejected", "withdrawn", "hired"];

const bodySchema = z.object({
  status: z.enum(["withdrawn", "accepted", "rejected", "expired"]),
  /** Intern accepting: agreed to the intern terms and NDA. */
  agreedToTerms: z.boolean().optional(),
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
  if (TERMINAL.includes(proposal.status)) {
    return NextResponse.json(
      { error: `Proposal is already ${proposal.status}` },
      { status: 409 },
    );
  }
  if (session.role === "intern" && !ANSWERABLE.includes(proposal.status)) {
    return NextResponse.json({ error: "This offer can't be answered any more" }, { status: 409 });
  }
  const recordTerms = session.role === "intern" && status === "accepted";
  if (recordTerms && !parsed.data.agreedToTerms) {
    return NextResponse.json({ error: "Agree to the intern terms and NDA to accept." }, { status: 400 });
  }


  const [updated] = await db
    .update(schema.proposals)
    .set({
      status,
      updatedAt: new Date(),
      ...(recordTerms
        ? { offerDetails: { ...((proposal.offerDetails ?? {}) as Record<string, unknown>), termsAcceptedAt: new Date().toISOString() } }
        : {}),
    })
    // Only if nobody changed it since we read it (accept vs withdraw race).
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.status, proposal.status)))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "This offer changed a moment ago. Refresh and try again." }, { status: 409 });
  }

  // Accepting closes the intern's other open offers from this employer and
  // takes them off that employer's shortlist (legacy behaviour).
  if (status === "rejected") {
    // A declined candidate leaves the employer's shortlist (legacy behaviour).
    await db
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
    await db
      .update(schema.proposals)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(schema.proposals.employerId, proposal.employerId),
          eq(schema.proposals.internId, proposal.internId),
          ne(schema.proposals.id, id),
          inArray(schema.proposals.status, ["draft", "sent", "interview_scheduled"]),
        ),
      );
    await db
      .delete(schema.employerCartItems)
      .where(
        and(
          eq(schema.employerCartItems.employerId, proposal.employerId),
          eq(schema.employerCartItems.internId, proposal.internId),
        ),
      );
  }

  // Tell the other party. Names stay initials until a hire (legacy rule).
  const role = parseOffer(proposal.offerDetails, proposal.currency).roleTitle || "the role";
  if (session.role === "intern" && (status === "accepted" || status === "rejected")) {
    const [intern] = await db
      .select({ f: schema.users.firstName, l: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, proposal.internId))
      .limit(1);
    const candidate = `Candidate ${initialsOf(intern?.f ?? "", intern?.l ?? "")}`;
    const { contact } = await employerNames(proposal.employerId);
    await notify({
      to: { type: "employer", id: proposal.employerId },
      type: `proposal_${status}`,
      title: status === "accepted" ? "Offer accepted" : "Offer declined",
      message: `${candidate} ${status === "accepted" ? "accepted" : "declined"} your offer for ${role}.`,
      data: { proposalId: id },
      email: emails.proposalDecision({ employerName: contact, candidate, role, accepted: status === "accepted", proposalId: id }),
    });
  } else {
    await notify({
      to: { type: "intern", id: proposal.internId },
      type: `proposal_${status}`,
      title: status === "accepted" ? "Offer accepted" : status === "expired" ? "Offer expired" : "Offer withdrawn",
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
