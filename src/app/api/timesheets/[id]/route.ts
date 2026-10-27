import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { DAY_STATUSES } from "@/lib/employer-timesheets";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";

const bodySchema = z
  .object({
    entries: z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(DAY_STATUSES) }))
      .max(62)
      .optional(),
    /** The manager's note on the sheet (legacy PUT accepted it too). */
    managerNote: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((b) => (b.entries?.length ?? 0) > 0 || b.managerNote !== undefined, { message: "Nothing to update" });

/**
 * The employer corrects day statuses (and the note) on any sheet not yet
 * approved, as legacy did (routes.ts:13955; EMH-45). The intern is told once
 * a day, under legacy's notice type and dedupe key.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid entries" }, { status: 400 });

  const db = getDb();
  const [sheet] = await db.select().from(schema.timesheets).where(eq(schema.timesheets.id, id)).limit(1);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sheet.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (sheet.status === "approved") {
    return NextResponse.json({ error: "Approved timesheets can't be edited." }, { status: 409 });
  }

  // Keep each day's other fields (hours, note); only the status changes.
  const byDate = new Map(
    (Array.isArray(sheet.entries) ? (sheet.entries as Record<string, unknown>[]) : []).map((e) => [String(e.date).slice(0, 10), e]),
  );
  for (const e of parsed.data.entries ?? []) byDate.set(e.date, { ...(byDate.get(e.date) ?? {}), date: e.date, status: e.status });
  const entries = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const note = parsed.data.managerNote;

  await db
    .update(schema.timesheets)
    .set({
      ...(parsed.data.entries?.length ? { entries } : {}),
      ...(note !== undefined ? { managerNote: note || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.timesheets.id, id));
  await notify({
    to: { type: "intern", id: sheet.internId },
    type: "timesheet_updated_by_employer",
    title: "Timesheet updated",
    message: "Your timesheet has been updated by the employer. Please review the changes.",
    data: { timesheetId: id, employerId: sheet.employerId },
    dedupeKey: `timesheet_updated_by_employer:${id}:${new Date().toISOString().slice(0, 10)}`,
  });
  return NextResponse.json({ ok: true });
}
