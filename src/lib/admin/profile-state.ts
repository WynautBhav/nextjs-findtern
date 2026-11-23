import { isCodeVerifiedMembership } from "../intern-account.ts";
import { draftFromRecord, emptyDraft, validateProfile, type OnboardingLike } from "../onboarding.ts";

/**
 * Whether the files that "Complete & Submit" needs are on file, and whether a College account has joined its college with a
 * verified code (without it every College account intern failed the hire gate, 23 Nov).
 */
export type ProfileDocs = { hasPhoto: boolean; hasPanImage: boolean; hasAadhaarImage: boolean; collegeVerified?: boolean };

/** The one way to build ProfileDocs from an intern's latest documents row and college membership row. */
export function profileDocsOf(
  doc: { photo?: string | null; pan?: string | null; aadhaar?: string | null } | null | undefined,
  membership: { status: string; verifiedBy: string | null; leftAt?: Date | null } | null | undefined,
): ProfileDocs {
  return { hasPhoto: Boolean(doc?.photo), hasPanImage: Boolean(doc?.pan), hasAadhaarImage: Boolean(doc?.aadhaar), collegeVerified: isCodeVerifiedMembership(membership) };
}

/**
 * A profile counts as completed for admin only when the intern has submitted it
 * AND every required field of every onboarding step passes the same rules as
 * "Complete & Submit" (`validateProfile`). Optional fields (bio, LinkedIn,
 * experience, Aadhaar image) do not block. Pre-launch rows that already carry a
 * Findtern score or an interview rating count as submitted, as in `isOnboarded`.
 * `ownPhone` is left out of the context: it is the account's number, not a profile field.
 */
export function isProfileSubmittedComplete(row: OnboardingLike | null | undefined, docs: ProfileDocs): boolean {
  if (!row) return false;
  const extra = row.extraData && typeof row.extraData === "object" && !Array.isArray(row.extraData) ? (row.extraData as Record<string, unknown>) : {};
  const submitted = typeof extra.profileSubmittedAt === "string" && extra.profileSubmittedAt !== "";
  const ratings = extra.ratings && typeof extra.ratings === "object" ? (extra.ratings as Record<string, unknown>) : {};
  const scored = Number(extra.findternScore) > 0 || Number(ratings.interview) > 0;
  if (!submitted && !scored) return false;
  // The form pre-fills Hindi and English when none are stored, so "passes the form" alone would count an untouched step.
  if (!Array.isArray(extra.languages) || extra.languages.length === 0) return false;
  // The number on file is not re-judged (a legacy Aadhaar starting 0 or 1), exactly as the final submit does (INT-30).
  return validateProfile({ ...emptyDraft(), ...draftFromRecord(row) }, { ...docs, storedAadhaar: row.aadhaarNumber ?? "" }) === null;
}
