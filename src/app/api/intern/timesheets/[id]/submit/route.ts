import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatDate } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, notify } from "@/lib/notify";
import { periodDays, todayIst } from "@/lib/timesheet-days";

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

  // Every day in the period needs a status (Present / Leave / Absent /
  // Fixed off / Holiday) before the manager sees it - an unmarked day is
  // neither work nor leave, and approving it would bill thin air.
  const known = new Set(["Present", "Leave", "Absent", "Fixed off", "Holiday"]);
  const byDate = new Map(
    (Array.isArray(sheet.entries) ? sheet.entries : []).map((e) => [
      (e as { date?: unknown })?.date,
      (e as { status?: unknown })?.status,
    ]),
  );
  if (sheet.periodStart && sheet.periodEnd) {
    // Date-only walk (see timesheet-days.ts): the old local-time loop added a
    // phantom day after the period end in IST, so no sheet could ever send.
    const days = periodDays(sheet.periodStart, sheet.periodEnd);
    const today = todayIst();
    const lastDay = days[days.length - 1];
    if (lastDay && lastDay > today) {
      return NextResponse.json(
        { error: `This period runs to ${formatDate(`${lastDay}T12:00:00Z`)}. You can send it for approval from that day.` },
        { status: 400 },
      );
    }
    const missing = days.filter((iso) => !known.has(String(byDate.get(iso) ?? "")));
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `${missing.length} day${missing.length === 1 ? "" : "s"} still need${missing.length === 1 ? "s" : ""} a status - pick Present, Leave, Absent, Fixed off or Holiday for each.`,
        },
        { status: 400 },
      );
    }
  }
  await db
    .update(schema.timesheets)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(schema.timesheets.id, id));

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
