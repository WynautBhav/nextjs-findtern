import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(1000).optional(),
});

/**
 * Employer approves or rejects a submitted timesheet.
 *
 * Only the employer on the proposal may do this - not the intern who wrote it,
 * and not the other party on an unrelated proposal. A rejection requires a
 * reason, because a bare "rejected" gives the intern nothing to act on.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer", "admin"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const { decision, reason } = parsed.data;
  if (decision === "rejected" && !reason?.trim()) {
    return NextResponse.json(
      { error: "A rejection needs a reason" },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const db = getDb();

  const [sheet] = await db
    .select()
    .from(schema.timesheets)
    .where(eq(schema.timesheets.id, id))
    .limit(1);

  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.role !== "admin" && sheet.employerId !== session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (sheet.status !== "submitted") {
    return NextResponse.json(
      { error: `Timesheet is already ${sheet.status}` },
      { status: 409 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(schema.timesheets)
    .set({
      status: decision,
      approvedAt: decision === "approved" ? now : null,
      rejectedAt: decision === "rejected" ? now : null,
      managerNote: reason ?? null,
      updatedAt: now,
    })
    // Guarded on the status read above: two decisions racing on the same
    // sheet must not both win (and both notify).
    .where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.status, "submitted")))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "Timesheet was already decided" }, { status: 409 });
  }

  await db.insert(schema.notifications).values({
    recipientType: "intern",
    recipientId: sheet.internId,
    type: `timesheet_${decision}`,
    title: `Timesheet ${decision}`,
    message:
      decision === "approved"
        ? "Your timesheet was approved."
        : `Your timesheet was rejected: ${reason}`,
    data: { timesheetId: id },
  });

  return NextResponse.json({ timesheet: updated });
}
