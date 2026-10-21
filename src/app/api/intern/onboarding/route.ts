import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import {
  bankProblem,
  draftFromRecord,
  emptyDraft,
  formatProblems,
  MAX_SKILLS,
  storedFromDraft,
  validateProfile,
  type OnboardingDraft,
  workModes,
} from "@/lib/onboarding";
import { sameSkills, skillsLocked } from "@/lib/skills-lock";

const qualification = z.object({
  id: z.string().max(80),
  name: z.string().max(160).default(""),
  issuer: z.string().max(160).default(""),
  year: z.string().max(4).default(""),
  credentialUrl: z.string().max(500).default(""),
});

const bodySchema = z.object({
  bio: z.string().optional(),
  linkedinUrl: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  emergencyPhone: z.string().max(20).optional(),
  emergencyName: z.string().max(120).optional(),
  emergencyRelation: z.string().max(40).optional(),
  emergencyCountryCode: z.string().regex(/^\+\d{1,4}$/).optional(),
  secondPocName: z.string().max(120).optional(),
  secondPocRelation: z.string().max(40).optional(),
  secondPocPhone: z.string().max(20).optional(),
  secondPocCountryCode: z.string().regex(/^\+\d{1,4}$/).optional(),
  academics: z
    .object({
      qualificationLevel: z.string().optional(),
      institution: z.string().default(""),
      degree: z.string().default(""),
      branch: z.string().default(""),
      // Optional so an older cached client cannot blank what it never sent.
      startYear: z.string().max(4).optional(),
      yearOfGraduation: z.string().default(""),
      status: z.string().optional(),
      scoreType: z.enum(["cgpa", "percentage"]).optional(),
      cgpa: z.string().default(""),
      professional: z.array(qualification).max(20).optional(),
      certifications: z.array(qualification).max(20).optional(),
    })
    .optional(),
  skills: z.array(z.string()).max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} key skills.`).optional(),
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
  locationTypes: z.array(z.string().max(20)).max(6).optional(),
  preferredLocations: z.array(z.string().max(120)).max(5).optional(),
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
  // Only our own upload endpoint; outside URLs are refused.
  // "" is what a form with no photo (or one restored from the stored avatar
  // before this field existed) sends; it means "no change", never an error.
  photoUrl: z.string().regex(/^(\/api\/intern\/avatar(\?.*)?)?$/).optional(),
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
  /** "Complete & Submit": every step's rules apply, not just format checks. */
  final: z.boolean().optional(),
});

/**
 * A schema issue in words a candidate can act on. Zod's own text ("Invalid
 * string: must match pattern …") was reaching the form verbatim. Messages we
 * wrote ourselves (refinements, the skills cap) pass through; anything else
 * is named by the field it is about.
 */
const FIELD_LABELS: Record<string, string> = {
  photoUrl: "Your profile photo did not save - upload it again.",
  aadhaarNumber: "Check your Aadhaar number - it should be 12 digits.",
  panNumber: "Check your PAN - it should look like ABCDE1234F.",
  emergencyCountryCode: "Pick the country code for your emergency contact.",
  secondPocCountryCode: "Pick the country code for your second contact.",
  preferredLocations: "Pick at most 5 cities.",
  skills: "Pick at most 7 key skills.",
  academics: "Some academic details are in the wrong format - check the Academics step.",
  experiences: "Some experience details are in the wrong format - check the Experience step.",
  languages: "Some language details are in the wrong format - check the Languages step.",
};

function friendlyIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "Some details could not be saved. Check the form and try again.";
  if (issue.code === "custom") return issue.message;
  const field = String(issue.path[0] ?? "");
  if (field === "skills" && issue.code === "too_big") return issue.message;
  return FIELD_LABELS[field] ?? "Some details could not be saved. Check the form and try again.";
}

/**
 * Hiding is capped at 30 days (the guarantee only runs while employers can
 * see you). The clock starts the first time the switch goes off and is kept
 * across repeat "off" saves; switching back on clears it. The scheduler
 * (`schedulers.ts`, profile-hide job) reminds and then turns it back on.
 */
function openToWorkPatch(next: boolean, previous: Record<string, unknown>) {
  if (next) return { openToWork: true, hiddenAt: null, hideReminderSentAt: null };
  const alreadyHidden = previous.openToWork === false && typeof previous.hiddenAt === "string";
  return {
    openToWork: false,
    hiddenAt: alreadyHidden ? previous.hiddenAt : new Date().toISOString(),
    ...(alreadyHidden ? {} : { hideReminderSentAt: null }),
  };
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: friendlyIssue(parsed.error.issues[0]) }, { status: 400 });
  }

  // Impossible values are refused even on a draft save; completeness is not.
  const format = formatProblems(parsed.data);
  if (format) return NextResponse.json({ error: format }, { status: 400 });
  // Bank details are saved only in full - from Settings, or from the About Me
  // step (which leaves them out of a draft save until they are complete).
  if (parsed.data.bank) {
    const bank = bankProblem(parsed.data.bank);
    if (bank) return NextResponse.json({ error: bank }, { status: 400 });
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

  // Skills freeze once rated or once an AI interview is queued (legacy rule).
  if (parsed.data.skills !== undefined && existing) {
    const current = draftFromRecord(existing).skills ?? [];
    if (!sameSkills(current, parsed.data.skills) && (await skillsLocked(db, session.uid, existing.extraData))) {
      return NextResponse.json(
        { error: "Your skills are locked - your AI interview is based on them.", step: 3 },
        { status: 409 },
      );
    }
  }

  if (parsed.data.final) {
    const [account] = await db
      .select({ countryCode: schema.users.countryCode, phoneNumber: schema.users.phoneNumber })
      .from(schema.users)
      .where(eq(schema.users.id, session.uid))
      .limit(1);
    const [doc] = await db
      .select({
        pan: schema.internDocuments.panImageName,
        aadhaar: schema.internDocuments.aadhaarImageName,
        photo: schema.internDocuments.profilePhotoName,
      })
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session.uid))
      .limit(1);
    const saved = existing ? draftFromRecord(existing) : {};
    const base = emptyDraft();
    const full: OnboardingDraft = {
      ...base,
      ...saved,
      ...(parsed.data as Partial<OnboardingDraft>),
      academics: { ...base.academics, ...saved.academics, ...parsed.data.academics },
    };
    const failed = validateProfile(full, {
      hasPanImage: Boolean(doc?.pan),
      hasAadhaarImage: Boolean(doc?.aadhaar),
      hasPhoto: Boolean(doc?.photo),
      ownPhone: account?.phoneNumber ? { countryCode: account.countryCode || "+91", phoneNumber: account.phoneNumber } : null,
    });
    if (failed) {
      return NextResponse.json(
        { error: Object.values(failed.errors)[0], step: failed.step, fields: failed.errors },
        { status: 400 },
      );
    }
  }

  const previousExtra = (existing?.extraData ?? {}) as Record<string, unknown>;
  const stored = storedFromDraft(parsed.data, existing ?? null);
  const extraData = {
    ...previousExtra,
    ...stored.extraPatch,
    // First acceptance is the one that counts; it is never cleared by a later save.
    ...(parsed.data.ndaAccepted && !previousExtra.ndaAcceptedAt
      ? { ndaAcceptedAt: new Date().toISOString() }
      : {}),
    // Emergency contact: the legacy keys, plus name/relation (admin already reads emergencyName).
    ...(parsed.data.emergencyPhone !== undefined ? { emergencyPhone: parsed.data.emergencyPhone.replace(/\D/g, "") || null } : {}),
    ...(parsed.data.emergencyCountryCode !== undefined ? { emergencyCountryCode: parsed.data.emergencyCountryCode } : {}),
    ...(parsed.data.emergencyName !== undefined ? { emergencyName: parsed.data.emergencyName.trim() || null } : {}),
    ...(parsed.data.emergencyRelation !== undefined ? { emergencyRelation: parsed.data.emergencyRelation.trim() || null } : {}),
    ...(parsed.data.secondPocName !== undefined ? { secondPocName: parsed.data.secondPocName.trim() || null } : {}),
    ...(parsed.data.secondPocRelation !== undefined ? { secondPocRelation: parsed.data.secondPocRelation.trim() || null } : {}),
    ...(parsed.data.secondPocPhone !== undefined ? { secondPocPhone: parsed.data.secondPocPhone.replace(/\D/g, "") || null } : {}),
    ...(parsed.data.secondPocCountryCode !== undefined ? { secondPocCountryCode: parsed.data.secondPocCountryCode } : {}),
    ...(parsed.data.openToWork !== undefined ? openToWorkPatch(parsed.data.openToWork, previousExtra) : {}),
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
    locationTypes: parsed.data.locationTypes ? workModes(parsed.data.locationTypes) : existing?.locationTypes ?? [],
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
