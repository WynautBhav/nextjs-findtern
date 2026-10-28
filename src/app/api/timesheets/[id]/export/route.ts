import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/security/guards";
import { getDb, schema } from "@/lib/db";
import { displayNameOf, toCandidateProfile } from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { normaliseEntries } from "@/lib/employer-timesheets";
import { buildXlsx, XLSX_MIME, type Cell } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One timesheet as an Excel file (legacy employer-timesheet-detail.tsx:425):
 * a row per day with its status and note, then the period totals. The
 * employer who owns the timesheet, or staff, only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = getDb();
  const [sheet] = await db.select().from(schema.timesheets).where(eq(schema.timesheets.id, id)).limit(1);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const staff = hasAnyPermission(session, ["interns:read", "companies:read", "reports:read"]);
  const owns = staff || (session.role === "employer" && sheet.employerId === session.uid);
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [[user], [onboarding], [project]] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, sheet.internId)).limit(1),
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, sheet.internId)).limit(1),
    sheet.proposalId
      ? db
          .select({ name: schema.projects.projectName })
          .from(schema.proposals)
          .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
          .where(eq(schema.proposals.id, sheet.proposalId))
          .limit(1)
      : Promise.resolve([] as { name: string | null }[]),
  ]);
  // Names follow the same unmasking rule as every employer screen.
  const unlocked = staff || (await hiredInternIds(db, sheet.employerId)).has(sheet.internId);
  const name = user ? displayNameOf(toCandidateProfile(user, onboarding), unlocked) : "Candidate";

  const notes = new Map<string, string>();
  if (Array.isArray(sheet.entries)) {
    for (const e of sheet.entries as { date?: unknown; note?: unknown }[]) {
      if (typeof e?.date === "string" && typeof e.note === "string" && e.note.trim()) notes.set(e.date.slice(0, 10), e.note.trim());
    }
  }
  const days = normaliseEntries(sheet.entries, sheet.periodStart, sheet.periodEnd);
  const weekday = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

  const rows: Cell[][] = [
    ["Date", "Day", "Status", "Note"],
    ...days.map((d) => [d.date, weekday(d.date), d.status || "Not claimed", notes.get(d.date) ?? ""]),
    [],
    ["Candidate", name],
    ["Project", project?.name ?? ""],
    ["Period", `${days[0]?.date ?? ""} to ${days.at(-1)?.date ?? ""}`],
    ["Timesheet status", sheet.status],
    ["Days present", days.filter((d) => d.status === "Present").length],
    ["Days claimed", days.filter((d) => d.status).length],
    ["Days in period", days.length],
    ...(sheet.internNote ? [["Intern note", sheet.internNote]] : []),
    ...(sheet.managerNote ? [["Manager note", sheet.managerNote]] : []),
  ];

  const file = buildXlsx("Timesheet", rows);
  const stamp = (days[0]?.date ?? "period").replace(/-/g, "");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="timesheet-${stamp}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
