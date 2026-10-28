import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { timezoneForLocation, wallTimeToUtc } from "@/lib/timezones";
import { canEmployerSeeIntern } from "@/lib/employer-pool";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { hasDuplicateSlots, isBlockingInterview, isQuarterHourWall } from "@/lib/employer-interview-rules";
import { shortDateTime } from "@/lib/format";

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().optional(),
  /** Wall-clock times in `timezone` ("2026-11-03T15:30"), not browser-converted.
   *  Exactly three, on the quarter hour (legacy R:11179, sheet row 66). */
  slot1: wall,
  slot2: wall,
  slot3: wall,
  /** Missing: the company's own zone, from its location (bug sheet 7, S2 r3). */
  timezone: z.string().min(1).optional(),
});

const OPEN = ["pending", "scheduled"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Offer three time slots." }, { status: 400 });
  const db = getDb();
  let timezone = parsed.data.timezone;
  if (!timezone) {
    const [employer] = await db
      .select({ country: schema.employers.country, state: schema.employers.state })
      .from(schema.employers)
      .where(eq(schema.employers.id, id))
      .limit(1);
    timezone = timezoneForLocation(employer ?? {});
  }
  const b = { ...parsed.data, timezone };
  if (![b.slot1, b.slot2, b.slot3].every(isQuarterHourWall)) {
    return NextResponse.json({ error: "Slots start on the hour or at :15, :30 or :45." }, { status: 400 });
  }

  let slots: Date[];
  try {
    slots = [b.slot1, b.slot2, b.slot3].map((s) => wallTimeToUtc(s, b.timezone));
  } catch {
    return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
  }
  if (slots.some((s) => s.getTime() < Date.now())) {
    return NextResponse.json({ error: "Slots must be in the future" }, { status: 400 });
  }
  if (hasDuplicateSlots(slots)) {
    return NextResponse.json({ error: "Offer different times - two slots are the same." }, { status: 400 });
  }

  // Only a pool candidate, or one this employer already works with.
  if (!(await canEmployerSeeIntern(db, id, b.internId))) {
    return NextResponse.json({ error: "Unknown candidate" }, { status: 404 });
  }
  let projectName: string | null = null;
  if (b.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, b.projectId), eq(schema.projects.employerId, id)))
      .limit(1);
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });
    projectName = project.projectName;
  }
  // One open meeting per candidate per employer. A meeting whose slots have
  // all passed is stale and no longer holds the candidate (legacy R:11370).
  const openRows = await db
    .select()
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.employerId, id),
        eq(schema.interviews.internId, b.internId),
        inArray(schema.interviews.status, OPEN),
      ),
    );
  const open = openRows.find((iv) => isBlockingInterview(iv));
  if (open) {
    return NextResponse.json({ error: "A meeting with this candidate is already open - finish it first." }, { status: 409 });
  }

  const [interview] = await db
    .insert(schema.interviews)
    .values({
      employerId: id,
      internId: b.internId,
      projectId: b.projectId,
      slot1: slots[0],
      slot2: slots[1],
      slot3: slots[2],
      timezone: b.timezone,
      status: "pending",
    })
    .returning();

  await notify({
    to: { type: "intern", id: b.internId },
    type: "interview_pending",
    title: "Interview invitation",
    message: "A company invited you to an interview. Pick a slot that works for you.",
    data: { interviewId: interview.id },
    email: emails.interviewInvitation({
      internName: await internFirstName(b.internId),
      // The company stays hidden from the intern until it hires them.
      companyName: (await hiredBy(db, id, b.internId)) ? (await employerNames(id)).company : "A company on Findtern",
      project: projectName,
      slots: [b.slot1, b.slot2, b.slot3].map(wallLabel),
      timezone: b.timezone,
    }),
  });
  return NextResponse.json({ interview }, { status: 201 });
}

/** "Tue 3 Nov 2026, 3:30 pm" for a wall-clock "2026-11-03T15:30". */
function wallLabel(wall: string): string {
  const d = new Date(`${wall.slice(0, 16)}:00Z`);
  return shortDateTime(d, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

async function hiredBy(db: ReturnType<typeof getDb>, employerId: string, internId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, internId), hiredProposalSql()))
    .limit(1);
  return Boolean(row);
}
