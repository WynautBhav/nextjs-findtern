import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { markPaidProblem } from "@/lib/admin/mark-paid-rules";
import { allows } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isInternPaid, settleInternOrder } from "@/lib/payments";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

const bodySchema = z.object({
  reference: z.string().trim().min(3).max(120),
  amountRupees: z.number().positive("Amount must be more than ₹0").max(1_000_000).optional(),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Admin records an activation fee paid off-platform (bank, cash). Same shape as
 * the ₹0 promo path: a `paid` intern_payments row through the normal settlement
 * (invoice number, notification, legacy flag, held InCruiter result). Idempotent.
 * Money: needs transactions:write on top of interns:write (the proxy checks the latter, this route the former).
 * Never ₹0, and a reason is required when the amount is not the standard fee (lib/admin/mark-paid-rules).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  if (!allows(guard.session.permissions, ["transactions:write"])) {
    return NextResponse.json({ error: "Recording a payment needs the Accounts permission (transactions:write)" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.path[0] === "amountRupees" ? parsed.error.issues[0].message : "Enter a payment reference (3+ characters) and a valid amount" }, { status: 400 });

  const db = getDb();
  const [onboarding] = await db.select({ id: schema.internOnboarding.id }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  if (!onboarding) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [account] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  const feeMinor = await getInternActivationFeeMinor();
  const amountMinor = Math.round((parsed.data.amountRupees ?? feeMinor / 100) * 100);
  const { reference, reason } = parsed.data;
  const problem = markPaidProblem({ role: account?.role, amountMinor, feeMinor, reason });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const orderId = await db.transaction(async (tx) => {
    // Lock the intern's user row: a second mark-paid (double click, two tabs, two admins) waits here until the first commits.
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).for("update");
    if (await isInternPaid(id, tx)) return null;
    const [open] = await tx
      .select({ orderId: schema.internPayments.orderId })
      .from(schema.internPayments)
      .where(and(eq(schema.internPayments.internId, id), eq(schema.internPayments.gateway, "manual"), eq(schema.internPayments.status, "created")))
      .limit(1);
    if (open) return open.orderId; // an earlier click's row (or a failed settle): settle that one, never a second
    const fresh = `manual_${id}_${randomUUID().slice(0, 8)}`;
    await tx.insert(schema.internPayments).values({
      internId: id,
      gateway: "manual",
      orderId: fresh,
      amountMinor,
      currency: "INR",
      status: "created",
      raw: { method: "manual", reference, markedBy: guard.session.uid },
    });
    return fresh;
  });
  if (!orderId) return NextResponse.json({ ok: true, alreadyPaid: true });
  const settled = await settleInternOrder({ orderId, paymentId: reference, internId: id });
  if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: settled.status });

  await recordAdminAudit(db, {
    adminId: guard.session.uid,
    action: "intern.activation_marked_paid",
    targetType: "intern",
    targetId: id,
    meta: { orderId, amountMinor, reference, ...(reason ? { reason } : {}) },
  }, { strict: true });
  return NextResponse.json({ ok: true });
}
