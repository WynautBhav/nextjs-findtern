import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { driveForEmployer, eligibleStudents } from "@/lib/college/scope";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({ userId: z.string().min(1), on: z.boolean() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const loaded = await driveForEmployer((await ctx.params).id, guard.session);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!loaded.access.ok) return NextResponse.json({ error: "No access to this drive", reason: loaded.access.reason }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const eligible = (await eligibleStudents(loaded.drive)).some((s) => s.userId === parsed.data.userId);
  if (!eligible) return NextResponse.json({ error: "Student not in this drive" }, { status: 404 });

  const db = getDb();
  const key = and(
    eq(schema.collegeDriveShortlist.driveId, loaded.drive.id),
    eq(schema.collegeDriveShortlist.employerId, guard.session.uid),
    eq(schema.collegeDriveShortlist.userId, parsed.data.userId),
  );
  if (parsed.data.on) {
    await db
      .insert(schema.collegeDriveShortlist)
      .values({ driveId: loaded.drive.id, employerId: guard.session.uid, userId: parsed.data.userId })
      .onConflictDoNothing();
  } else {
    await db.delete(schema.collegeDriveShortlist).where(key);
  }
  return NextResponse.json({ ok: true });
}
