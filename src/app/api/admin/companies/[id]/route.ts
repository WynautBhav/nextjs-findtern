import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { forgetAccountStatus } from "@/lib/account-status";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";

const bodySchema = z
  .object({
    isActive: z.boolean().optional(),
    internationalFteStatus: z.enum(["none", "applied", "approved", "rejected"]).optional(),
  })
  .refine((b) => b.isActive !== undefined || b.internationalFteStatus !== undefined, "Nothing to change");

/** Activate / deactivate an employer, or decide their International FTE request. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const b = parsed.data;
  const db = getDb();
  const updated = await db
    .update(schema.employers)
    .set({
      ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
      ...(b.internationalFteStatus
        ? {
            internationalFteStatus: b.internationalFteStatus,
            internationalFteApprovedAt: b.internationalFteStatus === "approved" ? new Date() : null,
          }
        : {}),
    })
    .where(eq(schema.employers.id, id))
    .returning({ id: schema.employers.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.isActive !== undefined) forgetAccountStatus("employer", id);
  if (b.internationalFteStatus === "approved" || b.internationalFteStatus === "rejected") {
    await notify({
      to: { type: "employer", id },
      type: `international_fte_${b.internationalFteStatus}`,
      title: b.internationalFteStatus === "approved" ? "International FTE approved" : "International FTE declined",
      message:
        b.internationalFteStatus === "approved"
          ? "You can now send full-time offers in USD."
          : "Your International FTE request wasn't approved. Contact us for details.",
    });
  }
  return NextResponse.json({ ok: true });
}

/** Delete an employer that never sent a proposal or paid; otherwise deactivate instead. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [[proposal], [payment], [interview]] = await Promise.all([
    db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.employerId, id)).limit(1),
    db.select({ id: schema.employerPayments.id }).from(schema.employerPayments).where(eq(schema.employerPayments.employerId, id)).limit(1),
    db.select({ id: schema.interviews.id }).from(schema.interviews).where(eq(schema.interviews.employerId, id)).limit(1),
  ]);
  if (proposal || payment || interview) {
    return NextResponse.json(
      { error: "This employer has proposals, interviews or payments on record. Deactivate them instead." },
      { status: 409 },
    );
  }
  await db.delete(schema.employerCartItems).where(eq(schema.employerCartItems.employerId, id));
  await db.delete(schema.projects).where(eq(schema.projects.employerId, id));
  await db.delete(schema.employers).where(eq(schema.employers.id, id));
  forgetAccountStatus("employer", id);
  return NextResponse.json({ ok: true });
}
