import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isInternPaid, settleInternOrder } from "@/lib/payments";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

const bodySchema = z.object({
  reference: z.string().trim().min(3).max(120),
  amountRupees: z.number().min(0).max(1_000_000).optional(),
});

/**
 * Admin records an activation fee paid off-platform (bank, cash). Same shape as
 * the ₹0 promo path: a `paid` intern_payments row through the normal settlement
 * (invoice number, notification, legacy flag, held InCruiter result). Idempotent.
 * Needs interns:write (the /api/admin/interns/ prefix in permissions.ts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a payment reference (3+ characters) and a valid amount" }, { status: 400 });

  const db = getDb();
  const [onboarding] = await db.select({ id: schema.internOnboarding.id }).from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, id)).limit(1);
  if (!onboarding) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const amountMinor = Math.round((parsed.data.amountRupees ?? (await getInternActivationFeeMinor()) / 100) * 100);
  const { reference } = parsed.data;
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
    meta: { orderId, amountMinor, reference },
  }, { strict: true });
  return NextResponse.json({ ok: true });
}
