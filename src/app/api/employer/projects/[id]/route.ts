import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  projectName: z.string().min(2).optional(),
  skills: z.array(z.string()).min(1).optional(),
  scopeOfWork: z.string().optional(),
  fullTimeOffer: z.boolean().optional(),
  locationType: z.string().optional(),
  preferredLocations: z.array(z.string()).optional(),
  pincode: z.string().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  timezone: z.string().optional(),
  status: z.string().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.update(schema.projects).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
}

/** Delete a project that never got as far as an interview or a proposal. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [[interview], [proposal]] = await Promise.all([
    db.select({ id: schema.interviews.id }).from(schema.interviews).where(eq(schema.interviews.projectId, id)).limit(1),
    db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.projectId, id)).limit(1),
  ]);
  if (interview || proposal) {
    return NextResponse.json(
      { error: "This project has interviews or proposals, so it can be closed but not deleted." },
      { status: 409 },
    );
  }
  await db.delete(schema.employerCartItems).where(eq(schema.employerCartItems.projectId, id));
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
}
