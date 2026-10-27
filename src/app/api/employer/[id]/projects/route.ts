import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { scopeValue } from "@/lib/db/schema";
import { STATES } from "@/lib/data/districts";
import { requireMutation } from "@/lib/guards-mutation";
import {
  MAX_PROJECT_SKILLS,
  projectLocationsError,
  projectPlaceError,
  projectSkillsError,
} from "@/lib/project-locations";

const bodySchema = z.object({
  projectName: z.string().trim().min(2, "Project name must be at least 2 characters."),
  // Legacy: 4 to 7 skills (EMH-13; bug sheet 7 S1 r80).
  skills: z
    .array(z.string().trim().min(1))
    .max(MAX_PROJECT_SKILLS, `A project can have at most ${MAX_PROJECT_SKILLS} skills.`),
  // Both must be picked; nothing is pre-selected (EMH-47).
  scopeOfWork: z.string({ error: "Pick a scope of work." }).trim().min(1, "Pick a scope of work."),
  fullTimeOffer: z.boolean().optional(),
  locationType: z.enum(["remote", "hybrid", "onsite"], { error: "Pick a work mode." }),
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
  const d = parsed.data;

  const skillsProblem = projectSkillsError(d.skills);
  if (skillsProblem) return NextResponse.json({ error: skillsProblem }, { status: 400 });
  // Stored under the legacy key (DB-09); "not sure" or free text is refused.
  const scope = scopeValue(d.scopeOfWork);
  if (!scope) return NextResponse.json({ error: "Pick a scope of work." }, { status: 400 });
  // On-site and hybrid need an Indian city and state (EMH-14, EMH-48).
  const placeProblem = projectPlaceError(d, STATES);
  if (placeProblem) return NextResponse.json({ error: placeProblem }, { status: 400 });
  // A new project has no legacy list to keep: at most three places.
  const locationProblem = projectLocationsError(d.preferredLocations ?? []);
  if (locationProblem) return NextResponse.json({ error: locationProblem }, { status: 400 });

  const db = getDb();
  // Project names are unique per employer, ignoring case (legacy R:10682).
  const [clash] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.employerId, id),
        sql`lower(trim(${schema.projects.projectName})) = ${d.projectName.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (clash) return NextResponse.json({ error: "You already have a project with that name." }, { status: 409 });

  const remote = d.locationType === "remote";
  const [project] = await db
    .insert(schema.projects)
    .values({
      employerId: id,
      ...d,
      skills: d.skills.filter(Boolean),
      scopeOfWork: scope,
      // A remote role has no place (legacy stored none).
      city: remote ? null : d.city?.trim() || null,
      state: remote ? null : d.state?.trim() || null,
      preferredLocations: remote ? [] : (d.preferredLocations ?? []),
      status: "active",
    })
    .returning();
  // The first project completes onboarding, as in legacy.
  await db.update(schema.employers).set({ onboardingCompleted: true }).where(eq(schema.employers.id, id));
  return NextResponse.json({ project }, { status: 201 });
}
