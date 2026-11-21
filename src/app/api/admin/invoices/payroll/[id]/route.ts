import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isRealDay, todayIst } from "@/lib/offer";
import { MANUAL_INVOICE_KIND } from "@/lib/payroll-invoice";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("paid"),
    reference: z.string().trim().min(3).max(120),
    /** The day the wire arrived (YYYY-MM-DD, India); today when left out. */
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({ action: z.literal("void") }),
]);

/**
 * The only two changes an issued payroll invoice allows. "paid" records the wire (status, paidAt, who and what
 * reference) and never runs the checkout settlement: nothing is hired and no promo is used. "void" cancels an unpaid
 * one and keeps its number, which is never reused. Lines, amounts, number and buyer have no endpoint.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  if (!allows(guard.session.permissions, ["transactions:write"])) {
    return NextResponse.json({ error: "Recording a payment needs the Accounts permission (transactions:write)" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the wire reference (3+ characters) and the day it was received." }, { status: 400 });
  const body = parsed.data;
  const now = new Date();
  if (body.action === "paid" && body.receivedOn && (!isRealDay(body.receivedOn) || body.receivedOn > todayIst(now))) {
    return NextResponse.json({ error: "The received date is not a real day, or is in the future." }, { status: 400 });
  }

  const P = schema.employerPayments;
  const result = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ id: P.id, status: P.status, invoiceNumber: P.invoiceNumber })
      .from(P)
      .where(and(eq(P.id, id), sql`${P.raw}->>'kind' = ${MANUAL_INVOICE_KIND}`))
      .for("update")
      .limit(1);
    if (!row) return { error: "Not found", status: 404 } as const;
    // Both changes start from "created" only: a paid invoice is never voided and a void one never paid.
    if (row.status !== "created") return { error: `This invoice is already ${row.status}.`, status: 409 } as const;

    if (body.action === "void") {
      await tx
        .update(P)
        .set({
          status: "void",
          updatedAt: now,
          raw: sql`${P.raw} || ${JSON.stringify({ voidedAt: now.toISOString(), voidedBy: guard.session.uid })}::jsonb`,
        })
        .where(eq(P.id, id));
      await recordAdminAudit(tx, { adminId: guard.session.uid, action: "invoice.payroll_voided", targetType: "employer_payments", targetId: id, meta: { invoiceNumber: row.invoiceNumber } }, { strict: true });
      return { ok: true, invoiceStatus: "void" } as const;
    }

    // The wire is dated at noon India time, so it lands on that day in IST and in UTC.
    const receivedAt = body.receivedOn ? new Date(`${body.receivedOn}T12:00:00+05:30`) : now;
    await tx
      .update(P)
      .set({
        status: "paid",
        paidAt: receivedAt,
        updatedAt: now,
        raw: sql`${P.raw} || ${JSON.stringify({ receivedAt: receivedAt.toISOString(), receivedBy: guard.session.uid, wireReference: body.reference })}::jsonb`,
      })
      .where(eq(P.id, id));
    await recordAdminAudit(
      tx,
      { adminId: guard.session.uid, action: "invoice.payroll_paid", targetType: "employer_payments", targetId: id, meta: { invoiceNumber: row.invoiceNumber, reference: body.reference, receivedAt: receivedAt.toISOString() } },
      { strict: true },
    );
    return { ok: true, invoiceStatus: "paid" } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
