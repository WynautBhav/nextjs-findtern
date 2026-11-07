import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { timezoneForLocation, wallTimeToUtc } from "@/lib/timezones";
import { canEmployerSeeIntern } from "@/lib/employer-pool";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { hasDuplicateSlots, hasSlotTooFarAhead, isBlockingInterview, isQuarterHourWall } from "@/lib/employer-interview-rules";
import { formatIst } from "@/lib/format";
import { isProjectOpen } from "@/lib/project-locations";

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
  if (hasSlotTooFarAhead(slots)) {
    return NextResponse.json({ error: "Pick slots within the next year." }, { status: 400 });
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
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        status: schema.projects.status,
        takenDownAt: schema.projects.takenDownAt,
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, b.projectId), eq(schema.projects.employerId, id)))
      .limit(1);
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });
    if (!isProjectOpen(project.status, project.takenDownAt)) {
      return NextResponse.json({ error: "This project is closed or was taken down. Pick another project." }, { status: 409 });
    }
    projectName = project.projectName;
  }
  // One open meeting per candidate per employer. A meeting whose slots have
  // all passed is stale and no longer holds the candidate (legacy R:11370).
  // Checked and inserted under one lock, so two requests at once can't both
  // book (a double click gave three pending interviews).
  const interview = await withLock(`interview:${id}:${b.internId}`, async (tx) => {
    const openRows = await tx
      .select()
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.employerId, id),
          eq(schema.interviews.internId, b.internId),
          inArray(schema.interviews.status, OPEN),
        ),
      );
    if (openRows.some((iv) => isBlockingInterview(iv))) return null;
    const [created] = await tx
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
    return created;
  });
  if (!interview) {
    return NextResponse.json({ error: "A meeting with this candidate is already open - finish it first." }, { status: 409 });
  }

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
      // The intern reads every time in IST, like the interviews page (INW-09).
      slots: slots.map((s) => formatIst(s, { year: true })),
    }),
  });
  return NextResponse.json({ interview }, { status: 201 });
}

async function hiredBy(db: ReturnType<typeof getDb>, employerId: string, internId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.employerId, employerId), eq(schema.proposals.internId, internId), hiredProposalSql()))
    .limit(1);
  return Boolean(row);
}
