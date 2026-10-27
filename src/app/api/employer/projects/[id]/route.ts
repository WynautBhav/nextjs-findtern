import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { projectLocationsError } from "@/lib/project-locations";

const bodySchema = z.object({
  projectName: z.string().min(2).optional(),
  // Sheet row 59: at most 7 skills on a project.
  skills: z.array(z.string().trim().min(1)).min(1, "Add at least one skill.").max(7, "A project can have at most 7 skills.").optional(),
  scopeOfWork: z.string().optional(),
  fullTimeOffer: z.boolean().optional(),
  locationType: z.enum(["remote", "hybrid", "onsite"]).optional(),
  preferredLocations: z.array(z.string()).optional(),
  pincode: z.string().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  timezone: z.string().optional(),
  // "closed" is what this build writes; "inactive" is the legacy spelling.
  status: z.enum(["active", "closed", "inactive"]).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const db = getDb();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // At most three preferred locations, except that a project saved under the
  // old limit of five may resave the places it already has.
  if (parsed.data.preferredLocations) {
    const locationProblem = projectLocationsError(parsed.data.preferredLocations, project.preferredLocations ?? []);
    if (locationProblem) return NextResponse.json({ error: locationProblem }, { status: 400 });
  }

  // Project names are unique per employer, ignoring case (legacy R:10740).
  if (parsed.data.projectName) {
    const [clash] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.employerId, project.employerId),
          ne(schema.projects.id, id),
          sql`lower(trim(${schema.projects.projectName})) = ${parsed.data.projectName.trim().toLowerCase()}`,
        ),
      )
      .limit(1);
    if (clash) return NextResponse.json({ error: "You already have a project with that name." }, { status: 409 });
  }
  // At least one project stays active (legacy R:10757): the candidate pool
  // and shortlist need one to work against.
  if (parsed.data.status && parsed.data.status !== "active" && (project.status ?? "active") === "active") {
    const [otherActive] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.employerId, project.employerId),
          ne(schema.projects.id, id),
          sql`coalesce(${schema.projects.status}, 'active') = 'active'`,
        ),
      )
      .limit(1);
    if (!otherActive) {
      return NextResponse.json({ error: "Keep at least one project active - open another before closing this one." }, { status: 409 });
    }
  }

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

  // Legacy rule (routes.ts:10810-10846): any offer blocks, but a meeting only
  // while it is open or once a time was picked. Cancelled or expired invites
  // that never got a slot don't keep a project alive.
  const [[interview], [proposal]] = await Promise.all([
    db
      .select({ id: schema.interviews.id })
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.projectId, id),
          or(
            inArray(schema.interviews.status, ["pending", "scheduled", "waiting"]),
            isNotNull(schema.interviews.selectedSlot),
          ),
        ),
      )
      .limit(1),
    db.select({ id: schema.proposals.id }).from(schema.proposals).where(eq(schema.proposals.projectId, id)).limit(1),
  ]);
  if (interview || proposal) {
    return NextResponse.json(
      {
        error: proposal
          ? "This project has offers linked to it, so it can be closed but not deleted."
          : "This project has meetings linked to it, so it can be closed but not deleted.",
      },
      { status: 409 },
    );
  }
  await db.delete(schema.employerCartItems).where(eq(schema.employerCartItems.projectId, id));
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
}
