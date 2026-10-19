import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { sendSmtpMail } from "@/lib/mailer";
import { parseOffer } from "@/lib/offer";

/**
 * Re-send the "stipend transferred" email for a paid payout (legacy
 * `send-stipend-email`, routes.ts:8703). Deliberately bypasses the
 * notification dedupe: the in-app notice already exists, this is only the
 * email, for an intern who says it never arrived.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; payoutId: string }> }) {
  const { id, payoutId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [payout] = await db
    .select()
    .from(schema.internPayouts)
    .where(and(eq(schema.internPayouts.id, payoutId), eq(schema.internPayouts.internId, id)))
    .limit(1);
  if (!payout) return NextResponse.json({ error: "Unknown payout" }, { status: 404 });
  if (payout.status !== "paid") return NextResponse.json({ error: "Only a paid payout has a stipend email" }, { status: 409 });

  const [user] = await db
    .select({ email: schema.users.email, firstName: schema.users.firstName })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!user?.email) return NextResponse.json({ error: "The intern has no email address" }, { status: 400 });

  // Role name: the placement's title, then the payout notes, as legacy did.
  let role = (payout.notes ?? "").trim() || "your internship";
  const proposalId = typeof payout.raw?.proposalId === "string" ? payout.raw.proposalId : null;
  if (proposalId) {
    const [pr] = await db
      .select({ offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
      .from(schema.proposals)
      .where(eq(schema.proposals.id, proposalId))
      .limit(1);
    role = (pr && parseOffer(pr.offer, pr.currency).roleTitle) || role;
  }

  const mail = renderEmail(
    emails.stipendTransferred({
      internName: (user.firstName ?? "").trim(),
      role,
      amount: formatMoney(payout.amountMinor, payout.currency as "INR" | "USD", { zeroLabel: false }),
    }),
  );
  try {
    await sendSmtpMail({ to: user.email, ...mail });
  } catch {
    return NextResponse.json({ error: "The email could not be sent. Try again shortly." }, { status: 502 });
  }
  await db.insert(schema.adminAuditLog).values({
    adminId: guard.session.uid,
    action: "payout.resend_email",
    targetType: "intern",
    targetId: id,
    meta: { payoutId },
  });
  return NextResponse.json({ ok: true });
}
