import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { isHiredProposal } from "@/lib/hire-status";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { parseOffer } from "@/lib/offer";
import { timesheetPeriod } from "@/lib/employer-timesheets";
import { isoDay, periodDays, todayIst } from "@/lib/timesheet-days";

/**
 * Only the month is taken from the client. The period, the status (always
 * draft) and the day rows are derived here - a client-chosen period or
 * `status: "submitted"` used to skip the fill-every-day check and the
 * employer notification that the submit route carries.
 */
const bodySchema = z.object({
  proposalId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  internNote: z.string().max(2000).optional(),
});

/** One blank row per day, from the same walk the editor and submit use. */
function generateMonthEntries(start: string, end: string) {
  return periodDays(start, end).map((date) => ({ date, hours: 0, note: "" }));
}

/** Create a draft timesheet for one engagement month of a hired placement. */
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

  // Legacy rules (routes.ts 13605-13678): hired placements only (the
  // employer has paid - bug sheet 23 Oct), never a full-time offer, one sheet
  // for a one-month engagement, and the period clamped to the joining date
  // and contract end.
  if (!isHiredProposal(proposal)) {
    return NextResponse.json({ error: "Timesheets open once the company completes the payment for your offer." }, { status: 400 });
  }
  const offer = parseOffer(proposal.offerDetails, proposal.currency);
  if (offer.fullTime) {
    return NextResponse.json({ error: "Timesheets are not used for full-time offers." }, { status: 400 });
  }

  // Periods follow the engagement's own months from the joining date; with
  // no month given, the earliest started period without a sheet is opened.
  // A one-month engagement therefore has exactly one period by construction.
  const existingSheets = await db
    .select({ periodStart: schema.timesheets.periodStart, periodEnd: schema.timesheets.periodEnd })
    .from(schema.timesheets)
    .where(eq(schema.timesheets.proposalId, proposal.id));
  const taken = existingSheets
    .filter((s) => s.periodStart && s.periodEnd)
    .map((s) => ({ start: isoDay(s.periodStart!), end: isoDay(s.periodEnd!) }));

  const todayIso = todayIst();
  const period = timesheetPeriod(parsed.data.month ?? null, offer.startDate, offer.months, todayIso, taken);
  if ("error" in period) return NextResponse.json({ error: period.error }, { status: 400 });
  const start = new Date(`${period.start}T00:00:00.000Z`);
  const end = new Date(`${period.end}T23:59:59.999Z`);

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

  const initialEntries = generateMonthEntries(period.start, period.end);

  const [sheet] = await db
    .insert(schema.timesheets)
    .values({
      proposalId: proposal.id,
      employerId: proposal.employerId,
      internId: proposal.internId,
      periodStart: start,
      periodEnd: end,
      status: "draft",
      entries: initialEntries,
      internNote: parsed.data.internNote || null,
      submittedAt: null,
    })
    .returning();

  return NextResponse.json({ timesheet: sheet }, { status: 201 });
}