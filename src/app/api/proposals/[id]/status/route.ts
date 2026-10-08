import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { sendSmtpMail } from "@/lib/mailer";

/**
 * Which role may set which status.
 *
 * A proposal has two parties and the legal transitions differ by which one is
 * asking: only the employer may withdraw, only the intern may accept or
 * reject. Encoding that as a map keeps the rule in one readable place instead
 * of scattered through conditionals.
 */
const ALLOWED: Record<string, string[]> = {
  employer: ["withdrawn", "accepted", "rejected"],
  intern: ["accepted", "rejected"],
  admin: ["withdrawn", "accepted", "rejected"],
};

/** Statuses from which no further transition is meaningful. */
const TERMINAL = ["accepted", "rejected", "withdrawn"];

const bodySchema = z.object({
  status: z.enum(["withdrawn", "accepted", "rejected"]),
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


  const [updated] = await db
    .update(schema.proposals)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.proposals.id, id))
    .returning();

  // Notify the other party. A mail failure must not roll back a state change
  // the user already succeeded at making, so mail is best-effort and the
  // in-app notification is the durable record.
  const notifyEmployer = session.role === "intern";
  await db.insert(schema.notifications).values({
    recipientType: notifyEmployer ? "employer" : "intern",
    recipientId: notifyEmployer ? proposal.employerId : proposal.internId,
    type: `proposal_${status}`,
    title: `Proposal ${status}`,
    message: `A proposal on your account was ${status}.`,
    data: { proposalId: id },
  });

  const recipient = notifyEmployer
    ? await db
        .select({ email: schema.employers.companyEmail })
        .from(schema.employers)
        .where(eq(schema.employers.id, proposal.employerId))
        .limit(1)
    : await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, proposal.internId))
        .limit(1);
  if (recipient[0]) {
    await sendSmtpMail({
      to: recipient[0].email,
      subject: `Your Findtern proposal was ${status}`,
      text: `A proposal on your account was ${status}. Sign in to review it.`,
    }).catch(() => {});
  }

  return NextResponse.json({ proposal: updated });
}
