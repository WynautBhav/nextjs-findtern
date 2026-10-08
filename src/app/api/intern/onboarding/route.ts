import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  bio: z.string().optional(),
  linkedinUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  emergencyPhone: z.string().optional(),
  academics: z.record(z.string(), z.unknown()).optional(),
  skills: z.array(z.string()).optional(),
  skillsWithRatings: z.array(z.object({ name: z.string(), rating: z.string() })).optional(),
  experiences: z.array(z.record(z.string(), z.unknown())).optional(),
  languages: z.array(z.record(z.string(), z.unknown())).optional(),
  extracurriculars: z.array(z.record(z.string(), z.unknown())).optional(),
  locationTypes: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
  hasLaptop: z.boolean().nullable().optional(),
  bank: z.record(z.string(), z.unknown()).optional(),
  photoUrl: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  previewSummary: z.string().optional(),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);

  const extraData = {
    ...(existing?.extraData as Record<string, unknown> | undefined),
    ...(parsed.data.academics ? { academics: parsed.data.academics } : {}),
    ...(parsed.data.bank ? { bankDetails: parsed.data.bank } : {}),
    ...(parsed.data.emergencyPhone ? { emergencyPhone: parsed.data.emergencyPhone } : {}),
    ...(parsed.data.experiences ? { experiences: parsed.data.experiences } : {}),
    ...(parsed.data.languages ? { languages: parsed.data.languages } : {}),
    ...(parsed.data.extracurriculars ? { extracurriculars: parsed.data.extracurriculars } : {}),
    ...(parsed.data.skillsWithRatings ? { skillsWithRatings: parsed.data.skillsWithRatings } : {}),
    ...(parsed.data.photoUrl ? { photoUrl: parsed.data.photoUrl } : {}),
  };

  const values = {
    userId: session.uid,
    bio: parsed.data.bio ?? existing?.bio ?? null,
    linkedinUrl: parsed.data.linkedinUrl ?? existing?.linkedinUrl ?? null,
    city: parsed.data.city ?? existing?.city ?? null,
    state: parsed.data.state ?? existing?.state ?? null,
    pinCode: parsed.data.pinCode ?? existing?.pinCode ?? null,
    aadhaarNumber: parsed.data.aadhaarNumber ?? existing?.aadhaarNumber ?? null,
    experienceJson: parsed.data.experiences ?? existing?.experienceJson ?? [],
    previewSummary: parsed.data.previewSummary ?? existing?.previewSummary ?? null,
    skills: parsed.data.skills ?? existing?.skills ?? [],
    locationTypes: parsed.data.locationTypes ?? existing?.locationTypes ?? [],
    preferredLocations: parsed.data.preferredLocations ?? existing?.preferredLocations ?? [],
    hasLaptop: parsed.data.hasLaptop ?? existing?.hasLaptop ?? null,
    extraData,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(schema.internOnboarding).set(values).where(eq(schema.internOnboarding.id, existing.id));
  } else {
    await db.insert(schema.internOnboarding).values(values);
  }
  return NextResponse.json({ ok: true });
}
