import { draftFromRecord, emptyDraft, validateProfile, type OnboardingLike } from "../onboarding.ts";

/** Whether the files that "Complete & Submit" needs are on file. */
export type ProfileDocs = { hasPhoto: boolean; hasPanImage: boolean; hasAadhaarImage: boolean };

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
  return validateProfile({ ...emptyDraft(), ...draftFromRecord(row) }, docs) === null;
}
