import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { liveDriveStudents, MEETING_DELAYS, requestMeeting, toView, viewsForStudentsInDrive } from "@/lib/college/meetings";
import { manualMeetingLink } from "@/lib/college/meeting-link";
import { driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";
import { heldElsewhereIds } from "@/lib/employer-pool";

/**
 * One answer for every student the employer can no longer call (an inactive account, one on hold, one held by another
 * company's accepted offer or hire): the same words, so nothing hints at why. The status code is the same too (409), so nothing tells the cases apart.
 */
const STUDENT_UNAVAILABLE = { error: "This student is no longer available.", code: "candidate_unavailable" } as const;

const bodySchema = z.object({
  userId: z.string().min(1),
  inMinutes: z.union([z.literal(0), z.literal(5), z.literal(10)]),
  manualLink: z.string().optional(),
});

/** My call requests in this drive, for the status column (polled). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const loaded = await driveForEmployer((await ctx.params).id, session);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!loaded.access.ok) return NextResponse.json({ error: "No access to this drive" }, { status: 403 });
  const rows = await getDb()
    .select()
    .from(schema.collegeDriveMeetings)
    .where(and(eq(schema.collegeDriveMeetings.driveId, loaded.drive.id), eq(schema.collegeDriveMeetings.employerId, session!.uid), isNotNull(schema.collegeDriveMeetings.meetingLink)))
    .orderBy(desc(schema.collegeDriveMeetings.createdAt));
  // Cancelled only for a student who left the college, not for one the drive's rules stopped listing (R2-02).
  const { live, labels } = await liveDriveStudents(loaded.drive.collegeId, rows.map((r) => r.userId));
  return NextResponse.json({ meetings: viewsForStudentsInDrive(rows, live, labels) }, { headers: { "Cache-Control": "no-store" } });
}

/** Ask a student for a call now, in 5 or in 10 minutes. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const loaded = await driveForEmployer((await ctx.params).id, guard.session);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!loaded.access.ok) return NextResponse.json({ error: "No access to this drive", reason: loaded.access.reason }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !MEETING_DELAYS.includes(parsed.data.inMinutes)) {
    return NextResponse.json({ error: "Pick now, 5 or 10 minutes" }, { status: 400 });
  }
  const pasted = parsed.data.manualLink?.trim();
  const manualLink = pasted ? manualMeetingLink(pasted) : null;
  if (pasted && !manualLink) {
    return NextResponse.json({ error: "Paste a full https:// meeting link, or leave it empty." }, { status: 400 });
  }
  const eligible = (await eligibleStudents(loaded.drive)).some((s) => s.userId === parsed.data.userId);
  if (!eligible) return NextResponse.json({ error: "Student not in this drive" }, { status: 404 });

  // The candidate rules of the full-time offer route and the proposals route: an active intern account, not frozen
  // (on hold), and not held by another company's accepted offer or running hire. Neutral wording: nothing about the other company.
  const db = getDb();
  const [candidate] = await db
    .select({ role: schema.users.role, isActive: schema.users.isActive, frozenAt: schema.users.frozenAt })
    .from(schema.users)
    .where(eq(schema.users.id, parsed.data.userId))
    .limit(1);
  if (!candidate || candidate.role !== "intern") return NextResponse.json(STUDENT_UNAVAILABLE, { status: 404 });
  // A disabled account answers exactly like one on hold or held elsewhere (same status, same message): the status code must not tell them apart (R4-02).
  if (!candidate.isActive || candidate.frozenAt) return NextResponse.json(STUDENT_UNAVAILABLE, { status: 409 });
  if ((await heldElsewhereIds(db, guard.session.uid, [parsed.data.userId])).has(parsed.data.userId)) {
    return NextResponse.json(STUDENT_UNAVAILABLE, { status: 409 });
  }

  const r = await requestMeeting({
    driveId: loaded.drive.id,
    driveTitle: `${loaded.college.name}: ${loaded.drive.title}`,
    employerId: guard.session.uid,
    userId: parsed.data.userId,
    inMinutes: parsed.data.inMinutes,
    manualLink,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ meeting: r.meeting }, { status: 201 });
}

/** Withdraw my own open request (or an accepted call that hasn't started). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const loaded = await driveForEmployer((await ctx.params).id, guard.session);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!loaded.access.ok) return NextResponse.json({ error: "No access to this drive" }, { status: 403 });
  const meetingId = new URL(req.url).searchParams.get("meeting") ?? "";
  const [row] = await getDb()
    .update(schema.collegeDriveMeetings)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(schema.collegeDriveMeetings.id, meetingId),
        eq(schema.collegeDriveMeetings.driveId, loaded.drive.id),
        eq(schema.collegeDriveMeetings.employerId, guard.session.uid),
        inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"]),
      ),
    )
    .returning();
  if (!row) return NextResponse.json({ error: "That call is already closed" }, { status: 409 });
  return NextResponse.json({ meeting: toView(row) });
}
