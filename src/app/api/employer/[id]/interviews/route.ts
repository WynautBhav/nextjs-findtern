import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { wallTimeToUtc } from "@/lib/timezones";

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
const bodySchema = z.object({
  internId: z.string().min(1),
  projectId: z.string().optional(),
  /** Wall-clock times in `timezone` ("2026-11-03T15:30"), not browser-converted. */
  slot1: wall,
  slot2: wall.optional(),
  slot3: wall.optional(),
  timezone: z.string().min(1).default("Asia/Kolkata"),
});

const OPEN = ["pending", "scheduled"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one slot" }, { status: 400 });
  const b = parsed.data;

  let slots: Date[];
  try {
    slots = [b.slot1, b.slot2, b.slot3].filter((s): s is string => Boolean(s)).map((s) => wallTimeToUtc(s, b.timezone));
  } catch {
    return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
  }
  if (slots.some((s) => s.getTime() < Date.now())) {
    return NextResponse.json({ error: "Slots must be in the future" }, { status: 400 });
  }

  const db = getDb();
  if (b.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, b.projectId), eq(schema.projects.employerId, id)))
      .limit(1);
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 404 });
  }
  // One open meeting per candidate per employer.
  const [open] = await db
    .select({ id: schema.interviews.id })
    .from(schema.interviews)
    .where(
      and(
        eq(schema.interviews.employerId, id),
        eq(schema.interviews.internId, b.internId),
        inArray(schema.interviews.status, OPEN),
      ),
    )
    .limit(1);
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
      slot2: slots[1] ?? null,
      slot3: slots[2] ?? null,
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
      companyName: (await employerNames(id)).company,
    }),
  });
  return NextResponse.json({ interview }, { status: 201 });
}
