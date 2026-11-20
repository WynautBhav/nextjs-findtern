import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProjectActionable } from "@/lib/projects/takedown-guard-server";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { isKnownTimezone, projectZone, timezoneForLocation, wallTimeToUtc } from "@/lib/timezones";
import { canEmployerSeeIntern, heldElsewhereIds } from "@/lib/employer-pool";
import { CANDIDATE_UNAVAILABLE } from "@/lib/candidate-hold";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { isQuarterHourWall } from "@/lib/employer-interview-rules";
import { createMeeting } from "@/lib/meetings/service";
import { formatIst } from "@/lib/format";
import { isProjectOpen } from "@/lib/project-locations";

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().optional(),
  /** Wall-clock times in `timezone` ("2026-11-03T15:30"), not browser-converted.
   *  Exactly three, distinct, on the quarter hour: the candidate chooses from them (legacy R:11175). */
  slot1: wall,
  slot2: wall,
  slot3: wall,
  /** Missing: the company's own zone, from its location (bug sheet 7, S2 r3). */
  timezone: z.string().min(1).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Offer exactly three times for the candidate to choose from." }, { status: 400 });
  // A made-up zone is refused even when the project's own zone would override it (B-43).
  if (parsed.data.timezone !== undefined && !isKnownTimezone(parsed.data.timezone)) {
    return NextResponse.json({ error: "Unknown timezone. Use a region such as Asia/Kolkata." }, { status: 400 });
  }
  if (parsed.data.projectId) {
    const td = await assertProjectActionable(parsed.data.projectId, id);
    if (!td.ok) return td.response;
  }
  const db = getDb();
  // The meeting runs on the PROJECT's clock (feedback sheet 2, row 7): the project's zone is authoritative, so
  // what the employer types and what the intern reads cannot differ. A project with no zone (or no project)
  // takes the zone sent, then the company's own.
  let projectTz: string | null = null;
  if (parsed.data.projectId) {
    const [p] = await db
      .select({ timezone: schema.projects.timezone })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, parsed.data.projectId), eq(schema.projects.employerId, id)))
      .limit(1);
    projectTz = p?.timezone ?? null;
  }
  let companyTz: string | null = null;
  if (!projectTz && !parsed.data.timezone) {
    const [employer] = await db
      .select({ country: schema.employers.country, state: schema.employers.state })
      .from(schema.employers)
      .where(eq(schema.employers.id, id))
      .limit(1);
    companyTz = timezoneForLocation(employer ?? {});
  }
  const timezone = projectTz ? projectZone(projectTz, parsed.data.timezone, companyTz) : (parsed.data.timezone ?? companyTz ?? projectZone(null));
  const b = { ...parsed.data, timezone };
  const walls = [b.slot1, b.slot2, b.slot3];
  if (!walls.every(isQuarterHourWall)) {
    return NextResponse.json({ error: "Slots start on the hour or at :15, :30 or :45." }, { status: 400 });
  }

  let slots: Date[];
  try {
    slots = walls.map((s) => wallTimeToUtc(s, b.timezone));
  } catch {
    return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
  }

  // One offer at a time: no meeting with a candidate another company holds (neutral answer, nothing about who).
  if ((await heldElsewhereIds(db, id, [b.internId])).has(b.internId)) {
    return NextResponse.json(CANDIDATE_UNAVAILABLE, { status: 409 });
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
      return NextResponse.json({ error: "This project is not open (closed, paused, draft or taken down). Pick another." }, { status: 409 });
    }
    projectName = project.projectName;
  }
  // One open meeting per candidate per employer. A meeting whose slots have
  // all passed is stale and no longer holds the candidate (legacy R:11370).
  // Checked and inserted under one lock, so two requests at once can't both
  // book (a double click gave three pending interviews).
  const made = await createMeeting(db, { employerId: id, internId: b.internId, projectId: b.projectId ?? null, slots, timezone: b.timezone });
  if (!made.ok) return NextResponse.json({ error: made.error, code: made.code }, { status: made.status });
  const interview = made.interview;

  await notify({
    to: { type: "intern", id: b.internId },
    type: "interview_pending",
    title: "Choose a time",
    message: "A company offered you 3 times for an interview. Choose one that works for you.",
    data: { interviewId: interview.id },
    email: emails.interviewInvitation({
      internName: await internFirstName(b.internId),
      // The company stays hidden from the intern until it hires them.
      companyName: (await hiredBy(db, id, b.internId)) ? (await employerNames(id)).company : "A company on Findtern",
      project: projectName,
      // The invitation is the intern's, so every time is India time, labelled (the employer typed them in b.timezone).
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
