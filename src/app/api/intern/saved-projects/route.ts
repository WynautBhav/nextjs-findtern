import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { projectById } from "@/lib/intern-data";

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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pick a role." }, { status: 400 });

  // projectById answers null for paused, closed, taken-down and test listings.
  const role = await projectById(parsed.data.projectId, { strict: true });
  if (!role) return NextResponse.json({ error: "That role isn't open any more." }, { status: 404 });

  await getDb()
    .insert(schema.internSavedProjects)
    .values({ internId: guard.session.uid, projectId: role.id })
    .onConflictDoNothing();
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pick a role." }, { status: 400 });

  const s = schema.internSavedProjects;
  await getDb().delete(s).where(and(eq(s.internId, guard.session.uid), eq(s.projectId, parsed.data.projectId)));
  return NextResponse.json({ saved: false });
}
