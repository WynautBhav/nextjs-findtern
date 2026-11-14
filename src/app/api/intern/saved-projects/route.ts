import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { loadInternData, projectById } from "@/lib/intern-data";
import { rolesGate } from "@/app/intern/opportunities/_gate";
import { internLockResponse } from "@/lib/intern-unlock";

/** Saving raises a student in that employer's matches, so it is a short list, not every listing. */
const MAX_SAVED_ROLES = 10;

const bodySchema = z.object({ projectId: z.string({ error: "Pick a role." }).trim().min(1, "Pick a role.").max(64, "Pick a role.") });

/**
 * A student saves a role (OA3). There is no apply button: saving only raises
 * them in that employer's matches for the project. It is free and never
 * touches the Findtern Score. Only a live listing can be saved; removing a
 * save always works.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pick a role." }, { status: 400 });

  // projectById answers null for paused, closed, taken-down and test listings.
  const role = await projectById(parsed.data.projectId, { strict: true });
  if (!role) return NextResponse.json({ error: "That role isn't open any more." }, { status: 404 });
  // The same gate as /intern/opportunities: a student who can't see roles can't save one either.
  const gate = await rolesGate(guard.session.uid, await loadInternData(guard.session.uid));
  if (!gate.unlocked) return NextResponse.json({ error: "Open roles unlock once your profile is complete and activated." }, { status: 403 });

  const s = schema.internSavedProjects;
  const db = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s).where(eq(s.internId, guard.session.uid));
  // shortcut: count-then-insert lets two parallel saves reach MAX+1; harmless for a ranking hint.
  if (n >= MAX_SAVED_ROLES) {
    const [already] = await db.select({ id: s.projectId }).from(s).where(and(eq(s.internId, guard.session.uid), eq(s.projectId, role.id))).limit(1);
    if (!already) return NextResponse.json({ error: `You can save up to ${MAX_SAVED_ROLES} roles. Remove one first.` }, { status: 409 });
  }
  await db.insert(s).values({ internId: guard.session.uid, projectId: role.id }).onConflictDoNothing();
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const locked = await internLockResponse(guard.session);
  if (locked) return locked;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pick a role." }, { status: 400 });

  const s = schema.internSavedProjects;
  await getDb().delete(s).where(and(eq(s.internId, guard.session.uid), eq(s.projectId, parsed.data.projectId)));
  return NextResponse.json({ saved: false });
}
