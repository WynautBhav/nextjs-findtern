import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { projectLocationsError } from "@/lib/project-locations";

const bodySchema = z.object({
  projectName: z.string().min(2),
  // Sheet row 59: at most 7 skills on a project.
  skills: z.array(z.string().trim().min(1)).min(1, "Add at least one skill.").max(7, "A project can have at most 7 skills."),
  scopeOfWork: z.string().optional(),
  fullTimeOffer: z.boolean().optional(),
  locationType: z.enum(["remote", "hybrid", "onsite"]).optional(),
  preferredLocations: z.array(z.string()).optional(),
  pincode: z.string().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  timezone: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  // A new project has no legacy list to keep: at most three places.
  const locationProblem = projectLocationsError(parsed.data.preferredLocations ?? []);
  if (locationProblem) return NextResponse.json({ error: locationProblem }, { status: 400 });

  const db = getDb();
  // Project names are unique per employer, ignoring case (legacy R:10682).
  const [clash] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.employerId, id),
        sql`lower(trim(${schema.projects.projectName})) = ${parsed.data.projectName.trim().toLowerCase()}`,
      ),
    )
    .limit(1);
  if (clash) return NextResponse.json({ error: "You already have a project with that name." }, { status: 409 });

  const [project] = await db
    .insert(schema.projects)
    .values({ employerId: id, ...parsed.data })
    .returning();
  // The first project completes onboarding, as in legacy.
  await db.update(schema.employers).set({ onboardingCompleted: true }).where(eq(schema.employers.id, id));
  return NextResponse.json({ project }, { status: 201 });
}
