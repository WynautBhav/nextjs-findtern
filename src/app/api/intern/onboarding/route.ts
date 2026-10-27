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
  isOnboarded,
  MAX_CERTIFICATE_UPLOADS,
  MAX_EXTRACURRICULARS,
  MAX_MARKSHEETS,
  MAX_SKILLS,
  skillsToStore,
  storedFileNames,
  storedFromDraft,
  validateProfile,
  type OnboardingDraft,
  workModes,
} from "@/lib/onboarding";
import { contactPhoneTaken, employerHasPhone } from "@/lib/onboarding-phone";
import { sameRatedSkills, skillsLocked } from "@/lib/skills-lock";

const upload = z.object({
  name: z.string().min(1).max(300),
  originalName: z.string().max(160).optional(),
  type: z.string().max(80).default(""),
  size: z.number().int().min(0).max(50 * 1024 * 1024).default(0),
});

const qualification = z.object({
  id: z.string().max(80),
  name: z.string().max(160).default(""),
  issuer: z.string().max(160).default(""),
  completionDate: z.string().max(10).default(""),
  credentialUrl: z.string().max(500).default(""),
  uploads: z.array(upload).max(MAX_CERTIFICATE_UPLOADS).optional(),
  preset: z.string().max(10).optional(),
  level: z.string().max(80).optional(),
  status: z.string().max(20).optional(),
  scoreType: z.enum(["cgpa", "percentage", ""]).optional(),
  score: z.string().max(10).optional(),
  startDate: z.string().max(10).optional(),
});

const bodySchema = z.object({
  bio: z.string().max(2000).optional(),
  linkedinUrl: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  pinCode: z.string().max(10).optional(),
  emergencyPhone: z.string().max(20).optional(),
  emergencyName: z.string().max(120).optional(),
  emergencyRelation: z.string().max(40).optional(),
  // Indian numbers only, as in legacy (INT-40).
  emergencyCountryCode: z.literal("+91").optional(),
  secondPocName: z.string().max(120).optional(),
  secondPocRelation: z.string().max(40).optional(),
  secondPocPhone: z.string().max(20).optional(),
  secondPocCountryCode: z.string().regex(/^\+\d{1,4}$/).optional(),
  academics: z
    .object({
      qualificationLevel: z.string().max(40).optional(),
      institution: z.string().max(200).default(""),
      degree: z.string().max(120).default(""),
      branch: z.string().max(120).default(""),
      // Optional so an older cached client cannot blank what it never sent.
      startYear: z.string().max(4).optional(),
      yearOfGraduation: z.string().max(4).default(""),
      status: z.string().max(20).optional(),
      scoreType: z.enum(["cgpa", "percentage", ""]).optional(),
      cgpa: z.string().max(10).default(""),
      marksheetUploads: z.array(upload).max(MAX_MARKSHEETS).optional(),
      professional: z.array(qualification).max(20).optional(),
      certifications: z.array(qualification).max(20).optional(),
    })
    .optional(),
  skills: z.array(z.string().max(80)).max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} key skills.`).optional(),
  skillsWithRatings: z
    .array(z.object({ name: z.string().max(80), rating: z.enum(["Beginner", "Intermediate", "Advanced"]) }))
    .max(MAX_SKILLS, `Pick at most ${MAX_SKILLS} key skills.`)
    .optional(),
  experiences: z
    .array(
      z.object({
        id: z.string().max(80),
        type: z.string().max(40).default(""),
        company: z.string().max(160).default(""),
        role: z.string().max(160).default(""),
        from: z.string().max(10).default(""),
        to: z.string().max(10).default(""),
        current: z.boolean().default(false),
        description: z.string().max(4000).default(""),
      }),
    )
    .max(20)
    .optional(),
  languages: z
    .array(
      z.object({
        id: z.string().max(80),
        language: z.string().max(60),
        // "Conversational" is what an older cached client sends; it saves as basic.
        level: z.enum(["Native", "Professional", "Basic", "Conversational", ""]).transform((v) => (v === "Conversational" ? "Basic" : v)),
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
        id: z.string().max(80),
        activity: z.string().max(160),
        level: z.enum(["Beginner", "Intermediate", "Advanced", ""]),
        category: z.string().max(60).optional(),
        description: z.string().max(500).optional(),
      }),
    )
    // Room for blank rows, which are dropped; at most ten are kept (legacy).
    .max(MAX_EXTRACURRICULARS + 10)
    .optional(),
  locationTypes: z.array(z.string().max(20)).max(6).optional(),
  preferredLocations: z.array(z.string().max(120)).max(5).optional(),
  hasLaptop: z.boolean().nullable().optional(),
  openToWork: z.boolean().optional(),
  bank: z
    .object({
      accountHolderName: z.string().max(120).default(""),
      bankName: z.string().max(120).default(""),
      accountNumber: z.string().max(30).default(""),
      ifscCode: z.string().max(20).default(""),
      upiId: z.string().max(260).default(""),
    })
    .optional(),
  // Uploaded files only; a browser blob: URL is meaningless to anyone else.
  // Only our own upload endpoint; outside URLs are refused.
  // "" is what a form with no photo (or one restored from the stored avatar
  // before this field existed) sends; it means "no change", never an error.
  photoUrl: z.string().regex(/^(\/api\/intern\/avatar(\?.*)?)?$/).optional(),
  // Twelve digits on every save; the "never starts with 0 or 1" rule is a
  // submit check, so legacy rows holding such a number still save (INT-30).
  aadhaarNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{12}$/.test(v), "Aadhaar must be 12 digits")
    .optional(),
  panNumber: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "PAN must look like ABCDE1234F")
    .optional(),
  previewSummary: z.string().max(2000).optional(),
  ndaAccepted: z.boolean().optional(),
  /** "Complete & Submit": every step's rules apply, not just format checks. */
  final: z.boolean().optional(),
});

type Body = z.infer<typeof bodySchema>;

/** Keys that are not part of the profile an employer sees: saving only these
 *  (Settings bank form, open-to-work switch) never needs the full rules. */
const NON_PROFILE_KEYS = new Set<keyof Body>(["bank", "openToWork", "final"]);

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
  emergencyCountryCode: "The emergency contact must be an Indian (+91) number.",
  secondPocCountryCode: "Pick the country code for your second contact.",
  preferredLocations: "Pick at most 5 cities.",
  skills: `Pick at most ${MAX_SKILLS} key skills.`,
  skillsWithRatings: `Pick at most ${MAX_SKILLS} key skills.`,
  academics: "Some academic details are in the wrong format - check the Academics step.",
  experiences: "Some experience details are in the wrong format - check the Experience step.",
  languages: "Some language details are in the wrong format - check the Languages step.",
  extracurriculars: `Add at most ${MAX_EXTRACURRICULARS} activities.`,
};

function friendlyIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "Some details could not be saved. Check the form and try again.";
  if (issue.code === "custom") return issue.message;
  const field = String(issue.path[0] ?? "");
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

const conflict = (error: string, step: number, field: string) =>
  NextResponse.json({ error, step, fields: { [field]: error } }, { status: 409 });

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: friendlyIssue(parsed.error.issues[0]) }, { status: 400 });
  }
  const body = parsed.data;
  const input = body as Partial<OnboardingDraft>;

  // Impossible values are refused even on a draft save; completeness is not.
  const format = formatProblems(input);
  if (format) return NextResponse.json({ error: format }, { status: 400 });
  // Bank details are saved only in full - from Settings, or from the About Me
  // step (which leaves them out until they are complete).
  if (body.bank) {
    const bank = bankProblem(body.bank);
    if (bank) return NextResponse.json({ error: bank, step: 0 }, { status: 400 });
  }

  const db = getDb();
  // One account per identity document (legacy rule).
  for (const [col, value, label] of [
    [schema.internOnboarding.aadhaarNumber, body.aadhaarNumber, "Aadhaar"],
    [schema.internOnboarding.panNumber, body.panNumber, "PAN"],
  ] as const) {
    if (!value) continue;
    const [clash] = await db
      .select({ id: schema.internOnboarding.id })
      .from(schema.internOnboarding)
      .where(and(eq(col, value), ne(schema.internOnboarding.userId, session.uid)))
      .limit(1);
    if (clash) return conflict(`This ${label} number is already linked to another account.`, 0, label === "PAN" ? "panNumber" : "aadhaarNumber");
  }
  const [existing] = await db
    .select()
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);
  const saved = existing ? draftFromRecord(existing) : {};

  // Files (certificates, marksheets): only keys this intern uploaded (the
  // upload route names them after the uploader) or ones already on their
  // record. Anything else would let a profile point at someone else's document.
  if (body.academics) {
    const known = storedFileNames((existing?.extraData as Record<string, unknown> | undefined)?.academics);
    const own = ownUploadKey(session.uid);
    const files = [
      ...(body.academics.marksheetUploads ?? []),
      ...[...(body.academics.professional ?? []), ...(body.academics.certifications ?? [])].flatMap((r) => r.uploads ?? []),
    ];
    if (files.some((u) => !known.has(u.name) && !own.test(u.name))) {
      return NextResponse.json({ error: "A file did not upload properly - upload it again.", step: 1 }, { status: 400 });
    }
  }

  // Skills: the 7 cap and the lock apply to the list that is actually stored
  // (INT-03), which comes from `skillsWithRatings` when it is sent.
  const nextSkills = body.skills !== undefined || body.skillsWithRatings !== undefined ? skillsToStore(body) : null;
  if (nextSkills && nextSkills.length > MAX_SKILLS) {
    return NextResponse.json({ error: `Pick at most ${MAX_SKILLS} key skills.`, step: 3 }, { status: 400 });
  }
  if (nextSkills && existing) {
    const current = saved.skillsWithRatings ?? [];
    if (!sameRatedSkills(current, nextSkills) && (await skillsLocked(db, session.uid, existing.extraData))) {
      return conflict("Your skills are locked - your AI interview is based on them.", 3, "skills");
    }
  }

  const [docRow] = await db
    .select({
      pan: schema.internDocuments.panImageName,
      aadhaar: schema.internDocuments.aadhaarImageName,
      photo: schema.internDocuments.profilePhotoName,
    })
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, session.uid))
    .limit(1);
  const docs = { hasPanImage: Boolean(docRow?.pan), hasAadhaarImage: Boolean(docRow?.aadhaar), hasPhoto: Boolean(docRow?.photo) };

  // INT-04. A submitted profile is never overwritten by an incomplete one:
  // once the stored profile is onboarded (see `isOnboarded`), every save that
  // touches the profile goes through the full rules, exactly like the final
  // submit (legacy only wrote the server after every step validated). A
  // first-time intern's draft may still be saved part-way: that row is not
  // visible to employers, who only see scored, approved, open-to-work interns.
  const touchesProfile = (Object.keys(body) as (keyof Body)[]).some((k) => body[k] !== undefined && !NON_PROFILE_KEYS.has(k));
  const onboarded = isOnboarded(existing ?? null, docs);
  const fullCheck = Boolean(body.final) || (onboarded && touchesProfile);

  const [account] = await db
    .select({ countryCode: schema.users.countryCode, phoneNumber: schema.users.phoneNumber })
    .from(schema.users)
    .where(eq(schema.users.id, session.uid))
    .limit(1);

  if (fullCheck) {
    const base = emptyDraft();
    const full: OnboardingDraft = {
      ...base,
      ...saved,
      ...input,
      academics: { ...base.academics, ...saved.academics, ...body.academics },
      bank: body.bank ?? saved.bank ?? base.bank,
    };
    const failed = validateProfile(full, {
      ...docs,
      storedAadhaar: existing?.aadhaarNumber ?? "",
      // INT-39: the account's own number has to be a real one to submit.
      ownPhone: account?.phoneNumber ? { countryCode: account.countryCode || "+91", phoneNumber: account.phoneNumber } : null,
    });
    if (failed) {
      return NextResponse.json({ error: Object.values(failed.errors)[0], step: failed.step, fields: failed.errors }, { status: 400 });
    }
    if (account?.phoneNumber && (await employerHasPhone(db, account.countryCode || "+91", account.phoneNumber))) {
      return conflict("Your account number is already used by another account. Change it in Settings.", 0, "ownPhone");
    }
  }

  // INT-05 / INT-36: a new emergency number must not belong to anyone else.
  if (body.emergencyPhone) {
    const digits = body.emergencyPhone.replace(/\D/g, "");
    const before = (saved.emergencyPhone ?? "").replace(/\D/g, "");
    const beforeCode = saved.emergencyCountryCode || "+91";
    if (digits && (digits !== before || beforeCode !== "+91") && (await contactPhoneTaken(db, session.uid, "+91", digits))) {
      return conflict("This number is already in use on Findtern. Use a different emergency contact.", 0, "emergencyPhone");
    }
  }

  const previousExtra = (existing?.extraData ?? {}) as Record<string, unknown>;
  const stored = storedFromDraft(input, existing ?? null);
  const extraData = {
    ...previousExtra,
    ...stored.extraPatch,
    // First acceptance is the one that counts; it is never cleared by a later save.
    ...(body.ndaAccepted && !previousExtra.ndaAcceptedAt ? { ndaAcceptedAt: new Date().toISOString() } : {}),
    // Marks the profile as submitted, so later saves keep it complete (INT-04).
    ...(body.final && !previousExtra.profileSubmittedAt ? { profileSubmittedAt: new Date().toISOString() } : {}),
    // Emergency contact: the legacy keys, plus name/relation (admin already reads emergencyName).
    ...(body.emergencyPhone !== undefined ? { emergencyPhone: body.emergencyPhone.replace(/\D/g, "") || null } : {}),
    ...(body.emergencyPhone !== undefined || body.emergencyCountryCode !== undefined ? { emergencyCountryCode: "+91" } : {}),
    ...(body.emergencyName !== undefined ? { emergencyName: body.emergencyName.trim() || null } : {}),
    ...(body.emergencyRelation !== undefined ? { emergencyRelation: body.emergencyRelation.trim() || null } : {}),
    ...(body.secondPocName !== undefined ? { secondPocName: body.secondPocName.trim() || null } : {}),
    ...(body.secondPocRelation !== undefined ? { secondPocRelation: body.secondPocRelation.trim() || null } : {}),
    ...(body.secondPocPhone !== undefined ? { secondPocPhone: body.secondPocPhone.replace(/\D/g, "") || null } : {}),
    ...(body.secondPocCountryCode !== undefined ? { secondPocCountryCode: body.secondPocCountryCode } : {}),
    ...(body.openToWork !== undefined ? openToWorkPatch(body.openToWork, previousExtra) : {}),
    ...(body.photoUrl ? { photoUrl: body.photoUrl } : {}),
  };

  // Cities are for onsite or hybrid work only; a remote-only profile keeps
  // none (bug sheet 23 Oct), whatever an older client sends.
  const modes = body.locationTypes ? workModes(body.locationTypes) : existing?.locationTypes ?? [];
  const inPerson = modes.length === 0 || modes.includes("onsite") || modes.includes("hybrid");

  const values = {
    userId: session.uid,
    bio: body.bio ?? existing?.bio ?? null,
    linkedinUrl: body.linkedinUrl ?? existing?.linkedinUrl ?? null,
    city: body.city ?? existing?.city ?? null,
    state: body.state ?? existing?.state ?? null,
    pinCode: body.pinCode ?? existing?.pinCode ?? null,
    // Blank means "not given yet": stored as NULL, never "". Both columns are
    // UNIQUE, so a second "" would fail every later intern's save (INT-32).
    aadhaarNumber: body.aadhaarNumber || existing?.aadhaarNumber || null,
    panNumber: body.panNumber || existing?.panNumber || null,
    experienceJson: stored.experienceJson ?? existing?.experienceJson ?? [],
    previewSummary: body.previewSummary ?? existing?.previewSummary ?? null,
    skills: stored.skills ?? existing?.skills ?? [],
    locationTypes: modes,
    preferredLocations: inPerson ? (body.preferredLocations ?? existing?.preferredLocations ?? []) : [],
    hasLaptop: body.hasLaptop ?? existing?.hasLaptop ?? null,
    extraData,
    updatedAt: new Date(),
  };

  try {
    if (existing) {
      await db.update(schema.internOnboarding).set(values).where(eq(schema.internOnboarding.id, existing.id));
    } else {
      await db.insert(schema.internOnboarding).values(values);
    }
  } catch (err) {
    // Two accounts saving the same Aadhaar/PAN at once get past the check above.
    if ((err as { code?: string; cause?: { code?: string } }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") {
      return NextResponse.json({ error: "This Aadhaar or PAN number is already linked to another account.", step: 0 }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true, onboarded: onboarded || Boolean(body.final) });
}

/** Upload keys the store mints for this intern: `<uid prefix>.<random>.<ext>` (security/sign.ts). */
function ownUploadKey(uid: string): RegExp {
  const prefix = uid.replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "x";
  return new RegExp(`^${prefix}\\.[A-Za-z0-9_-]{20,32}\\.(jpg|png|webp|pdf)$`);
}
