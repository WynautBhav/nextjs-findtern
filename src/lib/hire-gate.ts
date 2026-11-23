import { desc, eq } from "drizzle-orm";

import { isProfileSubmittedComplete, profileDocsOf, type ProfileDocs } from "./admin/profile-state.ts";
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
  employer: "This candidate's profile is incomplete, so they can't be hired yet. Nothing has been charged. Try again once they have completed it.",
} as const;

/** The company-side wording naming the blocking candidate (initials only: names stay hidden until the hire), for a cart of several. */
export function employerIncompleteMessage(candidate?: string | null): string {
  const who = candidate?.trim();
  return who
    ? `${who}'s profile is incomplete, so they can't be hired yet. Nothing has been charged. Try again once they have completed it, or remove them from this order.`
    : PROFILE_INCOMPLETE_MESSAGE.employer;
}

/** Which payable lines the gate covers: every NEW hire, internship or full-time. A due month is a hire that already happened. */
export function hireGateLines<T extends { due?: unknown }>(lines: T[]): T[] {
  return lines.filter((l) => !l.due);
}

export type HireGateDecision = { ok: true } | { ok: false; missing: string[] };

/** The 409 body a route answers with. `missing` (field ids, never values) is for the candidate's own screen only. */
export function profileIncompleteBody(who: keyof typeof PROFILE_INCOMPLETE_MESSAGE, missing: string[], candidate?: string | null): { error: string; code: typeof PROFILE_INCOMPLETE_CODE; missing?: string[] } {
  return { error: who === "employer" ? employerIncompleteMessage(candidate) : PROFILE_INCOMPLETE_MESSAGE[who], code: PROFILE_INCOMPLETE_CODE, ...(who === "intern" ? { missing } : {}) };
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
  const ctx = { ...docs, storedAadhaar: row.aadhaarNumber ?? "" };
  for (const step of VALIDATED_STEPS) out.push(...Object.keys(validateStep(draft, step, ctx)));
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
  const [[row], [doc], [membership]] = await Promise.all([
    db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, internId)).orderBy(desc(schema.internOnboarding.createdAt)).limit(1),
    db
      .select({ photo: schema.internDocuments.profilePhotoName, pan: schema.internDocuments.panImageName, aadhaar: schema.internDocuments.aadhaarImageName })
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, internId))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1),
    db
      .select({ status: schema.collegeMemberships.status, verifiedBy: schema.collegeMemberships.verifiedBy, leftAt: schema.collegeMemberships.leftAt })
      .from(schema.collegeMemberships)
      .where(eq(schema.collegeMemberships.userId, internId))
      .limit(1),
  ]);
  return hireGateDecision(row, profileDocsOf(doc, membership));
}
