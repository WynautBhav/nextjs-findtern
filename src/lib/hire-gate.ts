import { desc, eq } from "drizzle-orm";

import { isProfileSubmittedComplete, type ProfileDocs } from "./admin/profile-state.ts";
import { draftFromRecord, emptyDraft, validateStep, VALIDATED_STEPS, type OnboardingLike } from "./onboarding.ts";

/**
 * The hire gate: an intern whose profile is not submitted and complete cannot be hired. It is checked where no money has
 * moved yet (the intern accepting an offer, the employer opening an order, the waiver branch included) and never at
 * settlement, because by then the payment has been taken. The rule is the one the admin screens already show
 * (`isProfileSubmittedComplete`); this file only adds the 409 wording and the list of what is missing.
 */

export const PROFILE_INCOMPLETE_CODE = "PROFILE_INCOMPLETE";

export const PROFILE_INCOMPLETE_MESSAGE = {
  intern: "Complete your profile before you accept an offer. Open Profile, fill in every required step and submit it.",
  employer: "This candidate's profile is incomplete, so they can't be hired yet. Findtern has asked them to finish it. Try again once they have.",
} as const;

export type HireGateDecision = { ok: true } | { ok: false; missing: string[] };

/** The 409 body a route answers with. `missing` (field ids, never values) is for the candidate's own screen only. */
export function profileIncompleteBody(who: keyof typeof PROFILE_INCOMPLETE_MESSAGE, missing: string[]): { error: string; code: typeof PROFILE_INCOMPLETE_CODE; missing?: string[] } {
  return { error: PROFILE_INCOMPLETE_MESSAGE[who], code: PROFILE_INCOMPLETE_CODE, ...(who === "intern" ? { missing } : {}) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Field ids that fail across every step (not only the first failing step), plus the submit and languages markers. */
function missingFields(row: OnboardingLike | null | undefined, docs: ProfileDocs): string[] {
  if (!row) return ["profile"];
  const extra = isRecord(row.extraData) ? row.extraData : {};
  const out: string[] = [];
  if (!(typeof extra.profileSubmittedAt === "string" && extra.profileSubmittedAt !== "")) out.push("profileSubmittedAt");
  if (!Array.isArray(extra.languages) || extra.languages.length === 0) out.push("languages");
  const draft = { ...emptyDraft(), ...draftFromRecord(row) };
  for (const step of VALIDATED_STEPS) out.push(...Object.keys(validateStep(draft, step, docs)));
  return out;
}

/**
 * Whether the profile may be hired. Pure. Legacy rows that carry a Findtern score or an interview rating count as
 * submitted (inside `isProfileSubmittedComplete`), so a pre-launch hired intern is judged by the same rule as the admin list.
 */
export function hireGateDecision(row: OnboardingLike | null | undefined, docs: ProfileDocs): HireGateDecision {
  if (isProfileSubmittedComplete(row, docs)) return { ok: true };
  const missing = missingFields(row, docs);
  return { ok: false, missing: missing.length > 0 ? missing : ["profile"] };
}

type Db = Pick<ReturnType<typeof import("@/lib/db").getDb>, "select">;

/** The latest onboarding row and latest documents row of the intern (the same "latest wins" as the admin list). */
export async function profileCompleteForHire(db: Db, internId: string): Promise<HireGateDecision> {
  // Imported here so the pure rule above runs under node:test, which has no `@/` alias.
  const { schema } = await import("@/lib/db");
  const [[row], [doc]] = await Promise.all([
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, internId)).orderBy(desc(schema.internOnboarding.createdAt)).limit(1),
    db
      .select({ photo: schema.internDocuments.profilePhotoName, pan: schema.internDocuments.panImageName, aadhaar: schema.internDocuments.aadhaarImageName })
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, internId))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1),
  ]);
  return hireGateDecision(row, { hasPhoto: Boolean(doc?.photo), hasPanImage: Boolean(doc?.pan), hasAadhaarImage: Boolean(doc?.aadhaar) });
}
