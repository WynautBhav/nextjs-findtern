import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { storedFromDraft } from "@/lib/onboarding";

const bodySchema = z.object({
  bio: z.string().optional(),
  linkedinUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  emergencyPhone: z.string().optional(),
  academics: z
    .object({
      qualificationLevel: z.string().optional(),
      institution: z.string().default(""),
      degree: z.string().default(""),
      branch: z.string().default(""),
      yearOfGraduation: z.string().default(""),
      status: z.string().optional(),
      cgpa: z.string().default(""),
    })
    .optional(),
  skills: z.array(z.string()).max(20).optional(),
  skillsWithRatings: z
    .array(z.object({ name: z.string(), rating: z.enum(["Beginner", "Intermediate", "Advanced"]) }))
    .max(20)
    .optional(),
  experiences: z
    .array(
      z.object({
        id: z.string(),
        type: z.string().default("Internship"),
        company: z.string().default(""),
        role: z.string().default(""),
        from: z.string().default(""),
        to: z.string().default(""),
        current: z.boolean().default(false),
        description: z.string().default(""),
      }),
    )
    .max(20)
    .optional(),
  languages: z
    .array(
      z.object({
        id: z.string(),
        language: z.string(),
        level: z.enum(["Native", "Professional", "Conversational", "Basic"]),
        read: z.boolean().optional(),
        write: z.boolean().optional(),
        speak: z.boolean().optional(),
      }),
    )
    .max(20)
    .optional(),
  extracurriculars: z
    .array(
      z.object({
        id: z.string(),
        activity: z.string(),
        level: z.enum(["Beginner", "Intermediate", "Advanced"]),
        category: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
  locationTypes: z.array(z.string()).optional(),
  preferredLocations: z.array(z.string()).optional(),
  hasLaptop: z.boolean().nullable().optional(),
  openToWork: z.boolean().optional(),
  bank: z
    .object({
      accountHolderName: z.string().default(""),
      bankName: z.string().default(""),
      accountNumber: z.string().default(""),
      ifscCode: z.string().default(""),
      upiId: z.string().default(""),
    })
    .optional(),
  // Uploaded files only; a browser blob: URL is meaningless to anyone else.
  photoUrl: z.string().regex(/^(https?:\/\/|\/api\/)/).optional(),
  aadhaarNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^[2-9]\d{11}$/.test(v), "Aadhaar must be 12 digits")
    .optional(),
  panNumber: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "PAN must look like ABCDE1234F")
    .optional(),
  previewSummary: z.string().optional(),
  ndaAccepted: z.boolean().optional(),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  // One account per identity document (legacy rule).
  for (const [col, value, label] of [
    [schema.internOnboarding.aadhaarNumber, parsed.data.aadhaarNumber, "Aadhaar"],
    [schema.internOnboarding.panNumber, parsed.data.panNumber, "PAN"],
  ] as const) {
    if (!value) continue;
    const [clash] = await db
      .select({ id: schema.internOnboarding.id })
      .from(schema.internOnboarding)
      .where(and(eq(col, value), ne(schema.internOnboarding.userId, session.uid)))
      .limit(1);
    if (clash) return NextResponse.json({ error: `This ${label} number is already linked to another account.` }, { status: 409 });
  }
  const [existing] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);

  const previousExtra = (existing?.extraData ?? {}) as Record<string, unknown>;
  const stored = storedFromDraft(parsed.data, existing ?? null);
  const extraData = {
    ...previousExtra,
    ...stored.extraPatch,
    // First acceptance is the one that counts; it is never cleared by a later save.
    ...(parsed.data.ndaAccepted && !previousExtra.ndaAcceptedAt
      ? { ndaAcceptedAt: new Date().toISOString() }
      : {}),
    ...(parsed.data.emergencyPhone ? { emergencyPhone: parsed.data.emergencyPhone } : {}),
    ...(parsed.data.openToWork !== undefined ? { openToWork: parsed.data.openToWork } : {}),
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
    panNumber: parsed.data.panNumber ?? existing?.panNumber ?? null,
    experienceJson: stored.experienceJson ?? existing?.experienceJson ?? [],
    previewSummary: parsed.data.previewSummary ?? existing?.previewSummary ?? null,
    skills: stored.skills ?? existing?.skills ?? [],
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
