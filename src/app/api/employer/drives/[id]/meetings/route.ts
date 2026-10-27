import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { MEETING_DELAYS, requestMeeting, toView } from "@/lib/college/meetings";
import { driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({
  userId: z.string().min(1),
  inMinutes: z.union([z.literal(0), z.literal(5), z.literal(10)]),
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
    .where(and(eq(schema.collegeDriveMeetings.driveId, loaded.drive.id), eq(schema.collegeDriveMeetings.employerId, session!.uid)))
    .orderBy(desc(schema.collegeDriveMeetings.createdAt));
  return NextResponse.json({ meetings: rows.map(toView) }, { headers: { "Cache-Control": "no-store" } });
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
  const eligible = (await eligibleStudents(loaded.drive)).some((s) => s.userId === parsed.data.userId);
  if (!eligible) return NextResponse.json({ error: "Student not in this drive" }, { status: 404 });

  const r = await requestMeeting({
    driveId: loaded.drive.id,
    driveTitle: `${loaded.college.name}: ${loaded.drive.title}`,
    employerId: guard.session.uid,
    userId: parsed.data.userId,
    inMinutes: parsed.data.inMinutes,
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
