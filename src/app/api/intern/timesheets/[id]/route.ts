import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { periodDays, todayIst } from "@/lib/timesheet-days";

/**
 * Autosave for a draft timesheet.
 *
 * ── Why this route exists ───────────────────────────────────────────────
 *
 * The intern timesheet screen could display a draft and submit it, but there
 * was no way to write hours into it. The column shape was always here
 * (`entries` jsonb, `intern_note`) and the POST handler could already create a
 * sheet with entries, but nothing could update one, so the feature the screen
 * implied did not exist.
 *
 * This is the smallest version that makes the screen true: it writes the two
 * columns a person actually edits, refuses to touch a sheet that has already
 * been sent, and nothing else. No schema change, no new table, no field the
 * rest of the product does not already read.
 *
 * Guarded by `requireMutation` with the same ownership predicate the submit
 * route uses, so a candidate cannot write into another candidate's timesheet by
 * guessing an id.
 */

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().min(0).max(24),
  note: z.string().max(400).optional().default(""),
  status: z.enum(["Present", "Leave", "Absent", "Fixed off", "Holiday", ""]).optional().default(""),
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

  // Only days inside the period, and nothing claimed for a day that has not
  // happened yet - an approved future "Present" is a bill for unworked time.
  const inPeriod = new Set(periodDays(sheet.periodStart, sheet.periodEnd));
  const today = todayIst();
  const entries = parsed.data.entries.filter((e) => inPeriod.size === 0 || inPeriod.has(e.date));
  if (entries.some((e) => e.date > today && (e.hours > 0 || e.status !== "" || e.note.trim() !== ""))) {
    return NextResponse.json({ error: "You can't log a day that hasn't happened yet." }, { status: 400 });
  }

  const [updated] = await db
    .update(schema.timesheets)
    .set({
      entries,
      internNote: parsed.data.note ?? sheet.internNote,
      updatedAt: new Date(),
    })
    .where(eq(schema.timesheets.id, id))
    .returning();

  return NextResponse.json({ ok: true, totalHours: updated.entries });
}

/** Delete a draft timesheet (legacy feature). Sent sheets stay on record. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const deleted = await getDb()
    .delete(schema.timesheets)
    .where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.internId, guard.session.uid), eq(schema.timesheets.status, "draft")))
    .returning({ id: schema.timesheets.id });
  if (deleted.length === 0) return NextResponse.json({ error: "Only drafts can be deleted" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
