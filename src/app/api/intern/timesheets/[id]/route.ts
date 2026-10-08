import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

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
  if (sheet.status !== "draft") {
    return NextResponse.json(
      { error: "This period has already been sent, so it can no longer be edited" },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(schema.timesheets)
    .set({
      entries: parsed.data.entries,
      internNote: parsed.data.note ?? sheet.internNote,
      updatedAt: new Date(),
    })
    .where(eq(schema.timesheets.id, id))
    .returning();

  return NextResponse.json({ ok: true, totalHours: updated.entries });
}
