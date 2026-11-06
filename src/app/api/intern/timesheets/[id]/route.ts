import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { LEGACY_DAY_STATUSES } from "@/lib/employer-timesheets";
import { requireMutation } from "@/lib/guards-mutation";
import { clearFutureDays, duplicateDay, mergeEntriesByDate, periodDays, todayIst } from "@/lib/timesheet-days";

/**
 * Autosave for a draft timesheet, and deleting one.
 *
 * Writes the two columns a person actually edits (`entries`, `intern_note`)
 * and refuses to touch a sheet that has been approved or is with the
 * manager. Ownership is the `intern_id` predicate on every query, so a
 * candidate cannot write into another candidate's timesheet by guessing an
 * id.
 *
 * Day statuses are the four legacy writes and counts (INW-05): no "Leave".
 * A day after today (IST) can carry nothing: no status, hours or note. The server
 * blanks those fields on future days instead of refusing the save.
 */

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(24).optional().default(0),
  note: z.string().max(400).optional().default(""),
  status: z.enum([...LEGACY_DAY_STATUSES, ""]).optional().default(""),
});

const bodySchema = z.object({
  entries: z.array(entrySchema).max(62),
  note: z.string().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const [sheet] = await db
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.internId, guard.session.uid)))
    .limit(1);

  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Drafts, and sheets the manager sent back, can be edited.
  if (sheet.status !== "draft" && sheet.status !== "rejected") {
    return NextResponse.json(
      { error: "This period has already been sent, so it can no longer be edited" },
      { status: 409 },
    );
  }

  if (duplicateDay(parsed.data.entries)) {
    return NextResponse.json({ error: "Each day can appear only once" }, { status: 400 });
  }

  const inPeriod = new Set(periodDays(sheet.periodStart, sheet.periodEnd));
  const today = todayIst();
  const sent = clearFutureDays(
    parsed.data.entries.filter((e) => inPeriod.size === 0 || inPeriod.has(e.date)),
    today,
  );
  // Only the days sent are replaced; the rest of the month stays as saved.
  const stored = (Array.isArray(sheet.entries) ? sheet.entries : []) as typeof sent;
  const entries = mergeEntriesByDate(
    stored.filter((e) => e && typeof e.date === "string" && (inPeriod.size === 0 || inPeriod.has(e.date))),
    sent,
  );

  // INW-23, legacy routes.ts:13733: editing a sheet that was sent back makes
  // it a draft again and clears the rejection date. The manager's note stays
  // in view while the intern fixes things and is cleared when it is resent.
  const [updated] = await db
    .update(schema.timesheets)
    .set({
      entries,
      internNote: parsed.data.note ?? sheet.internNote,
      ...(sheet.status === "rejected" ? { status: "draft", rejectedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.timesheets.id, id), inArray(schema.timesheets.status, ["draft", "rejected"])))
    .returning({ status: schema.timesheets.status });

  if (!updated) {
    return NextResponse.json({ error: "This period has just been sent, so it can no longer be edited" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: updated.status });
}

/**
 * Delete a timesheet, legacy rule (routes.ts:13850, INW-18): a draft, or a
 * sheet sent for approval that the intern wants to withdraw. Approved and
 * sent-back sheets stay on record.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const deleted = await getDb()
    .delete(schema.timesheets)
    .where(
      and(
        eq(schema.timesheets.id, id),
        eq(schema.timesheets.internId, guard.session.uid),
        inArray(schema.timesheets.status, ["draft", "submitted"]),
      ),
    )
    .returning({ id: schema.timesheets.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Only a draft, or a sheet waiting for approval, can be deleted." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
