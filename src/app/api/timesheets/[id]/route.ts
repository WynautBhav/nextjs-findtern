import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { DAY_STATUSES } from "@/lib/employer-timesheets";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";

const bodySchema = z.object({
  entries: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(DAY_STATUSES) }))
    .min(1)
    .max(62),
});

/** The employer corrects day statuses on a submitted timesheet (legacy feature). */
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
  if (sheet.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted timesheets can be adjusted" }, { status: 409 });
  }

  // Keep each day's other fields (hours, note); only the status changes.
  const byDate = new Map(
    (Array.isArray(sheet.entries) ? (sheet.entries as Record<string, unknown>[]) : []).map((e) => [String(e.date).slice(0, 10), e]),
  );
  for (const e of parsed.data.entries) byDate.set(e.date, { ...(byDate.get(e.date) ?? {}), date: e.date, status: e.status });
  const entries = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  await db.update(schema.timesheets).set({ entries, updatedAt: new Date() }).where(eq(schema.timesheets.id, id));
  await notify({
    to: { type: "intern", id: sheet.internId },
    type: "timesheet_adjusted",
    title: "Timesheet adjusted",
    message: "Your manager adjusted some days on your submitted timesheet.",
    data: { timesheetId: id },
  });
  return NextResponse.json({ ok: true });
}
