import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  proposalId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  entries: z.array(z.any()).optional(),
  status: z.enum(["draft", "submitted"]).default("draft"),
  internNote: z.string().optional(),
});

function generateMonthEntries(start: Date, end: Date) {
  const entries: { date: string; hours: number; note: string }[] = [];
  const curr = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (curr <= stop) {
    const yyyy = curr.getUTCFullYear();
    const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(curr.getUTCDate()).padStart(2, "0");
    entries.push({
      date: `${yyyy}-${mm}-${dd}`,
      hours: 0,
      note: "",
    });
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return entries;
}

/** Create or initialize a monthly timesheet for an accepted proposal. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const [proposal] = await db
    .select()
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.id, parsed.data.proposalId),
        eq(schema.proposals.internId, guard.session.uid)
      )
    )
    .limit(1);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found or access denied" }, { status: 404 });
  }

  const isAccepted =
    proposal.status === "accepted" ||
    proposal.status === "hired" ||
    proposal.hiredAt !== null;

  if (!isAccepted) {
    return NextResponse.json({ error: "Proposal is not active" }, { status: 400 });
  }

  // Calculate period start and end
  let start: Date;
  let end: Date;

  if (parsed.data.month) {
    const [yearStr, monthStr] = parsed.data.month.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  } else if (parsed.data.periodStart && parsed.data.periodEnd) {
    start = new Date(parsed.data.periodStart);
    end = new Date(parsed.data.periodEnd);
  } else {
    const now = new Date();
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  // Check if a timesheet already exists for this proposal and overlapping date
  const [existing] = await db
    .select()
    .from(schema.timesheets)
    .where(
      and(
        eq(schema.timesheets.proposalId, proposal.id),
        gte(schema.timesheets.periodEnd, start),
        lte(schema.timesheets.periodStart, end)
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        error: "A timesheet for this period already exists",
        timesheetId: existing.id,
      },
      { status: 409 }
    );
  }

  const initialEntries =
    parsed.data.entries && parsed.data.entries.length > 0
      ? parsed.data.entries
      : generateMonthEntries(start, end);

  const [sheet] = await db
    .insert(schema.timesheets)
    .values({
      proposalId: proposal.id,
      employerId: proposal.employerId,
      internId: proposal.internId,
      periodStart: start,
      periodEnd: end,
      status: parsed.data.status,
      entries: initialEntries,
      internNote: parsed.data.internNote || null,
      submittedAt: parsed.data.status === "submitted" ? new Date() : null,
    })
    .returning();

  return NextResponse.json({ timesheet: sheet }, { status: 201 });
}