import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { unfilledDays } from "@/lib/employer-timesheets";
import { formatDate } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, notify } from "@/lib/notify";
import { periodDays } from "@/lib/timesheet-days";

/**
 * Send a timesheet for approval.
 *
 * Legacy rule (routes.ts:13760, INW-06 / INW-24): it goes once every day of
 * the period has one of the four statuses. Hours are not required, and the
 * period does not have to be over.
 *
 * A sheet that was sent back can be resent as it is (legacy saved before
 * sending, which made it a draft); resending clears the old rejection date
 * and note so they don't sit on the new submission (INW-23).
 *
 * Each day's status at sending is kept on the entry as `internStatus`, so
 * the intern can later see which days the manager adjusted (INW-08). It is
 * an extra key on the jsonb row; legacy reads only `date` and `status`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [sheet] = await db
    .select()
    .from(schema.timesheets)
    .where(and(eq(schema.timesheets.id, id), eq(schema.timesheets.internId, guard.session.uid)))
    .limit(1);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sheet.status !== "draft" && sheet.status !== "rejected") {
    return NextResponse.json({ error: "Only draft or rejected timesheets can be submitted" }, { status: 400 });
  }

  const rows = Array.isArray(sheet.entries) ? (sheet.entries as unknown[]) : [];
  if (sheet.periodStart && sheet.periodEnd) {
    const missing = unfilledDays(periodDays(sheet.periodStart, sheet.periodEnd), rows);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `${missing.length} day${missing.length === 1 ? "" : "s"} still need${missing.length === 1 ? "s" : ""} a status. Pick Present, Absent, Fixed off or Holiday for each.`,
          missingDates: missing.slice(0, 62),
        },
        { status: 400 },
      );
    }
  } else if (rows.length === 0) {
    return NextResponse.json({ error: "Please fill the timesheet before submitting" }, { status: 400 });
  }

  const entries = rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const record = row as Record<string, unknown>;
    return { ...record, internStatus: typeof record.status === "string" ? record.status : "" };
  });

  const [sent] = await db
    .update(schema.timesheets)
    .set({ status: "submitted", submittedAt: new Date(), rejectedAt: null, managerNote: null, entries, updatedAt: new Date() })
    .where(and(eq(schema.timesheets.id, id), inArray(schema.timesheets.status, ["draft", "rejected"])))
    .returning({ id: schema.timesheets.id });
  if (!sent) return NextResponse.json({ error: "This timesheet was already sent." }, { status: 409 });

  const [u] = await db
    .select({ f: schema.users.firstName, l: schema.users.lastName })
    .from(schema.users)
    .where(eq(schema.users.id, sheet.internId))
    .limit(1);
  const candidate = `${u?.f ?? ""} ${u?.l ?? ""}`.trim() || "Your intern"; // hired, so the name is unmasked
  const period = `${formatDate(sheet.periodStart)} – ${formatDate(sheet.periodEnd)}`;
  await notify({
    to: { type: "employer", id: sheet.employerId },
    type: "timesheet_submitted",
    title: "Timesheet submitted",
    message: `${candidate} submitted a timesheet for ${period}.`,
    data: { timesheetId: id },
    dedupeKey: `timesheet_submitted_${id}_${Date.now()}`,
    email: emails.timesheetSubmitted({ employerName: (await employerNames(sheet.employerId)).contact, candidate, period, timesheetId: id }),
  });
  return NextResponse.json({ ok: true });
}
