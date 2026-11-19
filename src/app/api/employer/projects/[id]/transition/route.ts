import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { assertProjectActionable } from "@/lib/projects/takedown-guard-server";
import { isTransitionConflict, planTransition } from "@/lib/projects/transition";
import { revalidatePublicRoles } from "@/lib/projects/revalidate-public";
import { perfScope } from "@/lib/perf/timing";

const bodySchema = z.object({ to: z.string().min(1), reason: z.string().max(1000).optional() });

/** Employer lifecycle move: submit, withdraw, pause, resume, close, reopen a rejected draft. */
async function handle(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  // The takedown check reads the same project row; it runs beside the load (one round trip, not two) and is only
  // looked at once the project is found and owned, so the 404 and 403 still win.
  const [[project], td] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1),
    assertProjectActionable(id, guard.session.uid),
  ]);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!td.ok) return td.response;

  const plan = planTransition({
    project: { ...project, skills: (project.skills as string[] | null) ?? [] },
    to: parsed.data.to,
    actorRole: "employer",
    reason: parsed.data.reason,
  });
  if (!plan.ok) return NextResponse.json({ error: plan.error, missing: plan.missing }, { status: plan.status });

  // Conditional on the status we read: two concurrent moves cannot both win.
  const updated = await db
    .update(schema.projects)
    .set({ ...plan.set, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, id), project.status == null ? isNull(schema.projects.status) : eq(schema.projects.status, project.status)))
    .returning({ id: schema.projects.id });
  if (isTransitionConflict(updated.length)) {
    return NextResponse.json({ error: "This project just changed. Reload and try again." }, { status: 409 });
  }
  revalidatePublicRoles();
  return NextResponse.json({ ok: true, status: plan.to });
}

export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return perfScope("api/employer/projects/transition", () => handle(req, ctx));
}
